# Bot Worker

Phase 2のTL取得・OpenAI互換Responses解析・Discord Bot API候補通知を実装しています。
移植元は `qtmleap/biccame-musume-workers@538fe1b05dd631ebe38e76b894a0949d840709e7`。
40店舗の対応・署名パッケージ・5分窓・UUID・作成ボタンを維持しています。X投稿の移設は未着手です。

本番切替前なので全環境のcronは空で、`TL_NOTIFICATIONS_ENABLED=false`。
明示scheduled実行も、このフラグと全Bindingsが揃わなければ通知しません。
HTTPは404のみ。named `BotService.ping` は無副作用の疎通用で、ブラウザや公開管理APIからbotを直接呼びません。

## 検証

- `bun run build:bot`: `workers/bot/dist` に単体bundleを生成。
- `bun run typecheck`: app/botの型検証。
- `bun test`: 架空データ・mock外部通信で単体テスト。
- `bun run test:bot-rpc`: 生成bundleをMiniflareで動かし、mock app → named Service Bindingの結合検証。外部通信は禁止。
- `bun scripts/compare-bot-migration.ts --source=<読込済み旧ソース>`: 架空入力で旧実装とAIリクエスト・店舗対応・Discord payloadを比較。旧ソース側の依存解決が必要。

通常devセッションのauxiliary Workerとして接続し、追加サーバーは不要です。
appの `BOT` はserve時だけ追加し、既存staging/productionのappデプロイをbotへ依存させません。

## 設定と保証範囲

必須Bindingsは `TWITTER_BEARER_TOKEN` / `TWITTER_AUTH_TOKEN` / `TWITTER_CSRF_TOKEN`、
`DISCORD_TOKEN` / `DISCORD_CHANNEL_ID`、`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`。
キー名の読み替えやprocess.env fallbackはありません。監視用Webhookと候補通知用Bot APIを混ぜません。
DB Binding・公開投稿API・永続送信履歴はありません。取得窓は実行時刻基準で、旧実装のミリ秒の扱いも維持します。
AIは既存のtimeout60秒/maxRetries2、X検索はtimeout30秒・最大5ページを維持します。

安全性変更: API本文・tweet本文・認証情報を失敗ログに含めません。Discord 429/非2xxは固定分類で失敗させ、
無制限の再帰再送を廃止しました。送信タイムアウト/ネットワーク失敗は成功不明として自動再送しません。
候補通知のallowed_mentionsは旧契約を維持し、抑止追加は別変更として扱います。

## デプロイ

同名Workerを継承します: production=`musume-workers`、staging=`musume-workers-staging`。
旧repoの自動デプロイ停止、旧cron停止と反映確認、登録済みsecretの保持確認、切替窓の記録が先です。
このrepoのCIはbundle/RPC検証だけで、botを自動デプロイしません。
GitHub Packagesの署名依存を読むため、CIのpackages:readと旧private packageのActions accessが必要です。

承認済みの停止状態デプロイに限り、同じ環境でビルドして `bun run deploy:bot --env=staging` または
`--env=production` を明示します。入口は生成Wrangler設定と環境名・空cron・無効通知フラグを検証します。
本番有効化と実通知検証は別途承認・運用確認が必要です。旧Worker/repoは直後に削除・archiveしません。
