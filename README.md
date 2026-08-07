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

- 不具合報告・機能要望: [GitHub Issues](https://github.com/qtmleap/vite-hono-workers/issues)
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

#### バックエンド・API

- [Cloudflare Workers](https://workers.cloudflare.com/) - エッジコンピューティング
- [Zodios](https://www.zodios.org/) - 型安全なAPIクライアント
- [Zod](https://zod.dev/) - スキーマバリデーション

#### 開発ツール

- [DevContainer](https://containers.dev/) - コンテナベース開発環境
- [Biome](https://biomejs.dev/) - 高速なリンター・フォーマッター
- [commitlint](https://github.com/conventional-changelog/commitlint) - コミットメッセージ規約
- [husky](https://github.com/typicode/husky) - Gitフック管理
- [lint-staged](https://github.com/lint-staged/lint-staged) - ステージングファイルのリント
- [act](https://github.com/nektos/act) - ローカルでのGitHub Actions実行
- [PR Agent](https://github.com/Codium-ai/pr-agent) - AI自動コードレビュー

### 環境構築

#### 前提条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Dev Containers Extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

#### セットアップ

```zsh
git clone https://github.com/qtmleap/vite-hono-workers.git
cd vite-hono-workers
```

VS Codeでプロジェクトを開き、`Cmd/Ctrl + Shift + P`でコマンドパレットを開いて`Dev Containers: Reopen in Container`を実行します。

### 開発

#### ローカル開発サーバー起動

```zsh
bun dev
```

#### イベント作成フォームのテスト

クエリパラメータでデフォルト値を指定してイベント作成ページを開けます。
UUIDは新規作成用に任意の値を指定します。

```
# 基本的な例
http://localhost:5173/admin/events/550e8400-e29b-41d4-a716-446655440000/?category=ackey&title=新春キャンペーン&startDate=2026-02-10

# 店舗を指定
http://localhost:5173/admin/events/550e8400-e29b-41d4-a716-446655440001/?category=ackey&title=池袋限定配布&stores=honten&startDate=2026-02-10

# 複数店舗を指定（カンマ区切り）
http://localhost:5173/admin/events/550e8400-e29b-41d4-a716-446655440002/?category=limited_card&title=都内3店舗イベント&stores=yuurakuchou,shinjyuku,shibuto&startDate=2026-02-14

# 告知URLを指定
http://localhost:5173/admin/events/550e8400-e29b-41d4-a716-446655440003/?category=ackey&title=新春キャンペーン&startDate=2026-02-10&referenceUrls=https://twitter.com/biccameraE/status/123456

# 全パラメータ指定
http://localhost:5173/admin/events/550e8400-e29b-41d4-a716-446655440004/?category=limited_card&title=バレンタインイベント&stores=honten&startDate=2026-02-14&endDate=2026-02-28&referenceUrls=https://twitter.com/biccameraE/status/123456
```

**利用可能なパラメータ:**
- `category`: イベント種別 (`limited_card` | `regular_card` | `ackey` | `other`)
- `title`: イベント名（文字列）
- `stores`: 店舗ID（カンマ区切りで複数指定可能。例: `honten,yuurakuchou,shinjyuku,shibuto,akiba` など）
- `startDate`: 開始日（YYYY-MM-DD形式）
- `endDate`: 終了日（YYYY-MM-DD形式）
- `referenceUrls`: 告知URL（告知タイプとして登録されます）

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
source .env && wrangler d1 migrations apply DB --env=staging    --remote
source .env && wrangler d1 migrations apply DB --env=production --remote
```

#### ビルド

ビルド工程は `.github/workflows/deployment.yaml` の `Build Workers` step に
直接書かれている。ローカルで再現する場合は同じ順序で実行する。

```zsh
bunx rimraf dist
bun run scripts/download-character-images.ts
bun run scripts/generate-og-images.ts
bun tsc -b
bun vite build --mode production
```

#### テスト実行

```zsh
bun test
```

#### リント・フォーマット

```zsh
# チェックのみ
bunx biome check .

# 自動修正
bunx biome check --write .
```

### プロジェクト構成

```
src/
├── app/              # アプリケーションルート
│   └── routes/      # ルーティング定義
├── components/       # Reactコンポーネント
│   ├── ui/          # Shadcn UIコンポーネント（編集不可）
│   └── **/*.tsx     # カスタムコンポーネント
├── schemas/         # Zodスキーマ定義
│   └── **/*.dto.ts  # DTOスキーマ
├── utils/           # ユーティリティ関数
│   └── client.ts    # Zodios APIクライアント
└── __tests__/       # テストコード
    └── **/*.test.ts # テストファイル
```

### GitHub設定

#### PR Agent

PR Agentを使用する場合、リポジトリのSecretsに以下を設定してください。

- `OPENAI_KEY`: OpenAI APIキー

設定は`.pr_agent.toml`で管理されています。デフォルトでは日本語でコメントが生成されます。

#### その他の機能

- マージ済みブランチの自動削除
- GPG署名付きコミット対応
- `push.autoSetupRemote`によるブランチ自動作成

### コーディング規約

- 関数定義には`function`ではなく`const`を使用
- ESLint標準ルールに準拠
- 変数・関数名はcamelCase
- ログメッセージは英語、コメントは日本語
- 非同期処理は`async/await`を使用
- 日付処理は`dayjs`を使用（`Date`は使用しない）
- アイコンは`lucide-react`または`@shadcn/ui/icons`を使用
- API通信は`src/utils/client.ts`で定義された`Zodios`クライアントを使用
- 型定義とバリデーションにはZodを使用
- `any`型の使用を避ける

### 注意事項

- `index.css`と`src/components/ui/**/*.tsx`は直接編集しない
- Shadcn UIコンポーネントのスタイル変更は`className`で対応
- 条件付き`className`は`cn`ユーティリティを使用
- モジュールインポートには`@`エイリアスを使用
- コミットメッセージはConventional Commits規約に従う

### ライセンス

MIT License

このプロジェクトのソースコードはMITライセンスで公開されていますが、ビッカメ娘に関する著作権は株式会社ビックカメラおよびアイティオール株式会社に帰属します。
