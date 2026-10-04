# Bot Worker 統合計画

作成日: 2026-10-03  
状態: Phase 1完了、Phase 2のTL実装・mock/dry-run比較完了。本番TL切替・安定観測は未実施のためPhase 3は未開始。

## 1. 目的と対象

`qtmleap/biccame-musume-workers` のTL調査・AI解析・Discord通知と、本体のX投稿・連携監視・イベント告知を同じリポジトリで管理する。デプロイ単位は `workers/app` と `workers/bot` に分ける。

- app: UI、公開・管理API、イベント登録、D1/Prisma、投票・バッジ評価。
- bot: TL取得、配布情報の抽出、Discord通知、X投稿、日次開始・終了告知、X認証監視。
- shared: 通信契約、キャラクター・店舗の共通定義、X認証・transaction生成の共通基盤。

TLから検出したイベントは、既存どおりDiscordの作成ボタンから管理画面で確認して登録する。検出から即DB登録する機能には変更しない。

この計画の作成だけでは実装・本番デプロイ・外部へのテスト投稿を承認した扱いにしない。

## 2. 移行済みの前提

```text
workers/
  app/                 # 本体のソース・設定・public資産
  bot/                 # Phase 1の骨格、named RPC、cron分類、単体bundle
packages/
  shared/              # 無副作用pingの通信スキーマのみ。X/DB/UIは未抽出
prisma/                # 本体D1のスキーマ・マイグレーション
__tests__/             # 共通のテスト入口
scripts/               # 生成・検証・デプロイの補助
```

- ルートはBun workspace。依存の既存バージョンとルートコマンドを維持。
- 本体のcanonical設定は `workers/app/wrangler.toml`。ビルド出力は `workers/app/dist/`。
- ローカルDBはルート `.wrangler/state`、環境ファイルもルートに保持する。値をソースや生成設定のvarsへコピーしない。
- Viteビルド後のWorker設定を用いてデプロイする。入力Wrangler設定や古い出力を直接デプロイしない。
- 移行時の確認: 全体572テスト成功、ビルド専用テストは別途実行して成功、型チェック・Knip・Storybookビルド成功。Storybookは316 exports / 203 stories。
- トップ、キャラクター一覧・詳細、イベント一覧、カレンダー、地図、管理画面をブラウザ確認。イベント一覧とカレンダーの描画完了後画像は移行前と一致。
- KnipにはCSS/MDXの解析範囲に関する案内が残る。静的解析の成功だけで資産・動的参照の正常性を判断しない。
- オープンなUI改善・イベント告知重複防止・X連携のPRを勝手にマージしない。新作業開始時にブランチ・PR・レビューコメントを再確認する。

## 3. 現行処理で維持する契約

| 処理 | 現行の担当 | 統合後 |
| --- | --- | --- |
| イベント作成・更新 | appの管理API | appに維持 |
| イベント作成・更新に伴うX告知 | app | botへ依頼 |
| 開始・終了イベントの日次X告知 | appのdaily-cron | bot |
| 認証主体を確認する日次X監視 | appのtwitter-health | bot |
| 直近25時間の対象ユーザーのバッジ再評価 | appのcron | 対象条件を変えずappに維持 |
| XリストのTL取得・配布情報抽出 | 別リポジトリ | bot |
| 作成ボタン付きDiscord通知 | 別リポジトリのDiscord Bot API | bot、方式と導線を維持 |
| X監視エラーのDiscord通知 | appのWebhook | bot、用途を分離 |

別リポジトリの `post` はDiscordへの投稿であり、Xへの告知は本体側の処理。Discord Bot APIと監視用Webhookを同じ設定として読み替えない。

別リポジトリのAI解析はOpenAI互換Responses API。今回の統合でWorkers AIに置換しない。

X監視の現行仕様・安全な失敗分類は [twitter-health.md](../fix/twitter-health.md) を参照する。公開プロフィールの取得成功を、認証済みアカウントの確認成功として扱わない。

## 4. 実装境界

### 4.1 Worker間通信

Service Binding RPCを第一候補にする。ブラウザからbotを直接呼び出さず、botに公開管理APIや公開投稿APIを追加しない。

- app → bot: 作成・更新後の告知依頼。イベント保存とは別の副作用として扱う。
- bot → app: 日次告知対象の読み取り。appが既存のイベント取得条件・JST境界を適用して返す。
- 管理画面 `/admin/twitter` のX確認も、投稿用認証の移設に合わせてapp経由の読み取りRPCへ移す。公開プロフィール確認と日次の認証主体確認は別の契約として維持する。

