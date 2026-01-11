#!/usr/bin/env bash
# リモートD1からイベントデータをローカルDBに同期するスクリプト（fzf対応）

set -euo pipefail

# 環境を選択
ENV=$(echo -e "dev\nprod" | fzf --prompt="同期元の環境を選択 > " --height=40% --reverse)

echo "🚀 ${ENV}環境からイベントデータを同期します"

# TypeScriptスクリプトを実行
bun "$(dirname "$0")/sync_events_from_kv.ts" "${ENV}"
