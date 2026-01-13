#!/bin/bash
# KVのイベントデータをD1に同期するスクリプト
# fzfで同期元と同期先を選択

set -e

cd "$(dirname "$0")/../.."

# 同期元環境を選択
FROM_ENV=$(echo -e "dev\nprod" | fzf --prompt="Sync from: " --height=10 --reverse)

if [ -z "$FROM_ENV" ]; then
  echo "Cancelled"
  exit 0
fi

# 同期先環境を選択
TO_ENV=$(echo -e "local\ndev\nprod" | fzf --prompt="Sync to: " --height=10 --reverse)

if [ -z "$TO_ENV" ]; then
  echo "Cancelled"
  exit 0
fi

echo "Selected: $FROM_ENV -> $TO_ENV"
echo ""

bun run .vscode/scripts/sync_events_from_kv.ts "$FROM_ENV" "$TO_ENV"
