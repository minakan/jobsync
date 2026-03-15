# Firebase Push Notification Setup

## 1. Firebase Console でプロジェクト作成
1. [Firebase Console](https://console.firebase.google.com/) を開く
2. `JobSync` 用の Firebase プロジェクトを新規作成する
3. Cloud Messaging を有効化する

## 2. Android / iOS アプリを登録
1. Android アプリを登録し、`package`（applicationId）を Expo の Android 設定と一致させる
2. iOS アプリを登録し、`bundle identifier` を Expo の iOS 設定と一致させる
3. iOS は Apple Developer 側で Push Notifications を有効化し、APNs キーを Firebase に登録する

## 3. サービスアカウントキー (JSON) をダウンロード
1. Firebase Console の `プロジェクト設定` -> `サービス アカウント`
2. `新しい秘密鍵の生成` で JSON をダウンロード
3. JSON は秘匿情報として安全に保管する（Git 管理しない）

## 4. backend/.env の `FIREBASE_CREDENTIALS_JSON` を設定
1. `backend/.env` の `FIREBASE_CREDENTIALS_JSON={}` をサービスアカウント JSON 文字列に置き換える
2. 1 行 JSON で設定する（例: `jq -c . service-account.json` の出力を貼り付け）
3. `FIREBASE_CREDENTIALS_JSON={}` または空文字のままだとリマインダー送信はスキップされる

## 5. mobile/app.json に `google-services.json` / `GoogleService-Info.plist` を設定
1. Firebase から Android 用 `google-services.json` をダウンロードし、`mobile/android/app/google-services.json` に配置
2. Firebase から iOS 用 `GoogleService-Info.plist` をダウンロードし、`mobile/ios/JobSync/GoogleService-Info.plist` に配置
3. `mobile/app.json` で Expo config plugin の Firebase 設定を行う

```json
{
  "expo": {
    "android": {
      "googleServicesFile": "./android/app/google-services.json"
    },
    "ios": {
      "googleServicesFile": "./ios/JobSync/GoogleService-Info.plist"
    }
  }
}
```

## 6. 動作確認（リマインダー通知）
1. 実機でログインし、FCM トークンが `PATCH /api/v1/users/me/fcm-token` で保存されることを確認
2. バックエンドで対象スケジュールを作成し、リマインダー対象日（1日/3日前）になるよう調整
3. 手動実行でリマインダー送信を確認

```bash
cd backend
PYTHONPATH=. uv run python -c "from app.tasks.reminder_task import send_daily_reminders; print(send_daily_reminders())"
```

4. 戻り値 `{"sent": n, "failed": m}` と端末通知の到着を確認
