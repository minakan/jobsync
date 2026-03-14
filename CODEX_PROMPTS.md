# JobSync — Codex プロンプト集（次期開発フェーズ）

> **前提**: バックエンド（FastAPI）・モバイル（React Native Expo SDK 54）の基本構成、
> Gmail同期、Mailgun inbound webhook、企業/予定管理UIはすべて実装済み。
> 以下は次フェーズの機能追加プロンプトです。
>
> 作業前に必ず `AGENTS.md` を読み、コーディング規約・ブランチ戦略に従うこと。

---

## Prompt 1 — メール受信箱タブ（Email Inbox UI）

### ブランチ
```
git checkout -b feature/email-inbox-ui
```

### 背景
`GET /api/v1/emails` エンドポイントはすでに実装済みで、処理済みメール一覧を返す。
しかしモバイルには受信メール一覧を表示するUIがない。
このプロンプトでは、既存の5タブ構成にメール受信箱タブを追加する。

### 参照すべき既存ファイル
- `mobile/src/api/emails.ts` — `fetchEmails()` 関数（追加予定）
- `mobile/src/app/(tabs)/_layout.tsx` — タブ定義
- `mobile/src/app/(tabs)/companies.tsx` — FlatListとRefreshのパターン例
- `backend/app/schemas/email.py` — `EmailListItem`, `EmailListResponse`
- `backend/app/api/v1/emails.py` — `GET /api/v1/emails`（`limit`, `offset` クエリパラメータ）

### タスク一覧

#### 1. API層 (`mobile/src/api/emails.ts`)
- `fetchEmails(params?: { limit?: number; offset?: number })` 関数を追加
- レスポンス型 `EmailListItem` を `mobile/src/types/email.ts` に定義:
  ```typescript
  export interface EmailListItem {
    id: string;
    message_id: string;
    subject: string;
    sender: string;
    sender_email: string;
    received_at: string | null;  // ISO8601
    company_name: string | null;
  }
  export interface EmailListResponse {
    items: EmailListItem[];
  }
  ```
- React Query キー `emailQueryKeys.list` を定義

#### 2. メール受信箱タブ (`mobile/src/app/(tabs)/emails.tsx`)
- `emailQueryKeys.list` で `useInfiniteQuery` または `useQuery` を使って一覧取得
- `FlatList` でメール一覧を表示。各カードに以下を表示:
  - 件名（`subject`、1行省略）
  - 送信者名（`sender`）
  - 企業名タグ（`company_name` がある場合のみ、青バッジ）
  - 受信日時（`received_at` を `M月d日 HH:mm` フォーマット）
- 下pull-to-refreshで再取得（`onRefresh` + `refetch`）
- ロード中は `ActivityIndicator`、空リストは「メールがありません」テキスト
- `isLoading` エラー時は `Alert.alert` でエラー表示

#### 3. タブナビゲーションに追加 (`mobile/src/app/(tabs)/_layout.tsx`)
- 新タブを追加: `name="emails"`, アイコン `mail` (Expo `@expo/vector-icons/Ionicons`)
- ラベル: `メール`
- 既存の4タブ（ホーム・企業・予定・設定）の順序を崩さないこと

### 受け入れ条件
- [ ] メールタブを開くと処理済みメール一覧が表示される
- [ ] 企業名が特定できたメールには青いバッジが表示される
- [ ] pull-to-refreshで最新データを取得できる
- [ ] TypeScript エラーなし（`npx tsc --noEmit` が通る）

### 注意事項
- `any` 禁止。型は `mobile/src/types/email.ts` に定義した型を使うこと
- API呼び出しは `mobile/src/api/emails.ts` 経由のみ（直接fetchしない）
- スタイルは `StyleSheet.create` のみ使用（inline styleは避ける）

---

## Prompt 2 — 企業詳細・編集・削除（Company Detail Screen）

### ブランチ
```
git checkout -b feature/company-detail-ui
```

### 背景
企業一覧タブ（`companies.tsx`）では企業の追加はできるが、
ステータス変更・メモ編集・削除ができない。
`PATCH /api/v1/companies/{id}` と `DELETE /api/v1/companies/{id}` は実装済み。
このプロンプトでは企業カードをタップして詳細・編集できる画面を追加する。

### 参照すべき既存ファイル
- `mobile/src/app/(tabs)/companies.tsx` — 企業一覧・カードレンダリング
- `mobile/src/api/companies.ts` — `updateCompany()`, `deleteCompany()` を追加予定
- `mobile/src/types/company.ts` — `Company`, `CompanyStatus`
- `mobile/src/components/company/StatusBadge.tsx` — `STATUS_CONFIG`
- `backend/app/schemas/company.py` — `CompanyUpdate`, `CompanyResponse`

