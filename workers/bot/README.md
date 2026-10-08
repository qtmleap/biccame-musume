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

## リスト投稿のローカル保存

`bun --no-env-file run archive:list-posts --dry-run` で対象期間・クエリ・リクエスト上限を確認します。
標準リストは `2019028800869413128`、開始は実行日のJST暦日から1年前の午前0時、終了は実行開始の固定時刻です。今日の投稿も対象です。
`--from` / `--until` は厳密な `YYYY-MM-DD`、JST午前0時です。開始を含み、終了を含みません。未来の終了日は拒否します。

```sh
bun --no-env-file --env-file=/absolute/path/.dev.vars scripts/archive-list-posts.ts \
  --out .cache/list-posts/year --max-pages 10 --max-requests 10
bun --no-env-file --env-file=/absolute/path/.dev.vars scripts/archive-list-posts.ts \
  --out .cache/list-posts/year --resume --max-pages 100 --max-requests 100
```

認証は環境の `TWITTER_AUTH_TOKEN` / `TWITTER_CSRF_TOKEN`。`TWITTER_BEARER_TOKEN` は任意で、未指定なら共有transportの公開bearerを利用します。
`--no-env-file` はBunの自動dotenv読込を抑止します。明示した `--env-file` は読めます。別workspaceの認証ファイルを自動探索しません。
`bun --no-env-file run archive:list-posts` として起動側も自動dotenv読込を抑止し、認証はshell環境から渡すか上記の明示ファイル形式を使います。`--help` / `--dry-run` は認証・通信不要です。

既存botと同じ署名付きSearchTimelineを使い、Latest/count20を維持します。APIの日付演算子のタイムゾーンは未検証なので、JSTの各暦日DごとにD-1からD+2まで保守的に余分に検索し、保存する正規化行は正確なJST瞬間で絞ります。
空のAddEntriesにも次cursorがあれば継続し、5ページで打切りません。ツイートの日付順を仮定せずcursorを辿ります。実データで続いたcursor置換だけの応答は、継続リクエストで厳密なTop/Bottom置換ペアが3回連続したとき、その日の検索終了と判定します。途中のtweet・AddEntries・moduleは確認回数をリセットし、エラー・未知形式・cursor循環を終了扱いにしません。
検索でアクセスできた投稿をキーワード・返信・ハッシュタグで除外せず保存します。LLM、D1、Discord、イベント更新、cron変更は行いません。

出力先は `.cache` 配下だけです。`scope.json` はlist/期間/クエリ仕様の固定scope（schema 2、終了判定policyもfingerprintに含む）、`pages/000001.json` 以降はHTTP-200応答全文・日別slice/query・request cursorの先行保存journalです。
`posts.jsonl` はID単位で重複を除いた本文・投稿時刻・投稿者・返信先ID・ハッシュタグ・URL・元のtweet metadataです。visibility wrapperと長文noteも保持します。
`checkpoint.json` と `manifest.json` はページごとに保存する再構築可能な派生ファイルです。JSONLは起動/再開と通常終了時に生成し、強制終了直後はjournalより遅れることがあります。再開すると復元します。manifestに日別完了状態・終了理由・対象期間内の件数/時刻範囲・範囲外件数・最小/最大時刻・完了理由を記録します。秘密情報をscope/ログへ保存しませんが、投稿本文や公開metadataを含むので出力を共有する際は注意してください。

標準上限は実行ごとに1000 SearchTimeline呼出し、間隔1500ms。`--max-pages` / `--max-requests` の小さい方で停止します。署名初期化の公開GETはこの上限に含みません。
完了は「保存したpolicyで各日の検索を終了した」意味です。日別terminalReasonは明示的Bottom終了・次cursorなし・3回連続cursor置換確認を区別します。最後の判定は経験的なもので、正式なAPI網羅性や過去の全投稿が保存される保証ではありません。
上限・認証/ネットワーク/429・未知形式/取得不可tweet・cursor循環・次cursorがある同一IDのみの非進行ページでは未完了を記録し、自動再試行しません。
終了コードは検索終了0、保存済み未完了2、設定/ファイルエラー1です。
実行中の進捗はstderrへ表示し、stdoutの最終JSONは維持します。ANSI対応TTYではCRで同じ行を更新し、端末幅を超えないよう上位最大5アカウントを省略します。JSTの対象日、完了日数/総日数、journalに保存済みの範囲内ユニーク投稿数・ページ数、観測アカウント数を表示します。redirect/TERM=dumbでは改行形式です。表示の失敗やstderrの切断は収集を停止しません。
manifestのaccountsには全観測アカウントを件数降順・identity key順で記録します。安定したauthor IDを優先し、IDがない場合は大文字小文字を区別しないhandle bucketを別に保持します。同じIDのhandle変更はまとめますが、同じhandleを別IDが使う場合やIDなしの投稿は推測して結合しません。件数はtweet IDで重複除外し、範囲外投稿を含みません。

`--resume` は保存済みscopeを使い、明示したlist/日付が違えば拒否します。翌日の再開でも終了時刻を延長しません。journalを検証しJSONL/checkpointを再構築します。旧schema/policyの出力は変更せず再開を拒否するので、新しい出力先を使います。
同じ出力の同時実行は `.lock` で拒否します。プロセス強制終了後にlockが残った場合は、同じ出力を利用する処理が停止済みと確認してからその `.lock` だけを削除します。
古いcursorが期限切れ・未知形式・非進行になった場合は、元の出力を残したまま新しい `.cache` ディレクトリを指定し、必要な日付範囲を再収集します。
未知形式・取得不可tweetを保存したページは再開時も未完了になります。取得元エラーなら元の出力を保持して残りの日付範囲を新しい出力先で収集し、未対応の有効な形式ならparserを修正して検証します。壊れた/欠けたjournalや保存済みの失敗ページ、checkpointを削除・編集して成功扱いにしないでください。元データを保持した新しい収集は後でtweet IDで統合できます。CLI診断は固定分類だけを表示し、SDK本文・認証情報・stackを出しません。

## デプロイ

同名Workerを継承します: production=`musume-workers`、staging=`musume-workers-staging`。
旧repoの自動デプロイは停止済みです。このrepoのdeployment workflowが、app → bot RPC検証 → botの順にデプロイします。
stagingは通知無効・cronなしのみ許可します。productionの有効設定は`--allow-active-production`を明示した入口だけが受け付けます。
appの`BOT`は同じ環境のbotを、botの`APP`は同じ環境のappを参照します。旧Worker/repoは直後に削除・archiveしません。
