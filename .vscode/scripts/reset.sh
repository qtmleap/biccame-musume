#!/bin/bash
# D1データベースをリセットし、プロダクションからデータをリストアするスクリプト

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SCHEMA_FILE="${PROJECT_ROOT}/.wrangler/schema.sql"
DATA_FILE="${PROJECT_ROOT}/.wrangler/data.sql"

cd "$PROJECT_ROOT"

echo "�️  Step 1: ローカルDBをクリア中..."
rm -rf .wrangler/state

echo ""
echo "� Step 2: プロダクション環境からスキーマをエクスポート中..."
bun wrangler d1 export biccame-musume-prod --remote --output "$SCHEMA_FILE" --env prod --no-data

echo ""
echo "🔨 Step 3: スキーマをインポートしてテーブル構造を作成中..."
bun wrangler d1 execute DB --local --file="$SCHEMA_FILE"

echo ""
echo "📦 Step 4: プロダクション環境からデータをエクスポート中..."
bun wrangler d1 export biccame-musume-prod --remote --output "$DATA_FILE" --env prod --no-schema

echo ""
echo "📥 Step 5: データをインポート中..."
bun wrangler d1 execute DB --local --file="$DATA_FILE"

echo ""
echo "✅ リセット&リストア完了!"
echo "📋 スキーマファイル: $SCHEMA_FILE"
echo "💾 データファイル: $DATA_FILE"
