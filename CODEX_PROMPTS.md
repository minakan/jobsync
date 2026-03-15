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

## Prompt 5 — アカウント削除（Account Deletion）

### ブランチ
```
git checkout -b feature/account-deletion
```

### 背景
現在 `POST /api/v1/auth/logout` は JWT がステートレスなため実質 no-op。
`DELETE /api/v1/users/me` エンドポイントは未実装で、設定画面にも削除 UI がない。
User モデルには `deleted_at` / `is_active` フィールドが存在しない。
このプロンプトでは、アカウント完全削除（ハード削除 + カスケード）をバックエンドとモバイルの両方で実装する。

### 参照すべき既存ファイル
- `backend/app/api/v1/auth.py` — ログアウトエンドポイント（L219-225）、`get_current_user` 依存
- `backend/app/models/user.py` — User モデル（cascade delete 設定確認）
- `backend/app/schemas/user.py` — レスポンス型
- `mobile/src/app/(tabs)/settings.tsx` — ログアウトボタン実装（参考）
- `mobile/src/store/authStore.ts` — Zustand auth ストア（`clearAuth` などのアクション確認）
- `mobile/src/api/auth.ts` — 認証関連 API 呼び出し

### タスク一覧

#### 1. バックエンド: アカウント削除エンドポイント (`backend/app/api/v1/auth.py`)
- `DELETE /api/v1/auth/me` エンドポイントを追加
  ```python
  @router.delete("/me", status_code=204)
  async def delete_account(
      current_user: User = Depends(get_current_user),
      db: AsyncSession = Depends(get_db),
  ) -> None:
  ```
- `db.delete(current_user)` → `await db.commit()` でハード削除
- User モデルの relationship に `cascade="all, delete-orphan"` が設定されていることを確認し、不足があれば `backend/app/models/user.py` に追記
- 削除後は 204 No Content を返す

#### 2. バックエンド: テスト (`backend/tests/test_auth.py` または新規 `test_account_deletion.py`)
- 認証済みユーザーが `DELETE /api/v1/auth/me` を呼ぶと 204 が返ること
- 削除後、同じ JWT で `GET /api/v1/users/me` を呼ぶと 401 になること
- 関連レコード（Company, Schedule など）もカスケード削除されること

#### 3. モバイル: API 層 (`mobile/src/api/auth.ts`)
- `deleteAccount(): Promise<void>` 関数を追加
  - `DELETE /auth/me` を呼び出す

#### 4. モバイル: 設定画面 (`mobile/src/app/(tabs)/settings.tsx`)
- 「アカウントを削除する」ボタンを画面下部（ログアウトボタンの下）に追加
- ボタンカラー: `#FF3B30`（danger red）
- タップ時に `Alert.alert` で2段階確認:
  - 第1確認: 「本当に削除しますか？この操作は取り消せません。」→「削除する」/「キャンセル」
  - 「削除する」タップ後 `deleteAccount()` を呼び出す
- 成功後: `authStore` の `clearAuth()` を呼び、ログイン画面にリダイレクト（`router.replace('/login')` 相当）
- ロード中はボタンを `disabled` + `ActivityIndicator`
- エラー時は `Alert.alert` でメッセージ表示

### 受け入れ条件
- [ ] `DELETE /api/v1/auth/me` が 204 を返し DB からユーザーが削除される
- [ ] 関連する Company / Schedule / Email もカスケード削除される
- [ ] 削除後に同 JWT でのアクセスが 401 になる
- [ ] 設定画面に削除ボタンが表示される
- [ ] 2段階確認ダイアログが動作する
- [ ] `pytest tests/test_account_deletion.py -v` が PASSED
- [ ] TypeScript エラーなし

### 注意事項
- ハード削除のため **元に戻せない**。確認ダイアログは2段階必須
- JWT はステートレスなため削除後もトークンは数分有効だが、DBにユーザーが存在しないため `get_current_user` が 401 を返す設計で OK
- フロントエンドは削除成功後に即座にストアをクリアしてログイン画面へ遷移する

---

## Prompt 6 — プッシュ通知 FCM 設定（Push Notifications）

### ブランチ
```
git checkout -b feature/push-notifications
```

### 背景
`backend/app/tasks/reminder_task.py` に FCM 送信ロジックは実装済みだが、
`backend/.env` の `FIREBASE_CREDENTIALS_JSON={}` が空のため通知は送信されない。
モバイル側にも FCM トークン取得・登録フローが存在しない。
このプロンプトでは、モバイルの FCM トークン登録から通知受信UIまでを完成させる。

### 参照すべき既存ファイル
- `backend/app/tasks/reminder_task.py` — FCM 送信実装（`firebase_admin.messaging`）
- `backend/app/models/user.py` — `fcm_token: str | None` フィールド
- `backend/app/api/v1/users.py` — `PATCH /users/me` が `fcm_token` を受け付けるか確認
- `mobile/src/store/authStore.ts` — ログイン後の処理
- `mobile/package.json` — 現在インストール済みのパッケージ確認

### タスク一覧

