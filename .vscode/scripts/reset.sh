#!/bin/bash
# D1データベースをリセットするスクリプト
# fzfで環境を選択して実行

set -e

cd "$(dirname "$0")/../.."

# 環境選択
ENV=$(echo -e "local\ndev\nprod" | fzf --prompt="Reset target: " --height=10 --reverse)

if [ -z "$ENV" ]; then
  echo "Cancelled"
  exit 0
fi

echo "Selected: $ENV"
echo ""

bun run scripts/reset.ts "$ENV"
