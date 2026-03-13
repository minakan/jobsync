# AGENTS.md — JobSync プロジェクト設定

## プロジェクト概要
JobSyncは就活生向けのメール転送型スケジュール自動管理アプリ。
- バックエンド: Python FastAPI (`./backend`)
- モバイルアプリ: React Native + Expo SDK 54 (`./mobile`)
- AI: OpenAI API（日本語メール解析）
- メール受信: Mailgun Inbound Parse（ユーザーのGmailから転送）

---

## ブランチ戦略

### アクティブブランチ
| ブランチ | 役割 |
|---|---|
| `main` | 本番リリース用（直接コミット禁止） |
| `feature/companies-schedules-ui` | 現在の開発ベースブランチ |
| `feature/forwarding-address-backend` | 転送アーキテクチャ実装済み（最新） |

### 作業ルール（必ず守ること）
1. **作業開始前に対象ブランチを確認・チェックアウトする**
   ```bash
   git checkout <指定されたブランチ名>
   git status  # 現在のブランチを確認
   ```
2. **指示されたブランチ以外には絶対にコミットしない**
3. **変更が完了したら即座にコミット・プッシュする**
   ```bash
   git add -A
   git commit -m "feat: 変更内容の説明"
   git push origin <ブランチ名>
   ```
4. コミットメッセージは `feat:` / `fix:` / `chore:` / `refactor:` プレフィックスをつける
5. 1つのロジック単位を1コミットとする（複数ファイルにまたがってもよい）

---

## アーキテクチャ概要

### メール受信フロー
```
ユーザーのGmail
  → Gmail転送設定（ユーザーが手動設定）
  → u_{8char}@mail.code-peng.com（Mailgunドメイン）
  → Mailgun Inbound Parse Webhook
  → POST /api/v1/emails/inbound
  → process_inbound_email_task（Celery）
  → LLM解析 → DB保存（Email / Company / Schedule）
```

### Gmail転送確認メール自動処理
Gmailが転送設定時に送る確認メールをバックエンドが自動検知し、
確認URLをfetchして承認する（ユーザー操作不要）。

### 転送アドレス生成
- 形式: `u_{8文字ランダム英数字}@{FORWARDING_EMAIL_DOMAIN}`
- `GET /api/v1/users/me/forwarding-address` で初回生成・以降は同じアドレスを返す
- `app/core/forwarding.py` の `generate_forwarding_address()` を使用

---

## ディレクトリ構成

```
backend/
  app/
    api/v1/
      auth.py              # 認証（Google OAuth含む）
      companies.py         # 企業管理 CRUD
      emails.py            # Gmail OAuth連携・同期（既存ユーザー向け）
      inbound.py           # Mailgun webhookエンドポイント
      schedules.py         # 予定管理 CRUD
      users.py             # ユーザー情報・転送アドレス発行
      router.py            # ルーター集約
    core/
      config.py            # 環境変数（Settings）
      database.py          # AsyncSession
      forwarding.py        # 転送アドレス生成ユーティリティ
      mailgun.py           # Mailgun HMAC署名検証
      security.py          # JWT・暗号化
    models/
      user.py              # Userモデル（forwarding_email含む）
      email.py             # Emailモデル（message_id: nullable, length=512）
      company.py           # Companyモデル
      schedule.py          # Scheduleモデル
      email_connection.py  # Gmail OAuth情報
    schemas/               # Pydantic スキーマ
    services/
      email_analyzer.py    # OpenAI APIでメール解析
      gmail_service.py     # Gmail API操作
    tasks/
      celery_app.py            # Celeryアプリ設定
      email_sync_task.py       # Gmail同期Celeryタスク
      inbound_email_task.py    # 受信メール処理Celeryタスク
      reminder_task.py         # リマインダー通知タスク
  alembic/versions/
    bd484ad0b951_initial.py
    2c84c4b6a53a_add_company_status_history.py
    6d1a9e9de4f2_add_forwarding_email_to_users.py
    6f9f4a3c1a2b_rename_email_message_id_for_inbound.py  ← 最新
  tests/

mobile/src/
  app/
    (tabs)/
      index.tsx        # ホーム（メール一覧）
      companies.tsx    # 企業管理
      schedules.tsx    # 予定管理
      settings.tsx     # 転送アドレス表示・5ステップ設定ガイド
    auth/              # 認証画面
    _layout.tsx        # タブナビゲーション
  api/
    client.ts          # Axiosインスタンス
    auth.ts
    companies.ts
    emails.ts
    schedules.ts
    users.ts           # getForwardingAddress()
  stores/
    authStore.ts       # Zustand認証ストア
```

