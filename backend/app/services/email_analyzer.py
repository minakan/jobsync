from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from html import unescape
from typing import Protocol, TypedDict
from zoneinfo import ZoneInfo

from openai import AsyncOpenAI, OpenAIError
from pydantic import BaseModel, Field, ValidationError, field_validator

from app.core.config import settings
from app.core.logger import logger

MAIL_ANALYSIS_SYSTEM_PROMPT = """
あなたは日本の就活メール解析エンジンです。必ず JSON オブジェクトのみを返してください。

判定要件:
- is_job_related: 就活関連メールなら true
- email_type: es_deadline/interview/exam/event/result/offer/other_job/not_job のいずれか
- company_name: 企業名を正規化し、"(株)" や "（株）" は "株式会社" に変換
- extracted_events: 複数イベントを抽出可能（type/title/datetime/description/url/confidence）
- confidence: 0.0 から 1.0

日時要件:
- 相対表現（例: 来週月曜、3日後）を受信日時基準で絶対日時へ変換
- datetime は Asia/Tokyo (JST, +09:00) の ISO 8601 形式

就活無関係の場合:
- is_job_related=false
- email_type=not_job
- extracted_events=[]
"""

JST = ZoneInfo("Asia/Tokyo")


class ExtractedEvent(BaseModel):
    type: str
    title: str
    datetime: str | None
    description: str
    url: str | None
    confidence: float

    @field_validator("confidence")
    @classmethod
    def clamp_confidence(cls, value: float) -> float:
        return min(1.0, max(0.0, value))


class EmailAnalysisResult(BaseModel):
    is_job_related: bool
    confidence: float
    email_type: str
    company_name: str | None
    extracted_events: list[ExtractedEvent] = Field(default_factory=list)
    company_info: dict[str, object] = Field(default_factory=dict)

    @field_validator("confidence")
    @classmethod
    def clamp_confidence(cls, value: float) -> float:
        return min(1.0, max(0.0, value))


class EmailPayload(TypedDict, total=False):
    subject: str
    body: str
    sender: str
    received_at: datetime


class _ResponseMessageLike(Protocol):
    content: str | list[object] | None


class _ResponseChoiceLike(Protocol):
    message: _ResponseMessageLike


class _ChatCompletionLike(Protocol):
    choices: list[_ResponseChoiceLike]