RPCは役割別のnamed `WorkerEntrypoint` を使用し、plain objectの入出力契約をsharedで定義する。日付は明示したISO文字列・日付文字列で渡し、Prismaモデルや内部例外をそのままシリアライズしない。境界でスキーマ検証する。

botに本体DBの書き込み権限を与えない。本体のHTTP APIを認証なしでループバック呼び出しする方式も採用しない。初期設計ではbotに本体D1の直接bindingを追加せず、既存appサービスを読み取りRPCから再利用する。

具体的なRPC名・入力項目は実装開始時に確定する。イベントUUID、更新版、通知の用途、対象日時を区別できる契約にする。

### 4.2 sharedの抽出

- 最初のTL移植は現行の署名実装・店舗対応を維持し、処理移植とX基盤の書き換えを同時に行わない。private `@qtmleap/x-transaction` を一時的に維持する場合は、GitHub Packagesの読み取り権限と対象repoのActions accessを確認する。
- TLの安定後に、本体の自前X transaction生成への統一を比較テスト付きで実施し、private packageへの重複依存を解消する。
- Xクライアントは認証・検索・投稿・アカウント確認を分離し、共通基盤にappのDB・UI・Bindings全体を持ち込まない。
- キャラクター・店舗の対応は最終的に既存データから導出する。現行の名称・alias・店舗ID対応と比較してから、別リポジトリの直書きを置き換える。
- botはapp専用の `virtual:public-characters` に依存させない。共有データの通常JSON/TS importまたは生成モジュールを提供し、ブラウザ向け `/characters.json` の公開契約は維持する。
- DBクライアントやUI部品はsharedへ移さない。必要のない汎用化・依存バージョン更新を同時に行わない。

### 4.3 ローカル開発・ビルド

- Viteの `auxiliaryWorkers` にbotを登録し、既存の単一開発セッションからService Bindingを解決する。通常devサーバーをもう1台勝手に起動しない。
- app/botは別のWorker設定と出力を持つ。auxiliary Workerはappのdeployだけではデプロイされないため、明示的なbot用deploy入口を用意する。
- 生成設定のconfigPath、assets、bindings、D1 migration path、環境名、cronをテストする。今回修正したconfigPath偽装を再導入しない。
- CIの単体テスト・型・Knip・app/Storybookビルドを維持し、botのbundleとRPC結合検証を追加する。

### 4.4 Worker名とデプロイ所有権

最初のTL移植では、既存TL Workerの名前を引き継ぎ、デプロイ元だけを本体repoへ移す案を優先する。既存の環境名・secret・設定の保持を確認し、旧repoの自動デプロイを停止してから実行する。

新しいbot Worker名にする場合は、Service Binding先・環境別secretの新規登録・旧cron停止・ロールバック用Worker保持が追加で必要になる。同名継承と新規Worker作成を混在させない。実装開始時に現在のWorker名と運用を確認して採用案を確定する。

## 5. cron・取得窓・重複防止

### 5.1 スケジュール

UTC表記を維持する。

| Worker・処理 | cron | 備考 |
| --- | --- | --- |
| bot: TL調査 | `*/5 0-12 * * *` | 現行の取得時間帯を維持 |
| bot: X監視・日次告知 | `0 0 * * *` | JST09:00 |
| app: バッジ再評価 | `0 0 * * *` | X監視の失敗から独立 |

botのscheduledは `controller.cron` を厳密に分岐する。UTC00:00にTL用と日次用が両方発火しても、日次告知が二重実行されないようにする。未知のcronは副作用なしで失敗を記録する。

productionだけ自動通知を有効にする。staging/localのcronは空にし、結合テストはmockされた外部通信で明示実行する。

### 5.2 取得窓と状態

現行のTL処理には永続的な通知済み管理がない。既存データの移管が必要な送信履歴があると仮定しない。

第一段階のTL移植では、現行の直近5分窓とイベント作成URLのUUID規則を維持する。署名統一・時刻窓変更・永続通知管理を移植の同時必須条件にしない。新旧を同時に実行しない切替と、切替窓の記録を必須にする。

TLの安定後に行う改善候補は以下。通知内容や頻度が変わるため、個別の仕様・テストを確定してから実装する。

