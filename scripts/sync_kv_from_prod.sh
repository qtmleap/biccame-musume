#!/bin/bash

# 本番環境のKVデータをローカルminiflare環境にコピーするスクリプト

set -e

echo "🔄 本番環境のKVデータをローカルminiflare環境に同期します..."

# BICCAME_MUSUME_EVENTSの同期
echo "📅 BICCAME_MUSUME_EVENTS KVを同期中..."
PROD_EVENTS_ID="ef49185c58d04a0790e7c68394d78089"

bunx wrangler kv key list --namespace-id=$PROD_EVENTS_ID --env=prod --remote | jq -r '.[].name' | while read -r key; do
  echo "  - $key をコピー中..."
  value=$(bunx wrangler kv key get "$key" --namespace-id=$PROD_EVENTS_ID --env=prod --remote)
  bunx wrangler kv key put "$key" "$value" --binding=BICCAME_MUSUME_EVENTS --local
done

echo "✅ BICCAME_MUSUME_EVENTS KVの同期が完了しました"
echo "🎉 すべてのKVデータの同期が完了しました！"
