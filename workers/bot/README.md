# Bot Worker

TL取得・OpenAI互換Responses解析・Discord候補通知と、X告知・日次処理・投稿用アカウント確認を集約するWorkerです。
TLの移植元は `qtmleap/biccame-musume-workers@538fe1b05dd631ebe38e76b894a0949d840709e7`。
40店舗の通知範囲・5分窓・UUID・作成ボタンを維持しています。

production botがTL通知・X告知・日次処理を担当します。cronは `*/5 0-12 * * *` と `0 0 * * *`。
localとstagingのcronは空で、`TL_NOTIFICATIONS_ENABLED`、`X_POSTING_ENABLED`、`X_ACCOUNT_READ_ENABLED` はfalseです。
appはX認証情報・X直投稿・日次X処理を持たず、保存後の告知と管理画面確認を`BOT` Service Binding経由で依頼します。
appの日次cronはバッジ再評価だけを独立実行します。
HTTPは404だけで、ブラウザや公開管理APIからbotを直接呼びません。

## RPC

- `BotService.ping`: 無副作用の疎通。
- `BotService.announce`: appが保存済みイベントの用途・UUID・更新版・生成済み本文を渡す。認証主体確認後に1回だけ投稿する。
- `BotService.accountStatus`: 管理画面向けの公開プロフィール読み取り。日次の認証主体確認とは別契約。
- `BotService.postingSessionStatus`: 投稿しない認証主体確認。成功/固定分類だけを返し、アカウント名・secretを返さない。
- `AppBotReadService.dailyTargets`: appが既存のJST境界と本文builderで日次スレッド本文を返す読み取り専用RPC。

担当が`bot`のとき、app側はbot失敗・成功不明・無効でも直接投稿へfallbackしません。
botは成功不明の投稿やスレッドを自動再送しません。appはバッジ再評価を独立して維持します。

## 検証

- `bun run build:bot`: `workers/bot/dist` に単体bundleを生成。
- `bun run typecheck`: app/botの型検証。
- `bun test`: 架空データ・mock外部通信で単体テスト。
- `bun run test:bot-rpc`: 生成bundleをMiniflareで動かし、named BotServiceと、本物のscheduled → named AppBotReadService → Xスレッドを検証。外部通信は禁止。
- `CLOUDFLARE_ENV=<env> bun run build` / `build:bot`: 環境別のapp→`BotService`、bot→`AppBotReadService`を生成。初回だけ`BICCAME_BOT_BOOTSTRAP=1`でbotのapp依存を外せます。
- `bun run check:bot-stores`: canonicalな公開JSONから生成した40店舗の対応が最新か確認。
- `bun scripts/compare-x-signers.ts --legacy-module=<旧0.1.0>`: 旧private signerと共通signerの固定時刻・乱数比較。
- `bun scripts/build-bot-phase2.ts`: Phase 3を混ぜず、Workers互換修正済みPhase 2候補を隔離ビルド・テストする。

通常devセッションのauxiliary Workerとして接続し、追加サーバーは不要です。

## 設定と保証範囲

TL必須Bindingsは `TWITTER_BEARER_TOKEN` / `TWITTER_AUTH_TOKEN` / `TWITTER_CSRF_TOKEN`、
`DISCORD_TOKEN` / `DISCORD_CHANNEL_ID`、`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`。
X投稿は `TWITTER_AUTH_TOKEN` / `TWITTER_CSRF_TOKEN`、日次監視は `DISCORD_WEBHOOK_URL` を使います。
キー名の読み替えやprocess.env fallbackはありません。監視Webhookと候補通知用Bot APIを混ぜません。
TL用と投稿用の認証主体が同一だと仮定せず、投稿前に期待する主体を確認します。

botにDB Binding・公開投稿API・永続送信履歴はありません。取得窓は実行時刻基準で、旧実装のミリ秒の扱いも維持します。
Workersが`redirect: 'error'`を拒否するため`manual`を使い、3xxを成功や認証済みとして扱いません。
API本文・tweet本文・認証情報を失敗ログに含めません。Discord 429/非2xxは固定分類で失敗させ、無制限の再帰再送を廃止しました。
候補通知のallowed_mentionsは旧契約を維持し、抑止追加は別変更として扱います。

## デプロイ

同名Workerを継承します: production=`musume-workers`、staging=`musume-workers-staging`。
旧repoの自動デプロイは停止済みです。このrepoのdeployment workflowが、app → bot RPC検証 → botの順にデプロイします。
stagingは通知無効・cronなしのみ許可します。productionの有効設定は`--allow-active-production`を明示した入口だけが受け付けます。
appの`BOT`は同じ環境のbotを、botの`APP`は同じ環境のappを参照します。旧Worker/repoは直後に削除・archiveしません。
