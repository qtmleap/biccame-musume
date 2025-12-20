# ビッカメ娘ファンサイト

ビックカメラの店舗擬人化キャラクター「ビッカメ娘」を応援するファンサイトのソースコードです。

> [!NOTE]
> このサイトはファンメイドのファンサイトです。ビックカメラおよび関連企業とは一切関係ありません。

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

#### データ生成

キャラクターデータ (`public/characters.json`) を一から生成する場合：

```zsh
# TypeScript版（推奨）
bun scripts/generate_characters.ts

# Python版
python3 scripts/generate_characters.py
```

これらのスクリプトは以下の処理を自動で行います：
1. ビッカメ娘公式サイトからプロフィール情報を取得
2. 各キャラクターの詳細ページから追加情報を取得
3. 都道府県情報を抽出・付与
4. JSONキーをアルファベット順にソート
5. `public/characters.json`に出力

#### ローカル開発サーバー起動

```zsh
bun dev
```

#### ビルド

```zsh
bun run build
```

#### テスト実行

```zsh
bun test
```

#### リント・フォーマット

```zsh
# リント実行
bun run lint

# フォーマット実行
bun run format
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