- 取得基準を実行時刻の `Date.now()` から `scheduledTime` へ変更し、遅延時の窓を安定させる。
- tweet ID・候補index・内容版を区別する送信識別子と永続的な送信履歴を追加する。
- 窓の境界と限定的な再走査を設計する。無制限に過去TLを検索しない。
- 同時claimが必要ならDurable Object等の一貫した状態管理を用いる。KVだけのread→writeを排他制御として扱わない。
- 日次スレッドの再試行を追加する場合は、投稿単位の成功と返信先IDを保持し、作成・更新・日次告知を同じキーに混ぜない。

Queue/outboxも初期移植の必須条件にしない。採用する場合は永続化・再試行・失敗処理まで独立した仕様として実装する。`waitUntil` やRPC呼び出しだけを、永続的な配信保証として説明しない。

### 5.3 失敗時の保証範囲

- イベント保存が成功した後に通知が失敗しても、保存を巻き戻さず、HTTPの既存応答契約を維持する。
- 送信前の失敗、明示的な拒否、送信成功、成功したか不明なタイムアウトを区別する。
- 外部サービスが受理した直後の応答喪失ではexactly-onceを保証できない。成功不明の投稿を無条件に自動再送しない。
- 再試行を追加する場合は、上限・バックオフ・期限・手動確認の条件を先にテストする。
- 認証・連携監視が失敗した場合は現行どおり日次X告知を止める。バッジ再評価を止めない。

## 6. secret・権限・設定

| 用途 | 扱い |
| --- | --- |
| X Cookie/CSRF/Bearer | TL用Bearer設定も移設対象。既存Bindingsから正確なキー名・secret/vars区分を確認し、認証方式を維持。TL用と投稿用が同一アカウントかは値をログに出さず確認 |
| Discord候補通知 | `DISCORD_TOKEN` / `DISCORD_CHANNEL_ID` を移設。Bot APIのボタン付き通知を維持 |
| Discord監視 | `DISCORD_WEBHOOK_URL` は別用途のsecretとして維持 |
| AI解析 | `OPENAI_API_KEY` をsecret、base URL・modelを既存の区分に合わせて移設 |
| 本体の認証・DB | appに維持。botへ不要な権限を渡さない |

- 誤綴り・旧キー名の互換読み替えを追加しない。キー名・設定場所の確認なしに移設済みと扱わない。
- secretの内容を読んで表示しない。ソース、fixtures、スクリーンショット、生成Wranglerのvarsへ実値を入れない。
- app/botとproduction/stagingのbinding先・secret登録先を明確に分離する。新しいWorker名なら必要secretを各環境へ登録し、同名継承なら既存登録が保持されることを確認する。stagingには本番通知先を不用意に設定しない。
- Cookie・Webhook URL・API生レスポンス・予期しないアカウント名を例外や通知に含めない。許可した失敗分類だけを出す。
- 監視Webhookのメンション抑止は維持する。候補通知のBot APIには現状同じ抑止がないため、「既存どおり」と扱わず、必要な抑止追加は別の安全性変更として検証する。

## 7. 実装順序と合格ゲート

実装サブエージェントは同時に1体。各段階で親がdiff、git履歴、実際のテスト結果を確認する。自動commit/pushはさせない。

### Phase 1: botの骨格・共通契約

- [x] botのpackage、Wrangler、TypeScript、ローカルbinding、CI検証入口を追加する。
- [x] 最小shared packageと通信スキーマを作る。
- [x] cron分岐とstaging/localの無副作用設定をテストする。
- [x] appの既存テストと生成設定検証が引き続き成功する。表示は構成移行時の確認を維持し、Phase 1ではUI変更・追加ブラウザ撮影を行っていない。

Phase 1の補足:

