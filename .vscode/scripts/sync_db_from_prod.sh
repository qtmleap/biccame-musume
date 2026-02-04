#!/bin/bash
# 本番D1データベースからローカルにデータを同期するスクリプト

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_FILE="/tmp/prod_backup.sql"

cd "$PROJECT_DIR"

echo "本番D1からSQLダンプをエクスポート中..."
bunx wrangler d1 export biccame-musume-prod --remote --env prod --output "$BACKUP_FILE"

echo "テーブルごとにINSERT文を抽出中..."
grep '^INSERT INTO "events"' "$BACKUP_FILE" > /tmp/insert_events.sql || true
grep '^INSERT INTO "event_stores"' "$BACKUP_FILE" > /tmp/insert_event_stores.sql || true
grep '^INSERT INTO "event_conditions"' "$BACKUP_FILE" > /tmp/insert_event_conditions.sql || true
grep '^INSERT INTO "event_reference_urls"' "$BACKUP_FILE" > /tmp/insert_event_reference_urls.sql || true

echo "ローカルD1のデータをクリア中..."
bunx wrangler d1 execute biccame-musume-dev --local --command "DELETE FROM event_conditions"
bunx wrangler d1 execute biccame-musume-dev --local --command "DELETE FROM event_reference_urls"
bunx wrangler d1 execute biccame-musume-dev --local --command "DELETE FROM event_stores"
bunx wrangler d1 execute biccame-musume-dev --local --command "DELETE FROM events"

echo "ローカルD1にインポート中..."
# 親テーブル（events）を先にインポート
if [ -s /tmp/insert_events.sql ]; then
  bunx wrangler d1 execute biccame-musume-dev --local --file /tmp/insert_events.sql
fi
# 子テーブルをインポート
if [ -s /tmp/insert_event_stores.sql ]; then
  bunx wrangler d1 execute biccame-musume-dev --local --file /tmp/insert_event_stores.sql
fi
if [ -s /tmp/insert_event_conditions.sql ]; then
  bunx wrangler d1 execute biccame-musume-dev --local --file /tmp/insert_event_conditions.sql
fi
if [ -s /tmp/insert_event_reference_urls.sql ]; then
  bunx wrangler d1 execute biccame-musume-dev --local --file /tmp/insert_event_reference_urls.sql
fi

echo "完了！"
