# Mailgun Inbound E2E Manual Test

## 前提
- `backend/.env` に `MAILGUN_API_KEY` / `MAILGUN_DOMAIN` / `MAILGUN_WEBHOOK_SIGNING_KEY` が設定済み
- Mailgun Route の受信先ドメインが `mail.code-peng.com`
- 確認用ユーザーの `forwarding_email` が発行済み（例: `u_xxxxxxxx@mail.code-peng.com`）

## 1. コンテナ起動
```bash
docker-compose up -d
```
確認方法:
- `docker-compose ps` で `api`, `db`, `redis`, `celery_worker` が `Up` になっている

## 2. マイグレーション適用
```bash
docker-compose exec api alembic upgrade head
```
確認方法:
- 出力の末尾に `Running upgrade ... -> ...` が表示され、エラー終了しない

## 3. モバイル起動
```bash
./start-mobile.sh
```
確認方法:
- Expo Dev Server が起動し、QRコードまたは接続URLが表示される

## 4. localtunnel 起動
```bash
npx localtunnel --port 8000
```
確認方法:
- `https://xxxx-xxxx-xxxx.loca.lt` の公開URLが表示される

## 5. Mailgun Route の webhook URL 更新
Mailgun Console の Route アクション先を以下に更新:
`https://<localtunnel-url>/api/v1/emails/inbound`

確認方法:
- Route 保存後、テスト送信先が最新URLに変わっている

## 6. Mailgun API からテストメール送信
```bash
curl -s --user "api:${MAILGUN_API_KEY}" \
  "https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages" \
  -F from="Mailgun E2E <postmaster@${MAILGUN_DOMAIN}>" \
  -F to="test@mail.code-peng.com" \
  -F subject="E2E inbound test" \
  -F text="E2E inbound flow test body"
```
確認方法:
- レスポンス JSON に `id` と `message`（Queued. Thank you.）が含まれる

## 7. Backend / Celery ログ確認
```bash
docker-compose logs -f api celery_worker
```
確認方法:
- `POST /api/v1/emails/inbound` が `200`
- Celery 側で `process_inbound_email_task` が `succeeded` または `processed` 状態
- 失敗時は retry ログ (`Retrying inbound email processing`) が出る

## 8. DB 保存確認（API）
```bash
curl -s "http://localhost:8000/api/v1/emails" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```
確認方法:
- レスポンスに送信した `subject` / `sender` / `message_id` を持つメールが含まれる
- 就活関連判定メールなら、関連 `company` / `schedule` が作成されている