- Worker名は `biccame-musume-bot-skeleton`（環境別suffix）という骨格専用の仮名。旧TL Workerの名前・所有権の確定はPhase 2で行う。デプロイは未実施。
- appの `BOT` BindingはVite serve時だけ追加する。未デプロイbotへの依存で既存appのデプロイを壊さないよう、staging/productionの生成app設定には追加しない。serve時のbot名は環境選択に依存しないローカル名へ固定する。
- botのcronはproductionも空。明示scheduled実行も分類・安全なログだけで、X・Discord・AIを呼ばない。DB・secretも未追加。
- `BotService.ping` をsharedスキーマで検証する。生成bot bundleをMiniflareで動かし、mock appからnamed Service Bindingを経由して疎通・入力拒否・HTTP 404を確認する。外部通信はテスト側で拒否する。
- CIはbot bundleとRPC検証のみ追加。手動deploy入口は単体botビルドの生成設定と環境名・空cronを検証し、暗黙のproduction選択や環境違いを拒否する。
- 検証: 全単体582件成功／1件build専用skip、型チェック・Knip・production/staging app生成設定・bot bundle/RPC成功、Storybook 316 exports / 203 stories。実認証・実通知は未検証。

### Phase 2: TL調査・AI解析・Discord候補通知

- [x] 別repoの現行実装を再確認して段階的に移植する。
- [x] 現行の署名・リスト・店舗対応・抽出契約・Discord作成ボタンを維持し、移植前後を比較する。
- [x] 現行の取得窓・UUID規則・失敗時の契約をテストする。永続送信管理がないという保証範囲を明記する。
- [x] 同一tweetから複数候補、未知店舗、AI不正応答、429、署名失敗、Discord失敗をmockで検証する。
- [x] 本番cronを有効にせず、dry-runで既存との出力差を確認する。
- [ ] Phase 4の検証・切替手順をTLだけに適用し、別途承認を得て本番へ切り替える。初回・継続実行の観測に問題がないことを、投稿移設の開始条件にする。

Phase 2の実装・検証記録:

- 移植元固定SHA: `538fe1b05dd631ebe38e76b894a0949d840709e7`。店舗対応は40件（型定義行を件数に含めない）。
- 同名継承を採用: production=`musume-workers`、staging=`musume-workers-staging`。全環境cron空・`TL_NOTIFICATIONS_ENABLED=false`を維持。旧repoのdeployment workflow（ID `321445935`）は本番切替承認後に`disabled_manually`を確認。CF側の旧cron停止・こちらからのデプロイは未実施。
- private `@qtmleap/x-transaction@0.1.0` と `@qtmleap/zodios@11` を維持。実際のtarball読込とfrozen install成功。CIにpackages:readを追加したが、private package側の本体repo Actions accessは未確認。
- OpenAI互換Responses、既存base URL/modelとtimeout/maxRetriesを維持。キーの読み替えやprocess.env fallbackは追加しない。
- 安全性変更: X/API/AIの内部エラーを外部へ出さない。Discordの429/非2xxを明示的な失敗とし、旧無制限再帰を廃止。ネットワーク/timeoutは`delivery_unknown`として自動再送しない。本文・通知導線・allowed_mentionsの旧契約は維持。
- 架空入力で旧ソースを直接実行し、40店舗対応・AIリクエスト本文・2候補のDiscord payloadが移植後と一致することを確認。実TL/実AI/実Discordを呼んだ比較ではない。
- テスト604件成功・1件build専用skip、型・Knip・production app生成設定・production/staging bot bundle・RPC成功。Biomeはエラーなし、移植元由来のschema/構文の警告あり。
- 未完了のゲート: CF側の旧cron停止・反映確認、既存secret保持確認、実TL切替と初回/継続観測。これが完了するまでPhase 3へ進めない。
- 本番切替の操作はユーザー承認済み。旧repoの自動deploy停止とアクティブrunなしを確認した。認証付きCF操作はユーザー実行待ちで、成功した扱いにしない。
- `scripts/inspect-bot-cutover.ts`: accountの誤指定を拒否し、cron・binding名・切戻しversion IDだけを`.cache/bot-cutover-inspection.json`へ保存。値は保存しない。
- `scripts/stop-old-bot.ts`: 5分以内のinspection、全binding名、100%単一version、既知の旧cron、旧workflow停止、アクティブrunなしを前提にする。直前のdeployment/cronドリフトを再確認し、cronだけを空にする。操作前に`stop_requested`を記録して応答喪失時の誤再試行を防ぐ。空cronの再取得成功後に`old_cron_removed`へ遷移する。
- 最大15分のcron伝播と、既に開始済みの最大15分scheduled実行の終了を考慮し、確認後30分の保守的な待機ゲートを置く。時刻経過だけを実通知の成功確認として扱わない。
- ロールバック時は保存済み旧version/cronを用いる。新処理停止と反映を確認してから旧処理を戻し、旧workflowの再有効化は担当の切戻しが確定した後だけ行う。