#### 1. バックエンド: FCM トークン更新エンドポイント確認・追加
- `backend/app/api/v1/users.py` に `PATCH /api/v1/users/me/fcm-token` がなければ追加:
  ```python
  class FCMTokenUpdate(BaseModel):
      fcm_token: str

  @router.patch("/me/fcm-token", status_code=204)
  async def update_fcm_token(
      body: FCMTokenUpdate,
      current_user: User = Depends(get_current_user),
      db: AsyncSession = Depends(get_db),
  ) -> None:
  ```
- `current_user.fcm_token = body.fcm_token` → `await db.commit()`

#### 2. モバイル: Expo Notifications セットアップ
- `expo-notifications` と `expo-device` が `package.json` になければ `npx expo install expo-notifications expo-device` を実行
- `mobile/src/utils/notifications.ts` を新規作成:
  ```typescript
  export async function registerForPushNotifications(): Promise<string | null>
  ```
  - `expo-device` で実機確認（シミュレーターでは null を返す）
  - `Notifications.requestPermissionsAsync()` でパーミッション要求
  - `Notifications.getExpoPushTokenAsync()` で Expo Push Token 取得
  - **注意**: `reminder_task.py` が `firebase_admin.messaging` を使っているため、FCM ネイティブトークン (`Notifications.getDevicePushTokenAsync()`) が必要か Expo Push Token で十分かを `reminder_task.py` の実装を読んで判断すること

#### 3. モバイル: ログイン後のトークン登録 (`mobile/src/store/authStore.ts` または認証コールバック)
- ログイン成功後（`setAuth` 呼び出し後）に `registerForPushNotifications()` を呼ぶ
- 取得したトークンを `PATCH /api/v1/users/me/fcm-token` に送信する `updateFCMToken(token)` を `mobile/src/api/users.ts` に追加

#### 4. モバイル: フォアグラウンド通知ハンドラ (`mobile/src/app/_layout.tsx`)
- `Notifications.addNotificationReceivedListener` でフォアグラウンド通知をハンドル
- 通知をタップしたとき（`addNotificationResponseReceivedListener`）に関連スケジュール画面へ遷移

#### 5. Firebase セットアップ手順書 (`docs/firebase-setup.md`)
以下の手順をまとめた Markdown を作成:
```
1. Firebase Console (https://console.firebase.google.com/) でプロジェクト作成
2. Android/iOS アプリを登録
3. サービスアカウントキー (JSON) をダウンロード
4. backend/.env の FIREBASE_CREDENTIALS_JSON に JSON 文字列を設定
5. mobile/app.json に google-services.json / GoogleService-Info.plist の設定
6. 動作確認: reminder_task を手動で呼び出してテスト通知を確認
```

### 受け入れ条件
- [ ] `PATCH /api/v1/users/me/fcm-token` が 204 を返す
- [ ] ログイン後に FCM トークンが自動取得・登録される
- [ ] `docs/firebase-setup.md` に Firebase 設定手順が記載されている
- [ ] フォアグラウンドでも通知が受信できる
- [ ] TypeScript エラーなし（`npx tsc --noEmit`）

### 注意事項
- Firebase 認証情報（`FIREBASE_CREDENTIALS_JSON`）は実際の値を `.env` に記載する必要があり、このプロンプトではコード実装のみ行い、Firebase Console でのプロジェクト作成は手順書に委ねる
- `FIREBASE_CREDENTIALS_JSON={}` の場合、`reminder_task.py` が `firebase_admin.initialize_app` でエラーにならないよう、`FIREBASE_CREDENTIALS_JSON` が空オブジェクトのときは FCM 送信をスキップする guard を `reminder_task.py` に追加すること

---

## Prompt 7 — 企業ステータス履歴タイムライン（Company Status History）

### ブランチ
```
git checkout -b feature/company-status-history
```

### 背景
Company モデルの `status_history` JSONB フィールドには、ステータス変更のたびに
`{ status, changed_at, note }` のレコードが追記されている。
しかし現在の企業詳細モーダル（`companies.tsx`）にはこの履歴を表示するUIがない。
このプロンプトでは、企業詳細モーダル内にステータス変更履歴をタイムライン形式で追加する。

### 参照すべき既存ファイル
- `backend/app/models/company.py` — `status_history: list[dict]` フィールドの JSON 構造確認
- `backend/app/schemas/company.py` — `CompanyResponse` に `status_history` が含まれるか確認
- `mobile/src/types/company.ts` — `Company` 型に `status_history` が定義されているか確認
- `mobile/src/app/(tabs)/companies.tsx` — 企業詳細モーダルの実装
- `mobile/src/components/company/StatusBadge.tsx` — `STATUS_CONFIG`（色・ラベル）

### タスク一覧

#### 1. 型定義の確認・追加 (`mobile/src/types/company.ts`)
- `StatusHistoryEntry` インターフェースを追加:
  ```typescript
  export interface StatusHistoryEntry {
    status: CompanyStatus;
    changed_at: string;  // ISO8601
    note?: string | null;
  }
  ```
- `Company` 型に `status_history: StatusHistoryEntry[]` を追加（未定義の場合）

