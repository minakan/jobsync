#!/bin/bash
# ============================================================
# JobSync 起動スクリプト
# 実行するだけで全準備 + Expo 起動まで完了する
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_DIR="$SCRIPT_DIR/mobile"
BACKEND_ENV="$SCRIPT_DIR/backend/.env"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

# ────────────────────────────────────────────────────────────
# ユーティリティ
# ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $1${NC}"; }
info() { echo -e "${CYAN}ℹ️  $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; exit 1; }
step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# ────────────────────────────────────────────────────────────
# STEP 1: ローカル IP 取得
# ────────────────────────────────────────────────────────────
step "STEP 1/6: IPアドレス確認"

# デフォルトルートのインターフェースからIPを取得（WiFi・テザリング・USB問わず対応）
DEFAULT_IF=$(route get default 2>/dev/null | awk '/interface:/{print $2}')
IP=$(ipconfig getifaddr "$DEFAULT_IF" 2>/dev/null || true)

# フォールバック: 全インターフェースを順番に試す
if [ -z "$IP" ]; then
  for iface in en0 en1 en2 en3 en4 en5 en6 en7 bridge100; do
    IP=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
    [ -n "$IP" ] && break
  done
fi

if [ -z "$IP" ]; then
  fail "IPアドレスが取得できませんでした。ネットワーク接続を確認してください。"
fi

ok "ローカルIP: $IP"

# ────────────────────────────────────────────────────────────
# STEP 2: 設定ファイル自動更新
# ────────────────────────────────────────────────────────────
step "STEP 2/6: ngrok起動"

NGROK_DOMAIN="lekisha-unstabilizing-denice.ngrok-free.dev"

# 既存の ngrok プロセスを停止
pkill -f "ngrok" 2>/dev/null || true
sleep 1

# バックグラウンドで ngrok を起動
info "ngrok を起動中..."
ngrok http --domain="$NGROK_DOMAIN" 8000 > /dev/null 2>&1 &
NGROK_PID=$!

# ngrok の起動を待機（ローカルAPI localhost:4040 が応答するまで）
NGROK_READY=false
for i in $(seq 1 15); do
  if curl -s http://localhost:4040/api/tunnels > /dev/null 2>&1; then
    NGROK_READY=true
    break
  fi
  echo -n "."
  sleep 1
done
echo ""

if [ "$NGROK_READY" = true ]; then
  ok "ngrok: 起動完了 → https://$NGROK_DOMAIN"
else
  warn "ngrok の起動確認がタイムアウトしました。接続に時間がかかる場合があります。"
fi

# ────────────────────────────────────────────────────────────
# STEP 3/5: 設定ファイル更新
# ────────────────────────────────────────────────────────────
step "STEP 3/6: 設定ファイル更新"

# mobile/.env.local
cat > "$MOBILE_DIR/.env.local" << ENV
EXPO_PUBLIC_API_URL=http://$IP:8000/api/v1
ENV
ok "mobile/.env.local → EXPO_PUBLIC_API_URL=http://$IP:8000/api/v1"

# ALLOWED_ORIGINS (backend/.env)
NEW_ORIGINS='["http://localhost:3000","http://localhost:8081","http://'"$IP"':8081","exp://'"$IP"':8081","https://'"$NGROK_DOMAIN"'"]'

if grep -q "^ALLOWED_ORIGINS=" "$BACKEND_ENV" 2>/dev/null; then
  sed -i '' "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=$NEW_ORIGINS|" "$BACKEND_ENV"
else
  echo "ALLOWED_ORIGINS=$NEW_ORIGINS" >> "$BACKEND_ENV"
fi
ok "backend/.env → ALLOWED_ORIGINS 更新"

# docker-compose.yml の ALLOWED_ORIGINS
sed -i '' "s|ALLOWED_ORIGINS: '.*'|ALLOWED_ORIGINS: '$NEW_ORIGINS'|" "$COMPOSE_FILE"
ok "docker-compose.yml → ALLOWED_ORIGINS 更新"

# ────────────────────────────────────────────────────────────
# STEP 4: Docker バックエンド起動
# ────────────────────────────────────────────────────────────
step "STEP 4/6: Dockerバックエンド起動"

cd "$SCRIPT_DIR"

# Docker 自体が起動しているか確認
if ! docker info > /dev/null 2>&1; then
  fail "Dockerが起動していません。Docker Desktopを起動してから再実行してください。"
fi
ok "Docker Desktop: 起動中"

# コンテナを起動（変更があれば再作成、なければスキップ）
info "docker-compose up -d を実行中..."
docker-compose up -d --remove-orphans 2>&1 | grep -E "(Creating|Recreating|Starting|Running|healthy|error)" || true

# ヘルスチェック待機（最大60秒）
info "コンテナのヘルスチェック待機中..."
HEALTHY=false
for i in $(seq 1 12); do
  DB_STATUS=$(docker-compose ps db 2>/dev/null | grep -c "healthy" || echo "0")
  REDIS_STATUS=$(docker-compose ps redis 2>/dev/null | grep -c "healthy" || echo "0")
  if [ "$DB_STATUS" -ge 1 ] && [ "$REDIS_STATUS" -ge 1 ]; then
    HEALTHY=true
    break
  fi
  echo -n "."
  sleep 5
done
echo ""

if [ "$HEALTHY" = false ]; then
  warn "ヘルスチェックタイムアウト。コンテナのログを確認してください: docker-compose logs"
  warn "起動に時間がかかっている可能性があります。続行します..."
fi
ok "バックエンド: 起動完了"

# ────────────────────────────────────────────────────────────
# STEP 5: Alembic マイグレーション
# ────────────────────────────────────────────────────────────
step "STEP 5/6: DBマイグレーション"

info "alembic upgrade head を実行中..."
if docker-compose exec -T api alembic upgrade head 2>&1; then
  ok "マイグレーション: 完了"
else
  warn "マイグレーションでエラーが発生しました。ログを確認してください。"
  warn "docker-compose logs api でAPIログを確認できます。"
fi

# ────────────────────────────────────────────────────────────
# STEP 6: Expo 起動
# ────────────────────────────────────────────────────────────
step "STEP 6/6: Expo起動"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                     準備完了！                               ║${NC}"
echo -e "${GREEN}║  API URL    : http://$IP:8000/api/v1                      ║${NC}"
echo -e "${GREEN}║  Ngrok URL  : https://$NGROK_DOMAIN  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
info "QRコードをExpo Goでスキャンしてください"
echo ""

cd "$MOBILE_DIR"
npx expo start --clear
