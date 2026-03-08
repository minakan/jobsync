#!/bin/bash
# JobSync モバイル起動スクリプト
# 実行するだけで IP 自動設定 + Expo 起動

set -e

# Mac の Wi-Fi IP を取得
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

if [ -z "$IP" ]; then
  echo "❌ IPアドレスが取得できませんでした。Wi-Fiに接続されているか確認してください。"
  exit 1
fi

echo "✅ IPアドレス: $IP"

# .env.local を自動更新
echo "EXPO_PUBLIC_API_URL=http://$IP:8000/api/v1" > "$(dirname "$0")/mobile/.env.local"
echo "✅ .env.local を更新しました"

# Expo 起動
cd "$(dirname "$0")/mobile"
npx expo start --clear