### Phase 3: appからのイベント告知・日次処理を移設

ユーザー承認により、認証待ちの間はコード・テスト・コミットのみ先行する。本番反映はTL切替が安定した後に限定する。TLの切替にはPhase 2の固定コミット`cfcaef85`から分離ビルドした成果物だけを使用し、Phase 3のコードを同時リリースしない。

- [x] shared X基盤・店舗対応を比較テスト付きで抽出し、署名実装の重複を解消する。
- [x] 告知RPC、管理画面X確認RPC、日次対象の読み取りRPCを実装する。
- [x] 作成・更新時の保存／告知契約を維持する。関連PRの重複防止仕様を取り違えない。
- [x] 日次開始／終了の対象日・本文・スレッド、アカウント確認、監視通知をbotへ移す。
- [x] appのバッジcronは独立して維持する。
- [ ] botに集約後、appに不要となるX実装・secret・依存だけを参照確認して削除する。本番の担当切替・安定観測後に行う。

Phase 3のコード実装・検証記録:

- `X_POSTING_OWNER`はstaging/production/localとも`app`のまま。botの`X_POSTING_ENABLED`/`X_ACCOUNT_READ_ENABLED`も全環境`false`。双方向Service Bindingは`BICCAME_BOT_RPC=1`の明示buildだけに入れ、既存のapp/bot deployへ未作成の依存を加えない。
- appは保存後、担当がbotのときだけ`BOT.announce`を1回呼ぶ。RPC失敗・成功不明・bot無効時もappから直接投稿へfallbackしない。イベントの保存とHTTP応答は維持し、UUID再送・同時作成・`shouldTweet=false`の既存抑止を担当切替後もテストした。
- RPC契約はsharedの明示スキーマ。日時はISO文字列、イベントはUUID・更新版・用途・生成済み本文だけを渡す。Prismaモデル・内部例外を渡さない。
- botは告知前と日次処理前に、Cookie認証主体を確認する。公開プロフィール取得はadmin表示専用で、認証主体確認とは区別する。成功不明な投稿・スレッド途中は自動再送しない。
- appの`AppBotReadService.dailyTargets`は既存の開始/終了取得とJST境界・本文builderを再利用する。botの日次は実際の生成bundleでscheduled → named app RPC → 2本の独立スレッドまで外部通信なしで検証した。認証失敗時はtarget読み取り・投稿を行わない。
- 担当が`bot`の場合、appの日次cronはバッジ再評価だけを独立して実行し、X投稿を行わない。未知のapp cronは副作用なしでskipする。
- TLのprivate signerをsharedの自前signerへ統一。旧`@qtmleap/x-transaction@0.1.0`との固定時刻・乱数比較で4/4 byte一致を確認し、golden fixtureとして保持。botからprivate signer依存を削除した。
- 40店舗の通知範囲は維持し、名称/Xアカウントはcanonicalな公開JSONから生成。公開JSONで追加の4店舗が対象になる変更は行わない。`check:bot-stores`で生成済みデータの陳腐化を検出する。
- Workerdは`fetch`の`redirect: 'error'`を拒否するため`manual`へ変更。3xxは成功・認証済みとして扱わない。同じ修正だけをPhase 2へ`b2bf4270`として分離し、Phase 3を混ぜない切替候補を作成した。
- 検証: 658件成功・1件build専用skip、型・Knip、production/stagingの通常build、明示RPC buildの双方向binding、生成済みbot RPC/日次結合、Phase 2候補の隔離build/RPC/TL→Discord結合が成功。実X・実Discord・実AIへの通信は行っていない。

### Phase 4: 全体検証・本番切替

- [x] app/bot/sharedの単体テスト、型チェック、Knip、app/bot bundle、Storybook、RPC結合テストを成功させる。
- [x] production/stagingそれぞれの生成設定を検証し、cron・Service Binding・DB・DO migration・環境名の混線がないことを確認する。
- [x] 主要7画面と管理連携状態のブラウザ表示を確認する。既存devサーバーが停止中のため、新規サーバーを立てず検証済みVite成果物をPlaywright routeで直接供給した。home・characters・character detail・events・calendar・location・admin・admin twitterの8画面が描画し、JS例外なし。API/Access identity/画像は架空データ・mockで、Google MapsとFirebaseの外部通信は遮断した。実地図描画・実認証・実通知の成功とは扱わない。

