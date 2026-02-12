#!/bin/bash
# D1データベースをリセットし、プロダクションからデータをリストアするスクリプト

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SCHEMA_FILE="${PROJECT_ROOT}/.wrangler/schema.sql"
DATA_FILE="${PROJECT_ROOT}/.wrangler/data.sql"

# リトライ実行関数
retry_command() {
  local max_attempts=5
  local attempt=1
  local delay=10
  
  # エラーで終了する動作を一時的に無効化
  set +e

  while [ $attempt -le $max_attempts ]; do
    echo "🔄 試行 $attempt/$max_attempts..."
    "$@"
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
      echo "✅ 成功しました"
      set -e
      return 0
    else
      if [ $attempt -lt $max_attempts ]; then
        echo "⚠️  失敗しました (終了コード: $exit_code)"
        echo "⏳ ${delay}秒後に再試行します..."
        sleep $delay
        # 次回は待機時間を少し増やす（指数バックオフ的な動作）
        delay=$((delay + 5))
        attempt=$((attempt + 1))
      else
        echo "❌ $max_attempts回試行しましたが失敗しました"
        set -e
        return 1
      fi
    fi
  done
  
  set -e
}

cd "$PROJECT_ROOT"

# リストア先の環境選択
DEST_ENV=$(echo -e "local\ndev" | fzf --prompt="リストア先の環境を選択: " --height=10 --border)

if [ -z "$DEST_ENV" ]; then
  echo "リストア先の環境が選択されませんでした"
  exit 1
fi

# リストア元はprod固定
SOURCE_DB_NAME="biccame-musume-prod"
SOURCE_ENV="prod"

# リストア先の設定
if [ "$DEST_ENV" = "local" ]; then
  DEST_DB_NAME="DB"
  DEST_FLAG="--local"
else
  DEST_DB_NAME="biccame-musume-dev"
  DEST_FLAG="--remote --env dev"
fi

echo "🗑️  Step 1: ${DEST_ENV}環境のDBをクリア中..."
if [ "$DEST_ENV" = "local" ]; then
  rm -rf .wrangler/state
else
  # dev環境の場合は既存のテーブルを削除
  echo "📋 既存のテーブル一覧を取得中..."
  TABLES=$(bun wrangler d1 execute "$DEST_DB_NAME" $DEST_FLAG --command="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';" --json | jq -r '.[].results[].name' 2>/dev/null || echo "")

  if [ -n "$TABLES" ]; then
    # DROP文をファイルに出力(外部キー制約を無効化)
    DROP_FILE="${PROJECT_ROOT}/.wrangler/drop.sql"
    echo "🗑️  テーブルを削除中..."
    > "$DROP_FILE"
    echo "PRAGMA foreign_keys = OFF;" >> "$DROP_FILE"
    for TABLE in $TABLES; do
      echo "  - Dropping $TABLE"
      echo "DROP TABLE IF EXISTS \"$TABLE\";" >> "$DROP_FILE"
    done
    echo "PRAGMA foreign_keys = ON;" >> "$DROP_FILE"
    bun wrangler d1 execute "$DEST_DB_NAME" $DEST_FLAG --file="$DROP_FILE" --yes
    rm -f "$DROP_FILE"
  fi
fi

echo ""
echo "📤 Step 2: ${SOURCE_ENV}環境からスキーマをエクスポート中..."
retry_command bun wrangler d1 export "$SOURCE_DB_NAME" --remote --output "$SCHEMA_FILE" --env "$SOURCE_ENV" --no-data

echo ""
echo "🔨 Step 3: ${DEST_ENV}環境にスキーマをインポート中..."
retry_command bun wrangler d1 execute "$DEST_DB_NAME" $DEST_FLAG --file="$SCHEMA_FILE" --yes

echo ""
echo "📦 Step 4: ${SOURCE_ENV}環境からデータをエクスポート中..."
retry_command bun wrangler d1 export "$SOURCE_DB_NAME" --remote --output "$DATA_FILE" --env "$SOURCE_ENV" --no-schema

echo ""
echo "📥 Step 5: ${DEST_ENV}環境にデータをインポート中..."
retry_command bun wrangler d1 execute "$DEST_DB_NAME" $DEST_FLAG --file="$DATA_FILE" --yes

echo ""
echo "✅ リセット&リストア完了! (${SOURCE_ENV} → ${DEST_ENV})"
echo "📋 スキーマファイル: $SCHEMA_FILE"
echo "💾 データファイル: $DATA_FILE"
