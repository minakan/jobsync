# AGENTS.md — JobSync プロジェクト設定

## プロジェクト概要
JobSyncは就活生向けのメール連携型スケジュール自動管理アプリ。
- バックエンド: Python FastAPI (./backend)
- モバイルアプリ: React Native + Expo (./mobile)
- AI: OpenAI GPT-4o API（日本語メール解析）

## コーディング規約

### Python (Backend)
- 型ヒント必須: すべての関数・メソッドに型アノテーションを付ける
- Pydantic使用: リクエスト/レスポンスの検証はPydanticスキーマのみ
- 非同期優先: DB操作・外部API呼び出しはすべて async/await
- 例外処理: 広範なtry/catchは禁止。HTTPExceptionを適切に使用する
- テスト: 新機能には必ずpytestテストを作成する（test_*.py）

### TypeScript (Mobile)
- strict mode有効: tsconfig.json で strict: true
- any禁止: `as any` は使用しない
- React Query: サーバー状態管理はすべてReact Queryで行う
- Zustand: クライアント状態管理はZustandのみ

## 重要な制約
1. メールのアクセストークンは必ず暗号化してDBに保存する（security.pyのencrypt_token使用）
2. すべてのDB操作でuser_idフィルタを必ず付ける（情報漏洩防止）
3. OpenAI APIのエラーはログに残し、ユーザーにはフォールバック結果を返す
4. Gmailスコープは gmail.readonly のみ使用する

## テスト実行
- Backend: `cd backend && pytest -v`
- Mobile:  `cd mobile && npx jest`
