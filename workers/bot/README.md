# Bot Worker

Phase 1の骨格です。named `BotService` の `ping` RPCのみ実装し、HTTPは404を返します。
TL調査・AI解析・Discord候補通知・X投稿は未実装です。全環境のcronは空で、明示的なscheduled実行にも副作用はありません。

- `bun run build:bot`: bot単体のbundleを `workers/bot/dist` に生成。
- `bun run typecheck`: app/botの型検証。
- `bun run test:bot-rpc`: 生成bundleを使い、mock appからService Binding RPCを結合検証（外部通信禁止）。事前に `bun run build:bot` が必要。
- 通常の `bun run dev` のauxiliary Workerとして接続。別サーバーは不要。appの `BOT` はserve時だけ追加し、staging/productionのappデプロイには含めません。

Worker名は骨格専用の仮名です。旧TL Workerの名前・デプロイ所有権はPhase 2開始時に確認します。
CIはbundle/RPC検証だけを行い、botを自動デプロイしません。botにはDB・secret・外部通知権限を追加していません。

承認済みの手動デプロイに限り、同じ環境でビルドした後 `bun run deploy:bot --env=staging` または `--env=production` を明示します。
入口は生成Wrangler設定のパス・Worker名・空cronを検証し、環境違いのbundleを拒否します。本番切替は別途承認が必要です。