Phase 4のオフライン検証記録（2026-10-04, `69a23c7a` + CIテスト入口修正）:

- Biome（CI同範囲）エラーなし。移植元由来を含む既存警告は残る。型、Knip、canonical店舗データ確認が成功。
- 単体658件成功・1件build専用skip。通常`bun test`対象外だった共通transportの安全性テスト12件を`bun run test`とCIへ追加して成功。
- staging/productionそれぞれで、既定のapp/bot build（botへの依存なし）と、明示RPC build（app→`BotService`、bot→`AppBotReadService`）の生成設定テスト、bot疎通・日次RPC結合が成功。
- Storybook build 316 exports / 203 stories、カタログ検査2件成功。
- 2026-10-04 01:30 UTC: 認証は既存shell envから利用できた。旧cron停止・空cron再取得・全secret名・旧version `92cbdc1e-644a-4b10-98b8-32812b95079c`を確認。30分の伝播/実行中処理待ちを実施した。
- 02:01 UTC: Phase 2候補`b2bf4270`を同名Workerへデプロイ（version `e56d5049-16de-4a73-820e-a544ad42b84c`）。secret名保持を確認した。02:05/02:10の実行は`signature`失敗で、成功とは扱わない。検索・AI・Discordへ進んでいない。
- 02:09 UTC: 新TL cronを再停止。旧private packageの取得処理が現在のX homepageで`ondemand.s` URLを発見できないことを公開アセットの読み取りだけで再現した。
- 修正候補`c5b3e902`は署名アルゴリズム/通知契約を維持したまま公開アセット取得だけを修正した独立Phase 2版。現在の公開アセットで旧constructorによる94文字の署名生成、隔離型/単体/bundle/RPC、Workerd上のTL→AI→Discord mock結合が成功。再停止後30分の待機終了は02:39:25 UTC。
- 本番TLの正常な取得・継続観測と、Phase 3の本番反映は未完了。
- [ ] 未検証の実認証・実通知事項を明記し、本番変更は別途承認を得る。
- [ ] 旧TL Workerのcronを明示的に空配列にし、旧repoの自動デプロイが復活させないようにする。
- [ ] cron変更の反映時間（最大15分）を考慮し、旧処理が止まったことを確認して新処理を有効化する。同名継承の場合も、cron停止と旧repoのデプロイ停止を確認してコード・設定を更新する。切替窓を記録し、補完する場合は送信結果を照合して二重通知を避ける。初期移植では永続履歴がないため、履歴がある前提で自動再走査しない。
- [ ] X日次告知はapp側を停止してからbot側を有効化する。appのバッジcronまで削除しない。
- [ ] 初回実行・失敗分類・重複・取得窓を確認し、安定後に旧Worker/repoの廃止を判断する。移植直後に削除・archiveしない。

## 8. ロールバック

旧設定・旧デプロイ版を保持する。新しいWorker名を採用した場合は旧Workerも停止状態で保持する。問題があれば新botの該当通知を無効化し、停止確認後に旧担当または同名Workerの旧デプロイ版を再開する。新旧を同時に再開しない。

切替窓と確認できた送信結果を保持し、切戻しで送信済み候補を無条件に再送しない。永続送信履歴を追加した後は、その状態も保持する。appのイベント保存・DB・UIは独立して動作できるようにする。未知の送信結果は手動確認対象とする。

## 9. 対象外・実装前の確認事項

- 自動イベント登録、通知チャネルの新設、AIプロバイダー変更、画像付き告知の新仕様、OG不具合の追加修正は今回の統合と分ける。
- TL用と投稿用のアカウントを確認し、必要なら認証設定を用途別に明示する。根拠なく同じCookieへ統一しない。
- 永続状態の保存先、保存期間、送信不明時の運用、通知失敗後の再試行仕様は、それぞれの改善を実装する前に確定する。初期移植の機能と保証を黙って拡大しない。
- 未完了UI計画や監査の残タスクはこの計画で置き換えない。

## 参考

- [Cloudflare Service Binding RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)
- [Scheduled handlerとcron分岐](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)
- [Cron Triggersの管理・反映時間](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [複数Workerのローカル開発](https://developers.cloudflare.com/workers/local-development/multi-workers/)
- [Vite auxiliaryWorkersと個別デプロイ](https://developers.cloudflare.com/workers/vite-plugin/reference/api/)