### タスク一覧

#### 1. API層 (`mobile/src/api/companies.ts`)
- `updateCompany(id: string, payload: UpdateCompanyPayload): Promise<Company>` を追加
  - `UpdateCompanyPayload = { status?: CompanyStatus; priority?: number; notes?: string }`
- `deleteCompany(id: string): Promise<void>` を追加

#### 2. 企業詳細モーダル or 画面
- 企業カードをタップすると `BottomSheet` スタイルのモーダルを表示（`Modal` コンポーネント使用）
- モーダル内に表示・編集できる項目:
  - 企業名（表示のみ）
  - ステータス選択（`CompanyStatus` の選択肢をボタン選択式で、`companies.tsx` の既存パターンを流用）
  - 優先度（1〜5のスライダーまたは数値ボタン）
  - メモ（`TextInput` multiline）
- **保存ボタン**: `updateCompany` を呼んで `companyQueryKeys.all` を invalidate
- **削除ボタン**: 確認 `Alert.alert` を出してから `deleteCompany` を呼ぶ。成功後モーダルを閉じてリスト更新
- ローディング中はボタンを `disabled` + `ActivityIndicator` 表示
- エラー時は `Alert.alert` でメッセージ表示

#### 3. 企業一覧 (`companies.tsx`) の更新
- `renderCompanyItem` で企業カードを `Pressable` で包み、タップで詳細モーダルを開く
- 選択中企業を `useState<Company | null>` で管理

### 受け入れ条件
- [ ] 企業カードをタップするとモーダルが開く
- [ ] ステータス変更・保存後に一覧が更新される
- [ ] 削除確認ダイアログが表示され、OKで削除される
- [ ] `PATCH` / `DELETE` API呼び出しが正しく行われる（Network logで確認）
- [ ] TypeScript エラーなし

### 注意事項
- 削除は不可逆操作なので確認ダイアログ必須（`Alert.alert` の2ボタン形式）
- DBアクセスはすべて `user_id` フィルタ済み（バックエンド実装済み）なので、フロント側での追加フィルタは不要

---

## Prompt 3 — スケジュール編集・削除（Schedule Edit/Delete）

### ブランチ
```
git checkout -b feature/schedule-edit-delete-ui
```

### 背景
予定タブ（`schedules.tsx`）ではスケジュールの追加のみ可能で、編集・削除ができない。
`PATCH /api/v1/schedules/{id}` と `DELETE /api/v1/schedules/{id}` は実装済み。

### 参照すべき既存ファイル
- `mobile/src/app/(tabs)/schedules.tsx` — 予定一覧・追加モーダル
- `mobile/src/api/schedules.ts` — `updateSchedule()`, `deleteSchedule()` を追加予定
- `mobile/src/components/schedule/ScheduleCard.tsx` — カードコンポーネント
- `mobile/src/types/schedule.ts` — `Schedule`, `ScheduleType`
- `backend/app/schemas/schedule.py` — `ScheduleUpdate`

### タスク一覧

#### 1. API層 (`mobile/src/api/schedules.ts`)
- `updateSchedule(id: string, payload: UpdateSchedulePayload): Promise<Schedule>` を追加
  - `UpdateSchedulePayload = { type?: ScheduleType; title?: string; scheduledAt?: string; companyId?: string }`
- `deleteSchedule(id: string): Promise<void>` を追加

#### 2. `ScheduleCard` に長押し or 編集ボタンを追加
- `ScheduleCard` コンポーネントにオプションの `onLongPress?: () => void` プロップを追加
- `Pressable` の `onLongPress` で親コンポーネントのハンドラを呼ぶ
- または、カード右端に `…` ボタン（`Pressable`）を追加して編集/削除メニューを表示

#### 3. 編集モーダル (`schedules.tsx` 内)
- 既存の追加モーダルとほぼ同じ構成で「編集モーダル」を追加
- 初期値を選択中スケジュールのデータで埋める
- **保存**: `updateSchedule` → `scheduleQueryKeys.all` invalidate
- **削除**: `Alert.alert` 確認後 → `deleteSchedule` → invalidate → モーダルを閉じる
- `selectedSchedule: Schedule | null` で編集対象を管理

### 受け入れ条件
- [ ] スケジュールカードを長押し（またはボタンタップ）で編集モーダルが開く
- [ ] 編集・保存後に一覧が更新される
- [ ] 削除確認後に一覧から削除される
- [ ] TypeScript エラーなし

---

