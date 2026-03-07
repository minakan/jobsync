# JobSync 🎯

就活管理自動化アプリ — メール連携型スケジュール自動登録サービス

## 技術スタック

| レイヤー | 技術 |
|---|---|
| モバイル | React Native + Expo 0.76+ |
| バックエンド | Python FastAPI 0.115+ |
| AI | OpenAI GPT-4o |
| DB | PostgreSQL 16 + Redis 7 |
| インフラ | AWS ECS Fargate |

## ディレクトリ構成

```
jobsync/
├── backend/          # FastAPI バックエンド
├── mobile/           # React Native アプリ
├── .github/          # CI/CD (GitHub Actions)
├── AGENTS.md         # Codex エージェント設定
└── docker-compose.yml
```

## 開発開始

```bash
# 環境変数設定
cp backend/.env.example backend/.env

# ローカル環境起動
docker-compose up -d

# DBマイグレーション
docker-compose exec api alembic upgrade head

# API確認
open http://localhost:8000/docs

# React Native起動
cd mobile && npm install && npx expo start
```

## 実装優先順位

| 優先度 | 機能 | 状態 |
|---|---|---|
| P0 | バックエンド初期セットアップ | 🔲 未着手 |
| P0 | DBモデル・マイグレーション | 🔲 未着手 |
| P0 | Gmail OAuth2連携 | 🔲 未着手 |
| P0 | AIメール解析エンジン | 🔲 未着手 |
| P1 | スケジュール・企業管理API | 🔲 未着手 |
| P1 | ホーム画面 (React Native) | 🔲 未着手 |
| P1 | プッシュ通知・リマインダー | 🔲 未着手 |
| P2 | テスト・CI/CD | 🔲 未着手 |
