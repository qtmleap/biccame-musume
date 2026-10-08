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

`bun --no-env-file run archive:list-posts --dry-run` で固定期間とクエリを確認します。標準リストは `2019028800869413128`、開始は実行日のJST暦日から1年前の午前0時、終了は固定した実行開始時刻です。今日の投稿も対象です。
`--from` / `--until` は厳密な `YYYY-MM-DD` のJST午前0時、開始を含み終了を含みません。未来の終了日は拒否します。

```sh
bun --no-env-file --env-file=/absolute/path/.dev.vars scripts/archive-list-posts.ts \
  --out .cache/list-posts/single-range --max-pages 10
bun --no-env-file --env-file=/absolute/path/.dev.vars scripts/archive-list-posts.ts \
  --out .cache/list-posts/single-range --resume --max-pages 100
# 旧日別cacheの生応答を保存したまま、新しい出力へ引き継ぐ
bun --no-env-file --env-file=/absolute/path/.dev.vars scripts/archive-list-posts.ts \
  --seed-from .cache/list-posts/year --out .cache/list-posts/single-range-seeded --max-pages 10
```

認証は環境の `TWITTER_AUTH_TOKEN` / `TWITTER_CSRF_TOKEN`、任意の `TWITTER_BEARER_TOKEN`（未指定なら共有transportの公開bearer）です。`--no-env-file` は自動dotenv読込を抑止し、明示的な `--env-file` は読めます。別workspaceの認証情報を自動探索しません。`--help` / `--dry-run` は認証・通信不要です。

既存botの署名付きSearchTimeline（Latest/count20）で、期間全体の固定クエリを1つ作り、cursorだけを進めます。日別分割・cursorリセットはしません。日付演算子のタイムゾーンは未検証なので、期間の外側だけ開始D-1〜終了D+2まで余分に検索し、正規化行は正確なJST瞬間で絞ります。本文・返信・ハッシュタグで除外せず保存し、LLM/D1/Discord/イベント更新/cron変更は行いません。

空AddEntriesにも次cursorがあれば継続します。継続リクエストで厳密なTop/Bottom置換ペアのみが3回連続した場合は経験的な検索終了と判定し、途中のtweet/AddEntries/moduleは確認回数をリセットします。明示的Bottom終了・次cursorなしも終了理由を区別して保存します。未知形式/取得不可tweet/エラー/cursor循環/次cursor付き同一IDのみの非進行は未完了です。日付順や未検証の検索深度上限を仮定せず、最古の投稿が開始時刻より新しいだけで失敗扱いにしません。
`complete` はcursor走査が終了した意味で、`coverageVerified:false` のままです。全期間・全履歴の網羅性を保証しません。

出力先とseed元は同じCWDの `.cache` 配下で、同一・内包関係・symlinkを拒否します。schema3 `scope.json` は期間/list/query/policy/seed descriptorのfingerprintを固定し、`pages/` は新しい範囲クエリのHTTP-200生応答を先に保存するjournalです。schema2の旧出力をそのままresumeすることはできません。
`--seed-from` は新規出力専用で、元の正確なfrom/until/listを引き継ぎます。明示したlist/日付が一致しない場合は拒否し、非午前0時の保存終了時刻に日付だけのuntilは一致しません。`--resume` との併用は禁止です。
旧scope/fingerprint/連番/cursor/日別切替/応答形式/欠けたjournal/lockを読み取りで検証し、元ファイルを変更しません。最後に保存した対応済みのcursor循環/非進行停止ページも生投稿を引き継げますが、その後に続くページは拒否します。生応答とscopeをstagingへ複製し、hashと完了markerを検証してから `seed/` をatomic renameし、新scopeを公開します。旧cursorは引き継がず範囲クエリを最初から始めます。
旧正規化JSONLではなく全生応答を全期間で再評価します。seedで得たIDと新queryの進行IDは別管理するため、既知のseed投稿が再度現れても非進行扱いにしません。新出力のseedは自己完結し、resume時にhash/markerを再検証します。元cacheの移動・削除に依存しません。

`posts.jsonl` はtweet IDで重複除外した本文・時刻・投稿者・返信先ID・hashtag・URL・元metadataです。同じIDは最後のjournal metadataを採用します。heapには軽いauthor/timeと最終journal位置だけを保持し、JSONLは各pageを再読してtempへstream後renameします。出力件数がID indexと一致しなければ失敗します。
`checkpoint.json` / `manifest.json` はページごとに更新し、JSONLは開始/resume/通常終了時に生成します。強制終了直後はJSONLがjournalに遅れる場合があり、resumeで復元します。保存済みの失敗ページや欠けたjournalを削除・編集して成功扱いにしません。未対応形式はparser修正と検証、取得元エラーや期限切れcursorは元出力を残し必要な範囲を別の新出力へ収集します。

manifestには新queryのpages、別集計のseedPages、全ユニーク投稿数、全accountの件数降順/identity key順一覧、最古の範囲内新query時刻、`seedMatchedByQuery` / `seedOnlyPosts`、固定分類のrequestFailureを保存します。安定したauthor IDを優先し、IDなしはcase-insensitive handle bucketを別保持します。同じIDのhandle変更はまとめ、別ID/IDなしを推測で結合しません。
stderr進捗は新queryが返した最古のJST日付（範囲外の余分な取得も含み、未観測は `-`）、投稿数、新queryページ数、seedページ数、観測account数と上位最大5件です。範囲内最古時刻のcoverage診断とは分け、投稿数は範囲内だけです。日別完了率は表示しません。ANSI対応TTYではCRで同じ行を端末幅内に更新し、redirect/TERM=dumbは改行形式です。表示失敗/切断は収集を止めず、stdoutには最終JSON（完了理由・safe requestFailure・最古時刻・未検証coverage）を返します。