## Prompt 4 — Mailgun inboundエンドツーエンドテスト（E2E Integration Test）

### ブランチ
```
git checkout -b feature/e2e-inbound-test
```

### 背景
Mailgun → Webhook → Celery → DB の一連のフローが実装済みだが、
実際の動作確認（E2E）を自動化するスクリプトがない。
このプロンプトでは、ローカル環境でMailgun inboundフローを
エンドツーエンドで検証するテストスクリプトを作成する。

### 参照すべき既存ファイル
- `backend/app/api/v1/inbound.py` — `POST /api/v1/emails/inbound`
- `backend/app/tasks/inbound_email_task.py` — Celeryタスク
- `backend/app/core/mailgun.py` — HMAC署名検証
- `backend/tests/` — 既存のpytestテスト
- `backend/.env` — `MAILGUN_WEBHOOK_SIGNING_KEY`

### タスク一覧

#### 1. Mailgun webhookペイロード生成ユーティリティ (`backend/tests/utils/mailgun_payload.py`)
実際のMailgunが送るフォーマットに合わせたテスト用ペイロードを生成するユーティリティを作成:
```python
def build_mailgun_payload(
    recipient: str,
    sender: str = "test@example.com",
    subject: str = "一次面接のご案内",
    body_plain: str = "...",
    timestamp: str | None = None,
) -> dict[str, str]:
    """Mailgun inbound webhookのリクエストボディを生成する"""
```
- `timestamp` と `token` と `signature` を HMAC-SHA256 で正しく生成
- `MAILGUN_WEBHOOK_SIGNING_KEY` は `settings.MAILGUN_WEBHOOK_SIGNING_KEY` から取得

#### 2. Inbound webhook統合テスト拡張 (`backend/tests/test_inbound_webhook.py`)
既存テストに加えて以下のケースを追加:

**ケース1: 署名検証失敗**
- 不正な `signature` を含むペイロードを送信
- `ENV=development` 以外では `401` が返ることを確認
- `ENV=development` では署名検証をスキップすることを確認

**ケース2: 重複メール受信（同一 `Message-Id`）**
- 同一 `Message-Id` を2回 POST
- 2回目のレスポンスが `{"status": "duplicate"}` を含むこと

**ケース3: 就活無関係メール**
- `is_job_related=False` を返すようにモックした `EmailAnalyzer` で
- レスポンスが `{"status": "ignored"}` を含むこと

#### 3. 手動確認手順書 (`docs/e2e-manual-test.md`)
以下の手順をMarkdown文書にまとめる:
```
1. docker-compose up -d
2. alembic upgrade head
3. ./start-mobile.sh でモバイル起動
4. npx localtunnel --port 8000 でトンネル取得
5. Mailgunコンソールで Route の宛先URLを更新
6. curl で test@mail.code-peng.com 宛にテストメールを送信するMailgun APIコマンド
7. backend logs でCeleryタスクの成功を確認
8. API GET /api/v1/emails でDB保存を確認
```
- 各ステップに期待される出力・確認方法を記載

### テスト実行方法
```bash
cd backend
pytest tests/test_inbound_webhook.py -v
```

### 受け入れ条件
- [ ] `pytest tests/test_inbound_webhook.py -v` がすべて PASSED
- [ ] 重複・無関係・署名エラーの各ケースがカバーされている
- [ ] `docs/e2e-manual-test.md` に手順が記載されている
- [ ] `any` 型の使用なし、型ヒント完備

### 注意事項
- Celery `.delay()` の呼び出しは `unittest.mock.patch` でモックする
  （実際のCeleryワーカーを起動せずにテストできるようにする）
- `EmailAnalyzer.analyze()` も `unittest.mock.AsyncMock` でモックする
- `ENV=development` では HMAC 署名検証がスキップされることを前提にテストを書く
  （`backend/app/core/mailgun.py` の実装を確認してから）

---

## コーディング規約（共通リマインダー）

### Python
- 型ヒント必須（すべての引数・戻り値）
- `async/await` で非同期処理
- Celeryの `.delay()` は `run_in_executor` でラップ:
  ```python
  loop = asyncio.get_event_loop()
  await loop.run_in_executor(None, partial(some_task.delay, arg))
  ```
- DBクエリには必ず `.where(Model.user_id == current_user.id)` を付ける
- 新機能には `tests/test_*.py` にpytestを作成

### TypeScript (Mobile)
- `strict: true`、`any` 禁止
- サーバー状態 → React Query（`useQuery` / `useMutation`）
- クライアント状態 → Zustand
- API呼び出しは `mobile/src/api/` 経由のみ
- スタイルは `StyleSheet.create` のみ