class EmailAnalyzer:
    job_keywords = [
        "エントリーシート",
        "ES",
        "面接",
        "選考",
        "内定",
        "インターン",
        "説明会",
        "採用",
        "リクルート",
        "就職",
        "書類選考",
        "一次面接",
        "最終面接",
        "内々定",
        "選考結果",
    ]

    _job_sender_keywords = [
        "recruit",
        "hr",
        "mynavi",
        "rikunabi",
        "wantedly",
        "hrmos",
    ]
    _spam_keywords = [
        "sale",
        "off",
        "coupon",
        "unsubscribe",
        "セール",
        "クーポン",
        "プロモーション",
        "キャンペーン",
        "広告",
        "メルマガ",
    ]
    _url_pattern = re.compile(r"https?://[^\s<>()]+")
    _html_tag_pattern = re.compile(r"(?s)<[^>]+>")
    _html_ignored_pattern = re.compile(r"(?is)<(script|style).*?>.*?</\1>")
    _multi_newline_pattern = re.compile(r"\n{3,}")
    _ascii_space_pattern = re.compile(r"[ \t\f\v]+")

    def __init__(self, client: AsyncOpenAI | None = None) -> None:
        self._client = client or AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    @staticmethod
    def _contains_ascii_keyword(text: str, keyword: str) -> bool:
        pattern = rf"(?<![a-z0-9]){re.escape(keyword)}(?![a-z0-9])"
        return re.search(pattern, text) is not None

    def _quick_filter(self, subject: str, sender: str) -> bool:
        """ルールベース高速フィルタ（API呼び出し節約）"""
        normalized = f"{subject} {sender}".lower()
        for keyword in self.job_keywords:
            token = keyword.lower()
            if token.isascii():
                if self._contains_ascii_keyword(normalized, token):
                    return True
                continue
            if token in normalized:
                return True

        if any(spam_token in normalized for spam_token in self._spam_keywords):
            return False

        return any(sender_token in normalized for sender_token in self._job_sender_keywords)

    def _clean_body(self, body: str) -> str:
        """HTML除去・URL短縮・改行正規化（最大3000文字）"""
        if not body:
            return ""

        cleaned = body.replace("\r\n", "\n").replace("\r", "\n")
        cleaned = unescape(cleaned)
        cleaned = self._html_ignored_pattern.sub(" ", cleaned)
        cleaned = self._html_tag_pattern.sub(" ", cleaned)
        cleaned = self._url_pattern.sub("<URL>", cleaned)
        cleaned = self._ascii_space_pattern.sub(" ", cleaned)
        cleaned = "\n".join(line.strip() for line in cleaned.split("\n"))
        cleaned = self._multi_newline_pattern.sub("\n\n", cleaned)
        return cleaned.strip()[:3000]

    @staticmethod
    def _to_jst(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            return dt.replace(tzinfo=JST)
        return dt.astimezone(JST)

    @staticmethod
    def _coerce_text(value: object) -> str:
        return value if isinstance(value, str) else ""

    @staticmethod
    def _coerce_datetime(value: object) -> datetime:
        if isinstance(value, datetime):
            return value
        return datetime.now(tz=JST)

    @staticmethod
    def _normalize_company_name(name: str | None) -> str | None:
        if name is None:
            return None
        normalized = name.strip()
        if not normalized:
            return None

        replacements = {
            "(株)": "株式会社",
            "（株）": "株式会社",
            "㈱": "株式会社",
            "(有)": "有限会社",
            "（有）": "有限会社",
            "㈲": "有限会社",
        }
        for before, after in replacements.items():
            normalized = normalized.replace(before, after)
        return normalized

    @staticmethod
    def _extract_response_content(response: _ChatCompletionLike) -> str:
        try:
            choices = response.choices
            message = choices[0].message
            content = message.content
        except (AttributeError, IndexError, TypeError):
            return "{}"

        if isinstance(content, str):
            return content

        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str):
                        parts.append(text)
                else:
                    text = getattr(item, "text", None)
                    if isinstance(text, str):
                        parts.append(text)
            return "\n".join(parts) if parts else "{}"

        return "{}"

    def _result_from_payload(self, payload: dict[str, object]) -> EmailAnalysisResult:
        company_name_raw = payload.get("company_name")
        company_name = (
            self._normalize_company_name(company_name_raw)
            if isinstance(company_name_raw, str)
            else None
        )

        company_info_raw = payload.get("company_info")
        company_info: dict[str, object] = company_info_raw if isinstance(company_info_raw, dict) else {}
        if company_name is not None:
            normalized_name = self._normalize_company_name(company_info.get("name"))
            company_info["name"] = normalized_name if normalized_name is not None else company_name

        normalized_payload: dict[str, object] = {
            "is_job_related": payload.get("is_job_related", False),
            "confidence": payload.get("confidence", 0.5),
            "email_type": payload.get("email_type", "other_job"),
            "company_name": company_name,
            "extracted_events": payload.get("extracted_events", []),
            "company_info": company_info,
        }
        return EmailAnalysisResult.model_validate(normalized_payload)

    @staticmethod
    def _non_job_result() -> EmailAnalysisResult:
        return EmailAnalysisResult(
            is_job_related=False,
            confidence=0.95,
            email_type="not_job",
            company_name=None,
            extracted_events=[],
            company_info={},
        )

    @staticmethod
    def _fallback_result(is_likely_job: bool) -> EmailAnalysisResult:
        return EmailAnalysisResult(
            is_job_related=is_likely_job,
            confidence=0.5,
            email_type="other_job" if is_likely_job else "not_job",
            company_name=None,
            extracted_events=[],
            company_info={},
        )

    def _build_user_prompt(
        self,
        subject: str,
        sender: str,
        body: str,
        received_at_jst: datetime,
    ) -> str:
        return (
            "以下のメールを解析し、JSONオブジェクトのみを返してください。\n"
            "受信日時を基準に相対日時を絶対日時へ変換してください。\n"
            "メール本文が長い場合も、重要情報を優先して抽出してください。\n\n"
            "出力JSONスキーマ:\n"
            "{"
            '"is_job_related": bool,'
            '"confidence": float,'
            '"email_type": str,'
            '"company_name": str | null,'
            '"extracted_events": list,'
            '"company_info": object'
            "}\n\n"
            f"受信日時(JST): {received_at_jst.isoformat()}\n"
            f"件名: {subject}\n"
            f"送信者: {sender}\n"
            f"本文:\n{body}"
        )

    async def analyze(
        self,
        subject: str,
        body: str,
        sender: str,
        received_at: datetime,
    ) -> EmailAnalysisResult:
        """GPT-4oでメール解析。quick_filterで除外 → OpenAI API呼び出し"""
        if not self._quick_filter(subject=subject, sender=sender):
            return self._non_job_result()

        cleaned_body = self._clean_body(body)
        received_at_jst = self._to_jst(received_at)
        user_prompt = self._build_user_prompt(
            subject=subject,
            sender=sender,
            body=cleaned_body,
            received_at_jst=received_at_jst,
        )

        try:
            response = await self._client.chat.completions.create(
                model="gpt-4o",
                temperature=0.1,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": MAIL_ANALYSIS_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
            )
            content = self._extract_response_content(response)
            payload = json.loads(content)
            if not isinstance(payload, dict):
                raise ValueError("OpenAI response must be a JSON object")
            return self._result_from_payload(payload)
        except (OpenAIError, ValidationError, ValueError, TypeError, json.JSONDecodeError) as exc:
            logger.exception("OpenAI email analysis failed: %s", exc)
            return self._fallback_result(is_likely_job=True)

    async def analyze_batch(self, emails: list[EmailPayload]) -> list[EmailAnalysisResult]:
        """10件ずつasyncio.gather()で並列処理"""
        results: list[EmailAnalysisResult] = []

        for start in range(0, len(emails), 10):
            chunk = emails[start : start + 10]
            tasks = [
                self.analyze(
                    subject=self._coerce_text(email.get("subject")),
                    body=self._coerce_text(email.get("body")),
                    sender=self._coerce_text(email.get("sender")),
                    received_at=self._coerce_datetime(email.get("received_at")),
                )
                for email in chunk
            ]
            chunk_results = await asyncio.gather(*tasks, return_exceptions=True)

            for email, chunk_result in zip(chunk, chunk_results, strict=True):
                if isinstance(chunk_result, Exception):
                    subject = self._coerce_text(email.get("subject"))
                    sender = self._coerce_text(email.get("sender"))
                    logger.exception("Batch email analysis failed: %s", chunk_result)
                    results.append(
                        self._fallback_result(
                            is_likely_job=self._quick_filter(subject=subject, sender=sender)
                        )
                    )
                else:
                    results.append(chunk_result)

        return results