標準上限は実行ごとに1000 SearchTimeline呼出し、間隔1500ms、`--max-pages` / `--max-requests` の小さい方で停止します。署名初期化の公開GETは上限外です。429/認証/ネットワーク失敗は自動retryせず、分類と整数HTTP statusだけを記録しcheckpointからresumeできます。秘密・SDK本文・stackを診断に出しません。投稿本文/公開metadataはcacheに含まれます。
終了コードは走査終了0、保存済み未完了2、設定/ファイルエラー1です。同時実行は `.lock` で拒否します。強制終了の残存lockは所有処理の停止確認後にそのlockだけを削除します。

### ネイティブListタイムラインの保存

`archive:list-timeline` は同じ保存・再開・署名・進捗処理で `ListLatestTweetsTimeline` を取得します。`--help` / `--dry-run` も通信不要です。標準出力先は `.cache/list-timeline/<実行時刻>`、1回の取得はcount20、各実行の上限は1000ページ/1000リクエストです。List版の `--delay-ms` はリクエスト開始同士の最小間隔で、標準2000msです。取得・解析・保存の処理時間を含め、800ms処理した場合は残り1200ms、処理に2秒以上かかった場合は追加で待ちません。各実行の最初のリクエストは直ちに開始します。上限を増やす場合は両方を指定します。

```sh
bun --no-env-file run archive:list-timeline --dry-run
bun --no-env-file --env-file=/absolute/path/.dev.vars scripts/archive-list-timeline.ts \
  --out .cache/list-timeline/year --max-pages 10000 --max-requests 10000
bun --no-env-file --env-file=/absolute/path/.dev.vars scripts/archive-list-timeline.ts \
  --out .cache/list-timeline/year --resume --max-pages 10000 --max-requests 10000
```

list IDと期間の既定値・JST境界・終了コードはSearch版と共通です。期間は取得後のローカル絞り込みで、サーバーへ日付検索は送りません。会話module内の親・返信・RTの生metadataも保存し、account集計には範囲内の会話参加者も含みます。進捗日付はトップレベルの単独tweetで観測した最古のJST日付です。会話moduleだけでは日付を更新せず、未観測は `-`、manifestのmin/maxには全投稿を含みます。日付順・1年分への到達を推定しません。

明示的Bottom終了または次cursorなしでのみ `list_exhausted` とし、`coverageVerified:false` のままです。空ページ・cursor置換ペア・既知IDだけの会話でも、新しいcursorがあれば継続します。cursor循環・予算終了・429・未知形式・取得不可tweet/tombstone/ShowMoreは未完了として生応答を残します。会話の展開取得は行いません。`--seed-from` は非対応で、Search版のcacheと相互resumeできません。

List版は既定で一時障害を同じcursorから自動retryします。対象は投稿を含まない観測済みの単一 `Operational / DependencyError / Server`、確認できた通信/timeout障害、HTTP 408/429/500/502/503/504です。初期間隔5000msを失敗ごとに倍増して60000msまで待ち、正常な応答で戻します。retry待機は通常の間隔の残り時間との大きい方を使い、合算しません。処理時間でretry待機自体を短縮しません。429は最低60秒待ち、検証済みの `Retry-After` / `x-rate-limit-reset` がより長い待機を指示する場合は最大24時間まで優先します。他の対象HTTPエラーは `Retry-After` だけを使い、quotaの窓を表す `x-rate-limit-reset` は使いません。進捗は `retrying`・試行番号・予定待機秒数・固定分類を表示し、残り秒数のcountdownではありません。

`--retry-delay-ms` / `--max-retry-delay-ms` はList版だけで使え、0以上の整数かつ上限が初期間隔以上である必要があります。`--no-retry` は一時障害で停止して手動resumeする従来の動作です。retryの回数自体に別上限は設けず、全リクエスト試行を `--max-pages` / `--max-requests` の予算に含めます。予算終了時は最後の固定分類を残して `budget` で停止します。`retriesThisRun` はその実行で実際に行った再試行回数です。HTTP-200の失敗応答もjournalに残し、回復応答を次の連番へ追記します。scope・保存済み生応答を書き換えず、`--resume` で失敗ページを含むcursorチェーンを再構築します。

設定/署名の不具合・認証エラー・部分応答・未知形式・cursor循環は自動retryしません。署名初期化中に確認できた通信障害だけは対象です。Search版の停止方針と保存scopeは共通処理の変更後も維持します。

固定endpointは `/i/api/graphql/1LE3u14FJjPZUHKFGzos2g/ListLatestTweetsTimeline` です。X側のquery IDや応答形式が変わる場合は更新・検証が必要です。endpointと取得元固有の終了policyもscope fingerprintに含め、変更前のjournalへ異なる取得元を混在させません。

## デプロイ

同名Workerを継承します: production=`musume-workers`、staging=`musume-workers-staging`。
旧repoの自動デプロイは停止済みです。このrepoのdeployment workflowが、app → bot RPC検証 → botの順にデプロイします。
stagingは通知無効・cronなしのみ許可します。productionの有効設定は`--allow-active-production`を明示した入口だけが受け付けます。
appの`BOT`は同じ環境のbotを、botの`APP`は同じ環境のappを参照します。旧Worker/repoは直後に削除・archiveしません。
