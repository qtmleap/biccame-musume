# ビッカメ娘ファンサイト

ビックカメラの店舗擬人化キャラクター「ビッカメ娘」を応援するファンサイトのソースコードです。

> [!NOTE]
> このサイトはファンサイトです。ビックカメラおよび関連企業とは一切関係ありません。

## 一般向け情報

### サイトについて

- ビッカメ娘の情報を整理・集約したファンサイト
- キャラクター一覧、店舗マップ、誕生日カレンダー、投票ランキングなどの機能を提供
- 非営利で運営しており、広告等を利用した収入を得ることは一切ありません

### 著作権

ビッカメ娘に関する著作権は、株式会社ビックカメラおよびアイティオール株式会社に帰属します。本サイトは[キャラクター使用のガイドライン](https://biccame.jp/guideline/)に基づき、非営利のファン活動として運営しています。

### お問い合わせ

- 不具合報告・機能要望: [GitHub Issues](https://github.com/qtmleap/biccame-musume/issues)
- ご意見・ご感想: [X @ultemica](https://x.com/ultemica)

### 公式サイト

- [ビッカメ娘公式サイト](https://biccame.jp/)
- [公式X (Twitter)](https://x.com/biccameraE)
- [株式会社ビックカメラ](https://www.biccamera.com/)

---

## 開発者向け情報

### 技術スタック

#### コア

- [Bun](https://github.com/oven-sh/bun) - 高速なJavaScriptランタイム
- [TypeScript](https://www.typescriptlang.org/) - 型安全なJavaScript
- [React](https://react.dev/) - UIライブラリ
- [Vite](https://vitejs.dev/) - 高速なビルドツール

#### フロントエンド

- [Tanstack Query](https://tanstack.com/query) - データフェッチング・状態管理
- [Tanstack Router](https://tanstack.com/router) - 型安全なルーティング
- [Tailwind CSS](https://tailwindcss.com/) - ユーティリティファーストCSS
- [Shadcn UI](https://ui.shadcn.com/) - 再利用可能なUIコンポーネント
- [IntLayer](https://intlayer.org/) - 国際化対応
- [Jotai](https://jotai.org/) - クライアント状態管理
- [React Hook Form](https://react-hook-form.com/) - フォーム管理
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) - PWA・Service Worker

#### バックエンド・API

- [Cloudflare Workers](https://workers.cloudflare.com/) - エッジコンピューティング（app と bot の 2 Worker）
- [Hono](https://hono.dev/) / [@hono/zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) - Web フレームワーク
- [Prisma](https://www.prisma.io/) 7 + [Cloudflare D1](https://developers.cloudflare.com/d1/) - データベース
- [Durable Objects](https://developers.cloudflare.com/durable-objects/) / [KV](https://developers.cloudflare.com/kv/) - 投票・統計・通知などの状態管理とキャッシュ
- [Firebase Authentication](https://firebase.google.com/docs/auth) - ユーザー認証
- [Workers AI](https://developers.cloudflare.com/workers-ai/) - コメントのモデレーションなど
- [Zodios](https://www.zodios.org/) - 型安全なAPIクライアント（app は `@zodios/core`、bot は `@qtmleap/zodios`）
- [Zod](https://zod.dev/) - スキーマバリデーション

#### 開発ツール

- [DevContainer](https://containers.dev/) - コンテナベース開発環境
- [Biome](https://biomejs.dev/) - 高速なリンター・フォーマッター
- [commitlint](https://github.com/conventional-changelog/commitlint) - コミットメッセージ規約
- [Playwright](https://playwright.dev/) - e2e・レイアウト検証
- [Storybook](https://storybook.js.org/) - UI カタログ
- [act](https://github.com/nektos/act) - ローカルでのGitHub Actions実行

### 環境構築

#### 前提条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Dev Containers Extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- `read:packages` 権限を持つ GitHub のトークンを環境変数 `GITHUB_TOKEN` に設定する

`.npmrc` が `@qtmleap` スコープのパッケージ（bot が使う `@qtmleap/zodios`）を GitHub Packages から取得する設定で、
認証に `GITHUB_TOKEN` を使うため、`bun install` に必要です。
Dev Container では `.envrc` が `.env` を読み込むので、`.env` に書いておくと反映されます。

ローカルの依存インストールでは、次のコマンドを使えます。`GITHUB_TOKEN` が未設定なら
`gh auth token --hostname github.com` の認証情報を子プロセスの環境変数にだけ渡します。
`.env` は自動読込せず、トークンをファイルやコマンド引数に保存しません。

```sh
bun --no-env-file run dependencies:install --frozen-lockfile
```

Bun 1.4.3 の `install` は `--no-env-file` を無視するため、このコマンドは設定だけを一時ルートに置き、
正規 installer で元の `node_modules` を更新します。workspace は元ディレクトリを参照し、一時ルートは終了時に削除します。
ライフサイクルスクリプトは実行しないため、必要な Prisma Client は別途 `bun --no-env-file run generate` で生成します。

依存を更新する場合は manifest の互換範囲を維持してください。`bun update --latest` は TypeScript 6 系、
Intlayer 8.8 系、Prisma 7.10.0 の制約も越えるため、一括指定しないでください。
Cloudflare の Vite plugin・Wrangler・Miniflare は整合する組合せで更新します。
`vite-intlayer` 8.8.0 は旧 8.5.2 用パッチの修正（`mergeConfig` の二重適用回避）を取り込み済みのため、
旧パッチの登録は不要です。

#### セットアップ

`biome-plugins` は git サブモジュールです。`biome.json` が `./biome-plugins/*.grit` を読むため、初期化しないとリントが通りません。

```zsh
git clone --recurse-submodules https://github.com/qtmleap/biccame-musume.git
cd biccame-musume

# すでに clone 済みの場合
git submodule update --init
```

VS Codeでプロジェクトを開き、`Cmd/Ctrl + Shift + P`でコマンドパレットを開いて`Dev Containers: Reopen in Container`を実行します。
コンテナ作成時に `bun install` と `bun run generate`（Prisma Client の生成）が自動で実行されます。

### 開発

#### ローカル開発サーバー起動

```zsh
bun dev
```

`http://localhost:15175` で起動します。`workers/web/vite.config.ts` を明示して起動するため、ルートの Vite 設定は不要です。
bot Worker は dev セッションの auxiliary Worker として接続されるため、追加のサーバーは不要です。

#### イベント作成フォームのテスト

クエリパラメータでデフォルト値を指定してイベント作成ページを開けます。
UUID は自動で採番されるため指定不要です。
管理画面は Cloudflare Access で保護されていますが、ローカル開発（`ENVIRONMENT=local`）では検査をスキップします。

```
# 基本的な例
http://localhost:15175/admin/events/new/?category=ackey&title=新春キャンペーン&startDate=2026-02-10

# 店舗を指定
http://localhost:15175/admin/events/new/?category=ackey&title=池袋限定配布&stores=honten&startDate=2026-02-10

# 複数店舗を指定（カンマ区切り）
http://localhost:15175/admin/events/new/?category=limited_card&title=都内3店舗イベント&stores=yuurakuchou,shinjyuku,shibuto&startDate=2026-02-14

# 告知URLを指定
http://localhost:15175/admin/events/new/?category=ackey&title=新春キャンペーン&startDate=2026-02-10&referenceUrls=https://twitter.com/biccameraE/status/123456

# 全パラメータ指定
http://localhost:15175/admin/events/new/?category=limited_card&title=バレンタインイベント&stores=honten&startDate=2026-02-14&endDate=2026-02-28&endAt=2026-02-20&referenceUrls=https://twitter.com/biccameraE/status/123456

# 既存イベントをコピーして新規作成
http://localhost:15175/admin/events/new/?from=550e8400-e29b-41d4-a716-446655440000
```

**利用可能なパラメータ:**（`packages/shared/src/schemas/event.dto.ts` の `EventRequestQuerySchema`）
- `category`: イベント種別 (`limited_card` | `regular_card` | `ackey` | `acsta` | `other`)
- `title`: イベント名（文字列）
- `stores`: 店舗ID（カンマ区切りで複数指定可能。例: `honten,yuurakuchou,shinjyuku,shibuto,akiba` など）
- `startDate`: 開始日（YYYY-MM-DD形式）
- `endDate`: 終了日（YYYY-MM-DD形式）
- `endAt`: 実際の終了日（配布終了時に設定する日。YYYY-MM-DD形式）
- `referenceUrls`: 告知URL（告知タイプとして登録されます）
- `from`: コピー元イベントの UUID（指定するとそのイベントの内容をコピーして開く。ほかのパラメータは使われません）

#### X 投稿 Webhook と Bot 管理

`POST /api/webhook` は X の push 通知 JSON を受け取り、店舗・配布キーワード判定を通過した投稿だけを Queue に投入します。
AI 処理は受信応答後に行い、Clef のイベント確率と必須項目の選択確率がともに閾値以上で、店舗・開始日・配布条件が確定した告知/開始投稿を自動公開します。X への再投稿は行いません。
スコアは正解率を保証する値ではありません。情報不足、低い確信度、継続/終了報告、既存イベントとの重複候補は保留にし、管理画面で確認します。一般商品のフェアは対象外です。

署名ヘッダーは `Webhook-Signature: t=<UNIX秒>,v1=<64桁hex>`。
署名対象は UTF-8 の `<UNIX秒>.<送信する生の本文>`、アルゴリズムは HMAC-SHA256、共有シークレットは app Worker の `WEBHOOK_SECRET_KEY` です。
本文の空白やキー順序を変更すると署名は無効になります。送信時刻の許容差は過去/未来とも 5 分で、JSON 内の `timestamp` は署名には使いません。
再送時は同じ投稿 ID・本文を使用し、新しい送信時刻で署名を作り直してください。Bearer Token は不要です。

```ts
import { createHmac } from 'node:crypto'

const timestamp = Math.floor(Date.now() / 1000).toString()
const body = JSON.stringify(payload)
const signature = createHmac('sha256', signingSecret)
  .update(`${timestamp}.${body}`, 'utf8').digest('hex')
// Content-Type: application/json
// Webhook-Signature: t=${timestamp},v1=${signature}
// body は署名に使った文字列をそのまま送信する
```

本文上限は 64 KiB。`data.type=tweet`、`data.body`、`data.uri=/<account>/status/<id>`、`data.tag=tweet-<id>` が必要です。
トップレベルの `body`/`tag` があれば data と一致する必要があります。`registration_ids` や icon は保存しません。
署名不正は 401、本文不正は 400、サイズ超過は 413、受信済み/対象外は 200、Queue 受付成功は 202、受付障害は 503 です。
5xx は再送可能ですが、4xx は送信内容/設定を修正してください。

環境別設定:

| Worker | 設定 | 用途 |
|---|---|---|
| app | `WEBHOOK_SECRET_KEY` (secret) | 受信 HMAC。未設定なら受信を停止 |
| app | `EVENT_DETECTION_MODEL` | 初期設定: `clef` (既定) / `clef-flash`。管理画面の保存値が優先 |
| app | `EVENT_DETECTION_THRESHOLD` / `EVENT_DETECTION_CHOICE_THRESHOLD` | 既定 `0.9`。管理画面（`/admin/bot`）で保存した値が優先 |
| app | `EVENT_DETECTION_IGNORE_THRESHOLD` | 既定 `0.5`、自動登録閾値未満に設定。管理画面で保存した値が優先 |
| app | `EVENT_DETECTION_ITEM_COUNT_THRESHOLD` | `wrangler.toml` は3環境とも `0.7`（未設定のときだけコードの既定 `0.9` に戻る）。自動登録を止めない（件数の監査は関門ではない）。件数の不一致を検出したときの再抽出の判定と、保存する監査の記録にだけ使う。`EVENT_DETECTION_CHOICE_THRESHOLD` や管理画面の保存値とは連動しない。環境変数のみで調整 |
| web | `DISCORD_TOKEN` / `DISCORD_CHANNEL_ID` (secret) | 既存 Discord Bot と通知先を再利用。Webhook 判定通知と公開イベント告知は別の履歴で管理 |
| web | `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` (secret) | 配布イベントの抽出とタイトル生成に使う、Anthropic Messages・tool use互換の接続先とトークン。自動登録の抽出には両方必須。接続先は Cloudflare Workers から到達できるものにする（ローカルのプロキシは不可）。未設定・抽出失敗時はイベントを登録せず、安全なエラーコードを記録して再試行する。抽出成功後のタイトル生成だけが失敗した場合は、定型のタイトル（`<店舗名> <配布物>配布`）で登録 |

Queue は `biccame-event-detection-local` / `-staging` / `-production` と、それぞれの `-dlq` に分離しています。
リモート環境での Queue 作成、secret 同期、マイグレーション、デプロイは管理者が承認してから行います。
secret は既存 `scripts/sync-cf-secrets.sh` 経由で環境ごとの web Worker に同期してください。`TWITTER_*` / `DISCORD_TOKEN` / `DISCORD_CHANNEL_ID` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` は web Worker のサーバー専用 secret です。クライアントの `VITE_*` 設定には含めません。
Cloudflare Access の経路保護が Webhook にも適用される場合は `/api/webhook` だけを送信元から到達可能にし、管理画面の保護は維持してください。

`/admin/bot` はシークレットの設定有無、Bot 接続、通知先、AI 閾値を表示します。トークンの値は表示しません。
ページ表示時はWorker設定の存在・形式だけを検証し、Discord APIには接続しません。右上の「接続確認」で認証・チャンネルアクセスを確認します。必要な設定は`DISCORD_TOKEN`と数字の`DISCORD_CHANNEL_ID`だけで、OAuth用のApplication ID・Client ID・Client Secretは不要です。チャンネルへのアクセス確認と実際の送信成功は区別し、テスト送信は確認付きの明示操作でのみ行います。
判定モデルは `/admin/bot` の「判定モデル」で `clef` / `clef-flash` を選び、「保存」で変更できます。保存先は環境別の既存 `BICCAME_MUSUME_EVENTS` KV の `settings:event-detection:model` です。KVの反映には最大約60秒かかる場合があります。変更は未判定の投稿に適用され、保存済みのAI判定や通知の再試行では再判定しません。保存値がない場合は `EVENT_DETECTION_MODEL`、未指定なら `clef` を使用します。モデル名はシークレットではありません。
登録・必須項目の選択・対象外の3つのしきい値と項目別のしきい値も `/admin/bot` で変更でき、保存先は同じ KV の `settings:event-detection:thresholds` と `settings:event-detection:field-thresholds` です。保存した値が環境変数より優先され、保存値が壊れているときは環境変数の値を使います。
`/admin/webhooks` は保留/登録/失敗と通知状態を確認する受信履歴です。保留を手動登録・既存イベントへ紐付け・却下できます。
通知失敗でも登録を巻き戻しません。通信結果不明 (`unknown`) は二重通知の可能性があるため自動再送せず、明示確認後に通知だけを再試行します。
Discord の nonce は短期間の重複抑止であり、永続的な exactly-once の保証ではありません。

#### マイグレーション

`prisma/schema.prisma` を変更したら SQL を生成してローカル D1 に適用する。
生成し忘れた PR は CI の `Migrations` ジョブが落とす。

生成は Prisma、適用は wrangler が担当する。Prisma 7 の CLI は D1 に直接接続
できないため、`migrate:new` は shadow DB (`prisma/shadow.db`) 上でコミット済みの
マイグレーション履歴を再生し、そこからスキーマとの差分 SQL を書き出す。

```zsh
# schema.prisma の差分から migration.sql を生成
bun run migrate:new --name add_event_character

# ローカル D1 に適用 / 適用状況の確認
bun run migrate
bun run migrate:status

# ローカル D1 にバッジを投入（既定の対象は local-staging）
bun run badges:seed
```

生成された SQL に `PRAGMA foreign_keys=OFF` (テーブル再定義) が含まれていたら
**そのまま適用してはいけない**。D1 はこの PRAGMA を無視するため、`DROP TABLE` で
子テーブルが CASCADE 削除される。`defer_foreign_keys=ON` でも防げないことを実測済み。
子テーブルを一時テーブルへ退避してから書き戻す形に手で書き換える
(実例: `prisma/migrations/20260807175125_fix_events_group_fk/migration.sql`)。

staging / production へは `deployment.yaml` の `Apply D1 migrations` step が
デプロイ前に自動で適用する。適用済みかどうかは D1 側の `d1_migrations` 台帳で
判定されるので、未適用の SQL だけが流れる。

手元から直接当てたい場合は同じコマンドを `--remote` で叩く。
`CLOUDFLARE_API_TOKEN` が要るので `.env` を読み込むこと。

```zsh
source .env && bunx wrangler --config workers/web/wrangler.toml d1 migrations apply DB --env=staging    --remote
source .env && bunx wrangler --config workers/web/wrangler.toml d1 migrations apply DB --env=production --remote
```

#### ビルド

Prisma Client は gitignore 対象なので、先に `bun run generate` で生成しておきます。
ビルド工程は `.github/workflows/deployment.yaml` の `Build Workers` step に
直接書かれている。ローカルで再現する場合は同じ順序で実行する。
`CLOUDFLARE_ENV` は `staging` か `production` を指定する。

```zsh
bun run generate
bunx rimraf workers/web/dist
bun run scripts/download-character-images.ts
bun run scripts/generate-og-images.ts
bun run scripts/generate-og-avatars.ts
bun tsc -b
CLOUDFLARE_ENV=staging bun run build --mode staging
CLOUDFLARE_ENV=staging bun run test:app-build
```

`scripts/generate-og-avatars.ts` は投稿画像用の丸 Avatar（直径 320px）を店舗キーごとに `workers/web/public/og/avatars/` へ出力します。
既存ファイルは再生成せず、`FORCE_OG=1` を付けると作り直します。素材が無いキーと `biccamera`（会社ロゴ）は作らず、描画側が「ビ」の丸印に切り替えます。

手元からデプロイする場合は、同じ `CLOUDFLARE_ENV` でビルドしたあとに `bun run deploy` を実行します。
`CLOUDFLARE_ENV=staging|production` の明示が必須で、ビルドした環境と食い違うとエラーになります。
`--env` は渡せません（ビルド時に環境が解決済みのため）。`CLOUDFLARE_API_TOKEN` も必要です。

```zsh
CLOUDFLARE_ENV=staging bun run deploy
```

#### テスト実行

```zsh
# bun test + packages/shared のテスト
bun run test

# web と共有パッケージの型検査
bun run typecheck
```

`bun test` だけでは `packages/shared/src/x/transport.test.ts` が拾われません（`bunfig.toml` の `root = "./__tests__"`）。
`bun run test` を使ってください。どちらも事前に `bun run generate` が必要です。

#### リント・フォーマット

CI の `Code Check` と同じ対象です。サブモジュール（`biome-plugins`）の初期化が前提です。

```zsh
# チェックのみ
bun biome check workers/web/src packages/shared/src __tests__

# 自動修正
bun biome check --write workers/web/src packages/shared/src __tests__
```

#### web Worker の画像付き投稿と共有パッケージ

- `workers/web`: UI/API、Webhook 受信・判定、X/Discord の画像付きイベント告知を担当します。独立 bot Worker や Service Binding は使用しません。
- `packages/shared`（`@biccame/shared`）: X の通信、店舗データ、イベント検出などの純粋な共通ロジックです。

公開イベントの作成・更新はそれぞれの本文と OG 画像で通知します。非公開イベントと Webhook の保留候補は X へ公開しません。
毎日 JST 09:00 に当日開始・終了イベント、毎週月曜 JST 09:00 にその週と開催期間が重なるイベントを画像付きで通知します。0 件の区分は送らず、多件数はページ分割します。日次 cron はバッジ再評価も継続します。

5 分ごとの本番 cron で Queue 投入に失敗した pending 投稿を回収します。投稿は既存の環境別 `EVENT_DETECTION_QUEUE` で処理し、D1 に固定スナップショットとチャネル別の結果を保存します。投稿失敗で保存済みイベントを巻き戻しません。画像処理失敗時に本文だけを送るフォールバックはありません。結果不明の送信は自動再送せず、exactly-once を保証しません。Webhook の保留・判定通知は Discord 専用で、通常告知とは独立しています。

`TWITTER_AUTH_TOKEN` / `TWITTER_CSRF_TOKEN`、必要に応じて `TWITTER_BEARER_TOKEN`、`DISCORD_TOKEN` / `DISCORD_CHANNEL_ID`、認証監視用 `DISCORD_WEBHOOK_URL` は web Worker の secret に同期します。既存の X 署名付き通信と Discord Bot API を使い、別の OAuth 方式は追加していません。

`X_POSTING_ENABLED` / `DISCORD_POSTING_ENABLED` は production で `"true"`、local / staging で `"false"` に固定しています。Webhook の Discord 保留・判定通知は、この公開告知フラグとは別の経路です。
管理画面の X アカウント情報は別の読み取り専用フラグ `X_ACCOUNT_READ_ENABLED` で制御し、production / local は `"true"`、staging は `"false"` です。このフラグは投稿を有効化しません。

旧 bot を CI から外しても、リモート Worker の cron は自動で停止しません。本番切替は管理者の明示承認を得て、次の順で実施します。

1. 新 web の本番投稿を有効化する前に、旧 bot Worker の cron を停止する。
2. web Worker に必要な secret を同期して展開し、画像付き投稿・Queue・日次/週間処理の稼働を確認する。
3. 確認後、改めて明示承認を得て旧 Worker を削除する。

この変更では実リモート操作を行わず、CI に旧 Worker の自動削除処理も追加しません。本番投稿・secret 同期・remote migration・deploy はローカル検証に使いません。

```zsh
bun run build
bun run test:app-build   # 生成された web Worker の環境別設定を検証
bun run check:bot-stores # 生成店舗データの鮮度を確認（既存ファイル名を維持）
```

`packages/shared/src/generated/bot-stores.json` とバッジ用の `closed-store-keys.json` は `workers/web/public/characters.json` から生成したファイルです。
更新が必要なときは `bun scripts/generate-bot-stores.ts` で両方を再生成します。`bun run check:bot-stores` は両方の鮮度を確認します。

#### ローカル専用のツール

以下のツールは本番には書き込みません。

- `bun run event-detect`（`scripts/event-detect.ts`）: X の投稿からイベントを検出するツールです。
  `prepare` / `report` / `eval` / `judge` / `extract` / `emulate` / `gaps` / `clef` / `seed` / `serve` のサブコマンドがあり、
  `seed` は検出したイベントを**ローカル D1**（`.wrangler/state`）に未確認イベントとして登録します（既定は dry-run、`--apply` で書き込み）。
  管理画面のビューワ（`/admin/event-detect`）は `serve`（`127.0.0.1:15176`）の API を使います。
  使い方は `bun scripts/event-detect.ts --help`。
- `bun run benchmark:events`: 件数質問→実抽出→監査→物品別判定の実パイプライン評価です。新規の公開公式投稿236件（陽118・陰118）から、既定は月×アカウントを揃えた100件（各50）の入力を確認します。**既定はoffline・AI呼出0**です。
  固定100件の承認済み実測は関連性49/50（98%）・FP0、旧200＋新432＋限定通信確認18＝650回。旧版は監査で止まり関連性判定未実行のため、モデル能力差とは呼びません。登録readyは旧新とも0です。
  分母・runtime固定条件・実行済みの再現記録・保存証跡は [`docs/event-pipeline-benchmark.md`](docs/event-pipeline-benchmark.md) を参照してください。追加の実AI呼出・実job再判定・公開は承認されていません。
  **新イベント判定200ケース（陽100・陰100）を別datasetとして追加**しました。前回の98%（固定100件）には含めず、今回の新規AI呼出は0回です。`bun run benchmark:events --dataset expanded` で外部通信なしに件数と選定を確認できます（凍結directory・承認は旧goalと別）。
- `bun run benchmark:events:raw`: 投稿全文を直接判定した旧診断（deprecated/historical）です。現行の主評価ではありません。版ごとに未使用の `--directory` を必ず指定し、旧v8既定directoryや保存原本を現行版で再利用しません。詳細は [`docs/event-detection-benchmark.md`](docs/event-detection-benchmark.md)。旧5例は `benchmark:events:smoke` のままです。
- `bun run archive:list-posts` / `bun run archive:list-timeline`: X のリストの投稿をローカル（`.cache/`）に保存します。
  使い方は [`docs/list-post-archive.md`](docs/list-post-archive.md) を参照してください。

#### e2e と Storybook

- `bun run e2e`（`e2e/local/run.sh`）: 使い捨てのローカル D1 を migrate・seed し、Firebase Auth emulator を立てた状態で Playwright を実行します。
  Playwright が専用ポートで Vite を起動・停止し、実アカウントやリモートの DB・KV は使いません。詳細は [`e2e/local/README.md`](e2e/local/README.md)。
- `bun run e2e:*`: レイアウトや挙動ごとの個別設定です（`package.json` の scripts を参照）。
- スクリーンショットは `bun run e2e:candidates` が `.cache/a15/candidates` に候補として出力します。
  承認済みスクリーンショット（`e2e/approved`）は人が確認したものだけを別コミットで追加し、`--update-snapshots` は使いません。
- `bun run storybook`（ポート 6006）、`bun run check:storybook`、`bun run build-storybook`、`bun run test:storybook`: UI カタログです。
  詳細は [`.storybook/catalogue/README.md`](.storybook/catalogue/README.md)。

### デプロイとリリース

#### CI

`.github/workflows/integration.yaml` は `push` でのみ動きます。
ジョブは `CommitLint`（最新コミットのみ検査）、`Code Check`、`Migrations`、`Test`、`Compile TypeScript`、`Vite Build (production)`、`Local UI and authentication regression` です。

#### デプロイ

`.github/workflows/deployment.yaml` は develop / master 宛ての PR がマージされると動きます。

| マージ先 | 環境 | URL |
| --- | --- | --- |
| develop | staging | `https://dev.biccame-musume.com` |
| master | production | `https://biccame-musume.com` |

順序は D1 migration → バッジの seed → app → bot です。
bot は app のデプロイ後に、環境ごとの設定で有効化されます（staging はタイムライン通知・X 投稿無効、cron なし。production は有効）。Discordイベント通知は全環境で常時有効です。
app の日次 cron はバッジの再評価だけで、X への投稿・日次告知は bot が担います。

Worker のシークレットは `scripts/sync-cf-secrets.sh`、`VITE_` で始まるビルド時の値は `scripts/sync-gh-secrets.sh`（GitHub Actions secrets）で同期します。

#### リリース

リリースは `.claude/release.json` に従います。

1. 版上げ PR（`chore: bump version to X.Y.Z`）を develop にマージする。版の正はルートの `package.json` で、`workers/web/package.json` の版は使いません。
2. develop → master のリリース PR（タイトルは `release: v{version}`）を**マージコミット**で取り込む。
3. マージコミットに annotated タグ `v{version}`（メッセージは `release v{version}`）を付ける。GitHub Release は作成しません。
4. `backmerge.yaml` が develop を master に fast-forward する。

### プロジェクト構成

```
workers/
└── web/                  # UI・API・Webhook・画像付き投稿とバッジ再評価を担う Worker
    ├── src/
        ├── app/          # React UI・routes・components・hooks・atoms・辞書
        ├── api/          # routes・services・db・middleware・rpc・Durable Objects
        └── index.ts      # Worker エントリーポイント
    ├── public/           # 静的資産とキャラクター情報
    ├── index.html
    ├── vite.config.ts
    ├── wrangler.toml
    └── package.json
packages/
└── shared/               # 純粋な DTO・schema・domain 計算と通信処理（@biccame/shared）
prisma/                   # 共有スキーマ・マイグレーション
__tests__/                # Bun テスト
e2e/                      # Playwright の e2e・レイアウト検証
scripts/                  # 画像の取得・生成、DB seed、デプロイ、ローカル専用ツール
docs/                     # 設計メモ・調査・レビューの記録
biome-plugins/            # Biome の GritQL ルール（git サブモジュール）
patches/                  # 依存パッケージへのパッチ
.storybook/               # UI カタログ・検証
.github/workflows/        # CI・デプロイ・back-merge
.devcontainer/            # 開発環境
.claude/                  # Claude Code の設定・エージェント・スキル・リリース設定
```

依存と共通ツールはルートの Bun workspace で管理します。`bun run dev`、
`bun run build`、`bun run generate`、`bun run deploy` は引き続きルートから実行できます。
ビルド出力は `workers/web/dist/` です。build は `workers/web/vite.config.ts` を明示し、dev はルートの再 export 設定から同じ設定を使います。

Prisma はルート `prisma/` を使用し、Client は `workers/web/src/api/db/generated/prisma/` に生成します。
ローカル D1/KV/DO の状態は従来どおりルート `.wrangler/state/` に保存します。
環境ファイルもルートに維持します。Vite の `envDir` でルートを指定し、symlink や内容のコピーは作成しません。Wrangler の canonical 設定パスは `workers/web/wrangler.toml` です。

Wrangler CLI を直接使う場合は `--config workers/web/wrangler.toml` を指定します。
ローカル DB コマンドには `--persist-to .wrangler/state` も指定してください。
ビルド済み本体のデプロイは生成済み設定を使う `bun run deploy` を使用します。

### GitHub設定

#### ブランチとコミットの扱い

- 作業は develop から切った feature ブランチで行い、develop 宛ての PR で取り込みます。master へはリリース PR のみ
- マージ済みブランチの GitHub 側の自動削除は無効です。代わりに `.devcontainer/postAttachCommand.sh` が、Dev Container にアタッチするたびにローカルのマージ済みブランチを削除します（`develop` / `master` は除く）
- コミットの署名は無効です（`postAttachCommand.sh` が `commit.gpgSign false` を設定）
- `push.autoSetupRemote` によるブランチ自動作成（`postAttachCommand.sh` が設定）

### コーディング規約

- 関数定義には`function`ではなく`const`を使用
- Biome（`biome.json`）でリント・フォーマットし、`biome-plugins` のルールで次を警告します。
  - `let`（`const` を使う）
  - `new Date()`（`dayjs` を使う）
  - `??` と、`|| ''` `|| []` `|| {}` `|| null` `|| undefined` によるフォールバック（スキーマや型を直す）
  - `as` による型アサーション（`as const` は可）
  - `while` / `do...while`
  - Zod: 素の `z.string()`、配列・真偽値への `.optional()` / `.nullable()`、`z.string().min(1)`（`.nonempty()` を使う）、`z.string().url()` / `.uuid()`（`z.url()` / `z.uuid()` を使う）、`parse`（`safeParse` を使う）
- 上記は警告のため CI は落ちませんが、新しいコードでは違反を増やさない
- 変数・関数名はcamelCase
- ログメッセージは英語、コメントは日本語
- 非同期処理は`async/await`を使用
- 日付処理は`dayjs`を使用（`Date`は使用しない）
- アイコンは`lucide-react`を使用（SNS のロゴなど lucide にないものは`react-icons`）
- API通信は`workers/web/src/app/utils/client/`で定義された`Zodios`クライアントを使用
- 型定義とバリデーションにはZodを使用
- `any`型の使用を避ける

### 注意事項

- `index.css`と`workers/web/src/app/components/ui/**/*.tsx`は直接編集しない
- 生成物は直接編集しない（`workers/web/src/api/db/generated/prisma/`、`workers/web/src/app/routeTree.gen.ts`、`packages/shared/src/generated/bot-stores.json`）
- Shadcn UIコンポーネントのスタイル変更は`className`で対応
- 条件付き`className`は`cn`ユーティリティを使用
- `@/` は `workers/web/src/app/*`、`@api/` は `workers/web/src/api/*` を参照する。UI と API の共通契約は `@biccame/shared/...` を使用
- コミットメッセージはConventional Commits規約に従う（`.commitlintrc.yaml`。ヘッダは128文字以内）

### ライセンス

MIT License

このプロジェクトのソースコードはMITライセンスで公開されていますが、ビッカメ娘に関する著作権は株式会社ビックカメラおよびアイティオール株式会社に帰属します。
