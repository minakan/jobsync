# ==========================================
# JobSync Backend — 本番用 Dockerfile (uv / multi-stage)
# ==========================================

# ── Stage 1: 依存関係ビルド ───────────────────────────────────────────────────
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

COPY pyproject.toml ./

# 本番依存関係のみインストール（dev extras を除外）
RUN uv sync --no-install-project --no-dev


# ── Stage 2: ランタイム ───────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# セキュリティ: non-root ユーザー
RUN useradd --create-home --shell /bin/bash appuser

WORKDIR /app

# 仮想環境をビルドステージからコピー
COPY --from=builder /app/.venv /app/.venv

# アプリコードをコピー
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# non-root ユーザーに所有権移譲
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
