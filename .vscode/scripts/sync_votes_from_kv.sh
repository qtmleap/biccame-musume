#!/bin/bash
# KVの投票データをローカルD1に同期するスクリプト
# fzfで環境を選択

# fzfがインストールされているか確認
if ! command -v fzf &> /dev/null; then
    echo "❌ fzfがインストールされていません"
    echo "インストール: brew install fzf"
    exit 1
fi

# 環境を選択
ENV=$(echo -e "local\ndev\nprod" | fzf --prompt="同期元の環境を選択: " --height=40% --reverse --border)

# 選択がキャンセルされた場合
if [ -z "$ENV" ]; then
    echo "キャンセルされました"
    exit 0
fi

echo "🚀 ${ENV}環境から投票データを同期します..."
echo ""

# スクリプトを実行
bun "${BASH_SOURCE%/*}/sync_votes_from_kv.ts" "$ENV"
