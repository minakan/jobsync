from __future__ import annotations

import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from openai import OpenAIError

from app.services.email_analyzer import EmailAnalyzer


def _mock_response(payload: dict[str, object]) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=json.dumps(payload, ensure_ascii=False)),
            )
        ]
    )


def _build_analyzer(payload: dict[str, object]) -> tuple[EmailAnalyzer, MagicMock]:
    client = MagicMock()
    client.chat = MagicMock()
    client.chat.completions = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=_mock_response(payload))
    return EmailAnalyzer(client=client), client


@pytest.mark.anyio
async def test_es_deadline_extraction() -> None:
    analyzer, _ = _build_analyzer(
        {
            "is_job_related": True,
            "confidence": 0.93,
            "email_type": "es_deadline",
            "company_name": "株式会社サンプル",
            "extracted_events": [
                {
                    "type": "es_deadline",
                    "title": "ES提出締切",
                    "datetime": "2026-03-10T23:59:00+09:00",
                    "description": "エントリーシート締切",
                    "url": "https://example.com/es",
                    "confidence": 0.94,
                }
            ],
            "company_info": {"name": "株式会社サンプル"},
        }
    )

    result = await analyzer.analyze(
        subject="ES提出締切のご案内",
        body="3/10 23:59までにESをご提出ください。",
        sender="recruit@example.co.jp",
        received_at=datetime(2026, 3, 1, 10, 0, tzinfo=UTC),
    )

    assert result.is_job_related is True
    assert result.email_type == "es_deadline"
    assert result.company_name == "株式会社サンプル"
    assert len(result.extracted_events) == 1
    assert result.extracted_events[0].datetime == "2026-03-10T23:59:00+09:00"


@pytest.mark.anyio
async def test_interview_extraction() -> None:
    analyzer, _ = _build_analyzer(
        {
            "is_job_related": True,
            "confidence": 0.91,
            "email_type": "interview",
            "company_name": "株式会社テック",
            "extracted_events": [
                {
                    "type": "interview",
                    "title": "一次面接",
                    "datetime": "2026-03-14T13:00:00+09:00",
                    "description": "オンライン一次面接",
                    "url": None,
                    "confidence": 0.92,
                }
            ],
            "company_info": {"name": "株式会社テック"},
        }
    )

    result = await analyzer.analyze(
        subject="一次面接日程のご連絡",
        body="3月14日13:00から一次面接を実施します。",
        sender="hr@tech.co.jp",
        received_at=datetime(2026, 3, 7, 9, 0, tzinfo=UTC),
    )

    assert result.is_job_related is True
    assert result.email_type == "interview"
    assert result.extracted_events[0].title == "一次面接"


@pytest.mark.anyio
async def test_non_job_email() -> None:
    analyzer, client = _build_analyzer({})

    result = await analyzer.analyze(
        subject="週末セールのお知らせ",
        body="クーポンコードで50%OFF",
        sender="news@shopping.example",
        received_at=datetime(2026, 3, 7, 9, 0, tzinfo=UTC),
    )

    assert result.is_job_related is False
    assert result.email_type == "not_job"
    assert result.extracted_events == []
    client.chat.completions.create.assert_not_awaited()


@pytest.mark.anyio
async def test_multiple_events() -> None:
    analyzer, _ = _build_analyzer(
        {
            "is_job_related": True,
            "confidence": 0.9,
            "email_type": "event",
            "company_name": "株式会社ジョブシンク",
            "extracted_events": [
                {
                    "type": "event",
                    "title": "会社説明会",
                    "datetime": "2026-03-12T10:00:00+09:00",
                    "description": "オンライン説明会",
                    "url": "https://example.com/info",
                    "confidence": 0.88,
                },
                {
                    "type": "interview",
                    "title": "一次面接",
                    "datetime": "2026-03-15T15:00:00+09:00",
                    "description": "対面面接",
                    "url": None,
                    "confidence": 0.86,
                },
            ],
            "company_info": {"name": "株式会社ジョブシンク"},
        }
    )

    result = await analyzer.analyze(
        subject="説明会および一次面接のご案内",
        body="説明会と面接の日程をお知らせします。",
        sender="recruit@jobsync.co.jp",
        received_at=datetime(2026, 3, 7, 9, 0, tzinfo=UTC),
    )

    assert len(result.extracted_events) == 2
    assert result.extracted_events[0].type == "event"
    assert result.extracted_events[1].type == "interview"


@pytest.mark.anyio
async def test_relative_date_resolution() -> None:
    analyzer, client = _build_analyzer(
        {
            "is_job_related": True,
            "confidence": 0.89,
            "email_type": "interview",
            "company_name": "株式会社相対日付",
            "extracted_events": [
                {
                    "type": "interview",
                    "title": "面接",
                    "datetime": "2026-03-09T10:00:00+09:00",
                    "description": "来週月曜の面接",
                    "url": None,
                    "confidence": 0.88,
                }
            ],
            "company_info": {"name": "株式会社相対日付"},
        }
    )

    result = await analyzer.analyze(
        subject="来週月曜の面接について",
        body="面接は来週月曜の10時開始です。",
        sender="hr@relative.co.jp",
        received_at=datetime(2026, 3, 2, 0, 0, tzinfo=UTC),
    )

    assert result.extracted_events[0].datetime == "2026-03-09T10:00:00+09:00"

    call_kwargs = client.chat.completions.create.await_args.kwargs
    assert call_kwargs["temperature"] == 0.1
    assert call_kwargs["response_format"] == {"type": "json_object"}
    user_prompt = call_kwargs["messages"][1]["content"]
    assert "来週月曜" in user_prompt
    assert "2026-03-02T09:00:00+09:00" in user_prompt


def test_quick_filter_blocks_spam() -> None:
    analyzer = EmailAnalyzer(client=MagicMock())
    assert analyzer._quick_filter("【50%OFF】春の大セール", "news@shopping.example") is False


@pytest.mark.anyio
async def test_company_name_normalization() -> None:
    analyzer, _ = _build_analyzer(
        {
            "is_job_related": True,
            "confidence": 0.87,
            "email_type": "result",
            "company_name": "(株)テストカンパニー",
            "extracted_events": [],
            "company_info": {"name": "(株)テストカンパニー"},
        }
    )

    result = await analyzer.analyze(
        subject="選考結果のご連絡",
        body="選考結果をお知らせします。",
        sender="recruit@test.co.jp",
        received_at=datetime(2026, 3, 7, 9, 0, tzinfo=UTC),
    )

    assert result.company_name == "株式会社テストカンパニー"
    assert result.company_info["name"] == "株式会社テストカンパニー"


@pytest.mark.anyio
async def test_api_error_fallback() -> None:
    client = MagicMock()
    client.chat = MagicMock()
    client.chat.completions = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=OpenAIError("rate limited"))
    analyzer = EmailAnalyzer(client=client)

    result = await analyzer.analyze(
        subject="最終面接のご案内",
        body="最終面接を実施します。",
        sender="hr@sample.co.jp",
        received_at=datetime(2026, 3, 7, 9, 0, tzinfo=UTC),
    )

    assert result.is_job_related is True
    assert result.confidence == 0.5
    assert result.email_type == "other_job"
    assert result.extracted_events == []
