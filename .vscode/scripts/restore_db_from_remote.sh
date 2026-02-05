#!/bin/bash

# リモートD1データベースをローカルにリストアするスクリプト

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKUP_FILE="${PROJECT_ROOT}/.wrangler/backup.sql"

# 環境選択（デフォルトはdev）
ENV="${1:-dev}"

if [ "$ENV" = "prod" ]; then
  DB_NAME="biccame-musume-prod"
  echo "⚠️  Production環境からリストアします"
else
  DB_NAME="biccame-musume-dev"
  echo "📦 Dev環境からリストアします"
fi

echo "🔄 リモートDBをエクスポート中..."
bun wrangler d1 export "$DB_NAME" --remote --output "$BACKUP_FILE" --env "$ENV"

echo "🗑️  ローカルDBをクリア中..."
rm -rf .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite*

echo "🔨 マイグレーション実行中..."
bun wrangler d1 migrations apply DB --local

echo "📥 バックアップデータをインポート中..."
bun wrangler d1 execute DB --local --file="$BACKUP_FILE"

echo "✅ リストア完了!"
echo "💾 バックアップファイル: $BACKUP_FILE"
