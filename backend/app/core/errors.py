from __future__ import annotations

from fastapi import HTTPException


class APIError(HTTPException):
    """HTTPエラーを統一レスポンス形式で返すための例外。"""

    def __init__(self, status_code: int, detail: str, code: str) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.code = code
