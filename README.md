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

`http://localhost:15175` で起動します（`vite --host --port 15175`）。
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

**利用可能なパラメータ:**（`workers/app/src/schemas/event.dto.ts` の `EventRequestQuerySchema`）
- `category`: イベント種別 (`limited_card` | `regular_card` | `ackey` | `acsta` | `other`)
- `title`: イベント名（文字列）
- `stores`: 店舗ID（カンマ区切りで複数指定可能。例: `honten,yuurakuchou,shinjyuku,shibuto,akiba` など）
- `startDate`: 開始日（YYYY-MM-DD形式）
- `endDate`: 終了日（YYYY-MM-DD形式）
- `endAt`: 実際の終了日（配布終了時に設定する日。YYYY-MM-DD形式）
- `referenceUrls`: 告知URL（告知タイプとして登録されます）
- `from`: コピー元イベントの UUID（指定するとそのイベントの内容をコピーして開く。ほかのパラメータは使われません）

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
source .env && bunx wrangler --config workers/app/wrangler.toml d1 migrations apply DB --env=staging    --remote
source .env && bunx wrangler --config workers/app/wrangler.toml d1 migrations apply DB --env=production --remote
```

#### ビルド

Prisma Client は gitignore 対象なので、先に `bun run generate` で生成しておきます。
ビルド工程は `.github/workflows/deployment.yaml` の `Build Workers` step に
直接書かれている。ローカルで再現する場合は同じ順序で実行する。
`CLOUDFLARE_ENV` は `staging` か `production` を指定する。

```zsh
bun run generate
bunx rimraf workers/app/dist
bun run scripts/download-character-images.ts
bun run scripts/generate-og-images.ts
bun tsc -b
CLOUDFLARE_ENV=staging bun vite build --mode staging
CLOUDFLARE_ENV=staging bun run test:app-build
```

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

# app / bot の型検査
bun run typecheck
```

`bun test` だけでは `packages/shared/src/x/transport.test.ts` が拾われません（`bunfig.toml` の `root = "./__tests__"`）。
`bun run test` を使ってください。どちらも事前に `bun run generate` が必要です。

#### リント・フォーマット

CI の `Code Check` と同じ対象です。サブモジュール（`biome-plugins`）の初期化が前提です。

```zsh
# チェックのみ
bun biome check workers/app/src workers/bot/src packages/shared/src __tests__

# 自動修正
bun biome check --write workers/app/src workers/bot/src packages/shared/src __tests__
```

#### bot Worker と共有パッケージ

- `workers/bot`: X への投稿、タイムライン（TL）の取得、日次告知を担う Worker です。
  app とは Service Binding（RPC）で連携し、`TWITTER_*` のシークレットは bot にだけ置きます。詳細は [`workers/bot/README.md`](workers/bot/README.md)。
- `packages/shared`（`@biccame/shared`）: app と bot で共有する X との通信、店舗データ、イベント検出のロジックです。

```zsh
bun run build:bot        # workers/bot/dist に bundle を生成
bun run test:bot-rpc     # build:bot の bundle を Miniflare で動かして RPC を検証
bun run check:bot-stores # 店舗データ (bot-stores.json) が最新か確認
bun run deploy:bot --env=staging  # bot のデプロイ（--env の明示が必須。CI は app のあとに実行）
```

production の有効な設定（cron・通知・X 投稿）は、`--allow-active-production` を付けた場合だけデプロイできます。

`packages/shared/src/generated/bot-stores.json` は `workers/app/public/characters.json` から生成したファイルです。
更新が必要なときは `bun scripts/generate-bot-stores.ts` で再生成します。

#### ローカル専用のツール

どちらも本番には書き込みません。

- `bun run event-detect`（`scripts/event-detect.ts`）: X の投稿からイベントを検出するツールです。
  `prepare` / `report` / `eval` / `judge` / `extract` / `emulate` / `gaps` / `clef` / `seed` / `serve` のサブコマンドがあり、
  `seed` は検出したイベントを**ローカル D1**（`.wrangler/state`）に未確認イベントとして登録します（既定は dry-run、`--apply` で書き込み）。
  管理画面のビューワ（`/admin/event-detect`）は `serve`（`127.0.0.1:15176`）の API を使います。
  使い方は `bun scripts/event-detect.ts --help`。
