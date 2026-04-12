#!/bin/bash
# 本番D1とローカル/ステージングのスキーマが一致しているかチェックするスクリプト

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORK_DIR="${PROJECT_ROOT}/.wrangler"

mkdir -p "$WORK_DIR"

PROD_SCHEMA="${WORK_DIR}/schema_production.sql"
TARGET_SCHEMA="${WORK_DIR}/schema_target.sql"

cd "$PROJECT_ROOT"

# チェック先の環境選択（引数があればそれを使用、なければfzfで選択）
if [ -n "$1" ]; then
  TARGET_ENV="$1"
  if [ "$TARGET_ENV" != "local" ] && [ "$TARGET_ENV" != "staging" ]; then
    echo "❌ 無効な環境: $TARGET_ENV (local または staging を指定してください)"
    exit 1
  fi
else
  TARGET_ENV=$(echo -e "local\nstaging" | fzf --prompt="チェック先の環境を選択: " --height=10 --border)

  if [ -z "$TARGET_ENV" ]; then
    echo "チェック先の環境が選択されませんでした"
    exit 1
  fi
fi

echo "📋 本番環境のスキーマをエクスポート中..."
bun wrangler d1 export biccame-musume-prod --remote --output "$PROD_SCHEMA" --env production --no-data

echo "📋 ${TARGET_ENV}環境のスキーマをエクスポート中..."
if [ "$TARGET_ENV" = "local" ]; then
  bun wrangler d1 export DB --local --output "$TARGET_SCHEMA" --no-data
else
  bun wrangler d1 export biccame-musume-dev --remote --output "$TARGET_SCHEMA" --env staging --no-data
fi

echo ""
echo "🔍 スキーマを比較中 (production vs ${TARGET_ENV})..."
echo ""

if diff -u "$PROD_SCHEMA" "$TARGET_SCHEMA" > /dev/null 2>&1; then
  echo "✅ スキーマは一致しています"
  EXIT_CODE=0
else
  echo "⚠️  スキーマに差分があります:"
  echo ""
  diff -u --label "production" --label "$TARGET_ENV" "$PROD_SCHEMA" "$TARGET_SCHEMA" || true
  EXIT_CODE=1
fi

rm -f "$PROD_SCHEMA" "$TARGET_SCHEMA"
exit $EXIT_CODE