---

## コーディング規約

### Python (Backend)
- 型ヒント必須: すべての関数・メソッドに型アノテーションを付ける
- Pydantic使用: リクエスト/レスポンスの検証はPydanticスキーマのみ
- 非同期優先: DB操作・外部API呼び出しはすべて `async/await`
- **Celery呼び出し**: `async` ハンドラから `.delay()` を呼ぶ際は必ず `run_in_executor` でラップ
  ```python
  import asyncio
  from functools import partial

  loop = asyncio.get_event_loop()
  await loop.run_in_executor(None, partial(some_task.delay, arg))
  ```
- 例外処理: 広範なtry/catchは禁止。`HTTPException` を適切に使用する
- テスト: 新機能には必ずpytestテストを作成する（`tests/test_*.py`）
- DBアクセス: 必ず `user_id` フィルタを付ける（情報漏洩防止）
- OpenAI APIのエラーはログに残し、ユーザーにはフォールバック結果を返す

### TypeScript (Mobile)
- strict mode有効: `tsconfig.json` で `strict: true`
- `any` 禁止: `as any` は使用しない
- React Query: サーバー状態管理はすべてReact Queryで行う
- Zustand: クライアント状態管理はZustandのみ
- API呼び出し: `mobile/src/api/` 配下のAPIモジュール経由で行う（直接fetchしない）

---

## 環境変数（`backend/.env` に設定が必要）
```env
# Mailgun / 転送メール
MAILGUN_API_KEY=<MAILGUN_API_KEY>
MAILGUN_DOMAIN=mail.code-peng.com
MAILGUN_WEBHOOK_SIGNING_KEY=<MAILGUN_WEBHOOK_SIGNING_KEY>
FORWARDING_EMAIL_DOMAIN=mail.code-peng.com
```

---

## マイグレーション
```bash
# 最新まで適用
docker-compose exec api alembic upgrade head

# 新規マイグレーション作成
docker-compose exec api alembic revision --autogenerate -m "変更内容"
```

**マイグレーション作成時の注意:**
- `down_revision` は必ず現在の最新revisionを指定する
- 現在の最新revision: `6f9f4a3c1a2b`
- 作成後はチェーンが線形になっているか確認すること（branchは作らない）

---

## テスト実行
```bash
# Backend
cd backend && pytest -v

# Mobile
cd mobile && npx jest
```

---

## ローカル開発環境

```bash
# バックエンド起動（Docker）
docker-compose up -d
docker-compose exec api alembic upgrade head

# モバイル起動（Mac）
cd mobile && ./start-mobile.sh   # IPを自動設定してExpo起動

# localtunnel（iPhoneからのOAuth callback受け取り用、必要な場合のみ）
npx localtunnel --port 8000
```

**localtunnel利用時の注意:**
- URLはセッション毎に変わる（例: `https://wise-cities-sing.loca.lt`）
- URL変更後は `backend/.env` と `docker-compose.yml` の以下を更新し `docker-compose up -d` で再起動（`restart` は env_file を再読み込みしないため不可）
  - `GOOGLE_REDIRECT_URI`
  - `AUTH_GOOGLE_REDIRECT_URI`
  - `ALLOWED_ORIGINS`
- パスワード入力画面が出たらMacのパブリックIP（`curl ifconfig.me` で確認）を入力