#### 2. バックエンド: `CompanyResponse` に `status_history` を含める
- `backend/app/schemas/company.py` の `CompanyResponse` に `status_history` フィールドがなければ追加
- `backend/app/api/v1/companies.py` の `GET /companies` および `GET /companies/{id}` が `status_history` を返していることを確認

#### 3. ステータス履歴タイムラインコンポーネント (`mobile/src/components/company/StatusHistoryTimeline.tsx`)
新規コンポーネントを作成:
```typescript
interface Props {
  history: StatusHistoryEntry[];
}
```
- `history` を `changed_at` の降順にソートして表示
- 各エントリを縦線でつないだタイムライン形式で表示:
  - 左側: ステータスカラーの丸アイコン（`STATUS_CONFIG` の色を使用）
  - 右側: ステータスラベル（日本語）+ 日時（`M月d日 HH:mm`）+ note（あれば）
- `history` が空の場合「変更履歴がありません」テキスト表示

#### 4. 企業詳細モーダルに組み込み (`mobile/src/app/(tabs)/companies.tsx`)
- 企業詳細モーダルの下部（保存・削除ボタンの上）に `<StatusHistoryTimeline history={selectedCompany.status_history ?? []} />` を追加
- セクションヘッダー「ステータス履歴」を表示
- 履歴が長い場合はモーダル内でスクロールできるよう `ScrollView` を使用

### 受け入れ条件
- [ ] 企業詳細モーダルにステータス履歴セクションが表示される
- [ ] ステータス変更後に再度モーダルを開くと新しい履歴が表示される
- [ ] タイムラインのドットカラーが各ステータスの色と一致している
- [ ] 履歴が空の場合「変更履歴がありません」が表示される
- [ ] TypeScript エラーなし

### 注意事項
- `status_history` は API レスポンスに含まれない場合があるため、`company.status_history ?? []` でフォールバックすること
- バックエンドで `status_history` を返していない場合は、スキーマとAPIエンドポイントを先に修正してから進めること

---

## Prompt 8 — 企業カンバンビュー（Company Kanban View）

### ブランチ
```
git checkout -b feature/company-kanban
```

### 背景
現在の企業タブはリスト表示のみ。就活の進捗を視覚的に把握するために、
カンバン（パイプライン）ビューを追加する。
Company モデルの `status` enum が定義する8つのステージをカラムとして表示する。

### 参照すべき既存ファイル
- `mobile/src/app/(tabs)/companies.tsx` — 現在のリスト実装
- `mobile/src/types/company.ts` — `CompanyStatus` enum
- `mobile/src/components/company/StatusBadge.tsx` — `STATUS_CONFIG`（色・ラベル）
- `mobile/src/api/companies.ts` — `fetchCompanies()`

### タスク一覧

#### 1. カンバンボードコンポーネント (`mobile/src/components/company/KanbanBoard.tsx`)
```typescript
interface Props {
  companies: Company[];
  onCardPress: (company: Company) => void;
}
```
- `CompanyStatus` の全ステージ順（`interested → applied → screening → interview → offer → rejected`）でカラムを並べる
- 横スクロール `ScrollView` (horizontal) でカラムを表示
- 各カラム:
  - ヘッダー: ステータスラベル（日本語）+ そのステータスの企業数バッジ
  - カラム内は縦 `ScrollView` で企業カードを並べる
  - 各カード: 企業名、優先度（星またはドット）、最終更新日
  - カードタップで `onCardPress` を呼ぶ

#### 2. カンバンカードコンポーネント (`mobile/src/components/company/KanbanCard.tsx`)
```typescript
interface Props {
  company: Company;
  onPress: () => void;
}
```
- 企業名（1行省略）
- 優先度インジケーター（priority 1-5 を ● の数で表示）
- ステータス変更日時（`status_history` の最新エントリから `changed_at`）

#### 3. 企業タブにビュー切り替えを追加 (`mobile/src/app/(tabs)/companies.tsx`)
- 画面右上にトグルボタンを追加（リストアイコン / カンバンアイコン）
- `viewMode: 'list' | 'kanban'` を `useState` で管理
- `viewMode === 'list'` → 既存の `FlatList`
- `viewMode === 'kanban'` → `<KanbanBoard companies={companies} onCardPress={...} />`
- 企業詳細モーダルはどちらのビューからも開けること
- ビューモード選択は Zustand または `useState` で保持（アプリ再起動後はリストに戻って OK）

### 受け入れ条件
- [ ] 企業タブ右上のボタンでリスト/カンバン切り替えができる
- [ ] カンバンビューで全ステータスのカラムが横スクロールで確認できる
- [ ] 各カラムに正しい企業が表示される
- [ ] カンバンカードをタップすると企業詳細モーダルが開く
- [ ] ステータスが 0 件のカラムも表示される（空カラム可）
- [ ] TypeScript エラーなし

### 注意事項
- ドラッグ&ドロップによるステータス変更は **このプロンプトのスコープ外**（将来対応）
- カンバンカードのデザインはシンプルに保つ（情報過多にしない）
- `rejected` カラムは視覚的に薄いグレー系にして、進行中ステータスと区別すること

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