- `bun run archive:list-posts` / `bun run archive:list-timeline`: X のリストの投稿をローカル（`.cache/`）に保存します。
  使い方は [`workers/bot/README.md`](workers/bot/README.md) の「リスト投稿のローカル保存」を参照してください。

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
bot は app のデプロイ後に、環境ごとの設定で有効化されます（staging は通知無効・cron なし、production は有効）。
app の日次 cron はバッジの再評価だけで、X への投稿・日次告知は bot が担います。

Worker のシークレットは `scripts/sync-cf-secrets.sh`、`VITE_` で始まるビルド時の値は `scripts/sync-gh-secrets.sh`（GitHub Actions secrets）で同期します。

#### リリース

リリースは `.claude/release.json` に従います。

1. 版上げ PR（`chore: bump version to X.Y.Z`）を develop にマージする。版の正はルートの `package.json` で、`workers/app/package.json` の版は使いません。
2. develop → master のリリース PR（タイトルは `release: v{version}`）を**マージコミット**で取り込む。
3. マージコミットに annotated タグ `v{version}`（メッセージは `release v{version}`）を付ける。GitHub Release は作成しません。
4. `backmerge.yaml` が develop を master に fast-forward する。

### プロジェクト構成

```
workers/
├── app/                  # UI・API を配信する Worker（日次 cron はバッジ再評価のみ）
│   ├── src/              # React・Hono・Durable Objects・型・サービス
│   ├── public/           # 静的資産とキャラクター情報
│   ├── index.html
│   ├── vite.config.ts
│   ├── wrangler.toml
│   └── package.json
└── bot/                  # X への投稿・TL 取得・日次告知を担う Worker（workers/bot/README.md）
packages/
└── shared/               # app と bot で共有するコード（@biccame/shared）
prisma/                   # 共有スキーマ・マイグレーション
__tests__/                # Bun テスト
e2e/                      # Playwright の e2e・レイアウト検証
scripts/                  # 画像の取得・生成、DB seed、デプロイ、bot の検証、ローカル専用ツール
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
本体のビルド出力は `workers/app/dist/`、bot のビルド出力は `workers/bot/dist/` です。Vite のルート設定ファイルは app 設定を再公開します。

Prisma はルート `prisma/` を使用し、Client は `workers/app/src/generated/prisma/` に生成します。
ローカル D1/KV/DO の状態は従来どおりルート `.wrangler/state/` に保存します。
環境ファイルもルートに維持します。ローカル開発時のみ app からルートへ相対 symlink を作成し、
内容のコピーや既存ファイルの上書きは行いません。Wrangler の canonical 設定パスは app のままです。

Wrangler CLI を直接使う場合は `--config workers/app/wrangler.toml` を指定します。
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
- API通信は`workers/app/src/utils/client/`で定義された`Zodios`クライアントを使用
- 型定義とバリデーションにはZodを使用
- `any`型の使用を避ける

### 注意事項

- `index.css`と`workers/app/src/components/ui/**/*.tsx`は直接編集しない
- 生成物は直接編集しない（`workers/app/src/generated/prisma/`、`workers/app/src/app/routeTree.gen.ts`、`packages/shared/src/generated/bot-stores.json`）
- Shadcn UIコンポーネントのスタイル変更は`className`で対応
- 条件付き`className`は`cn`ユーティリティを使用
- `@/` エイリアスは `workers/app` の中だけで使える。bot と shared は `@biccame/shared/...` を使用
- コミットメッセージはConventional Commits規約に従う（`.commitlintrc.yaml`。ヘッダは128文字以内）

### ライセンス

MIT License

このプロジェクトのソースコードはMITライセンスで公開されていますが、ビッカメ娘に関する著作権は株式会社ビックカメラおよびアイティオール株式会社に帰属します。
