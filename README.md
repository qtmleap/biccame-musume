# React + TypeScript + Cloudflare Workers

React、TypeScript、Cloudflare Workersを使用したWebアプリケーション開発のためのテンプレートプロジェクトです。

## 概要

このテンプレートは、モダンなフロントエンド開発環境とCloudflare Workersによるエッジコンピューティング環境を統合した開発基盤を提供します。DevContainerによる完全に分離された開発環境により、環境構築の手間を最小限に抑えます。

## 技術スタック

### コア

- [Bun](https://github.com/oven-sh/bun) - 高速なJavaScriptランタイム
- [TypeScript](https://www.typescriptlang.org/) - 型安全なJavaScript
- [React](https://react.dev/) - UIライブラリ
- [Vite](https://vitejs.dev/) - 高速なビルドツール

### フロントエンド

- [Tanstack Query](https://tanstack.com/query) - データフェッチング・状態管理
- [Tanstack Router](https://tanstack.com/router) - 型安全なルーティング
- [Tailwind CSS](https://tailwindcss.com/) - ユーティリティファーストCSS
- [Shadcn UI](https://ui.shadcn.com/) - 再利用可能なUIコンポーネント
- [IntLayer](https://intlayer.org/) - 国際化対応

### バックエンド・API

- [Cloudflare Workers](https://workers.cloudflare.com/) - エッジコンピューティング
- [Zodios](https://www.zodios.org/) - 型安全なAPIクライアント
- [Zod](https://zod.dev/) - スキーマバリデーション

### 開発ツール

- [DevContainer](https://containers.dev/) - コンテナベース開発環境
- [Biome](https://biomejs.dev/) - 高速なリンター・フォーマッター
- [commitlint](https://github.com/conventional-changelog/commitlint) - コミットメッセージ規約
- [husky](https://github.com/typicode/husky) - Gitフック管理
- [lint-staged](https://github.com/lint-staged/lint-staged) - ステージングファイルのリント
- [act](https://github.com/nektos/act) - ローカルでのGitHub Actions実行
- [PR Agent](https://github.com/Codium-ai/pr-agent) - AI自動コードレビュー

## 環境構築

### 前提条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Dev Containers Extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### セットアップ

```zsh
git clone <repository-url>
cd <repository-name>
```

VS Codeでプロジェクトを開き、`Cmd/Ctrl + Shift + P`でコマンドパレットを開いて`Dev Containers: Reopen in Container`を実行します。

## 開発

### ローカル開発サーバー起動

```zsh
bun dev
```

### ビルド

```zsh
bun run build
```

### テスト実行

```zsh
bun test
```

### リント・フォーマット

```zsh
# リント実行
bun run lint

# フォーマット実行
bun run format
```

## プロジェクト構成

```
src/
├── components/        # Reactコンポーネント
│   ├── ui/           # Shadcn UIコンポーネント（編集不可）
│   └── **/*.tsx      # カスタムコンポーネント
├── schemas/          # Zodスキーマ定義
│   └── **/*.dto.ts   # DTOスキーマ
├── utils/            # ユーティリティ関数
│   └── client.ts     # Zodios APIクライアント
└── __tests__/        # テストコード
    └── **/*.test.ts  # テストファイル
```

## GitHub設定

### PR Agent

PR Agentを使用する場合、リポジトリのSecretsに以下を設定してください。

- `OPENAI_KEY`: OpenAI APIキー

設定は`.pr_agent.toml`で管理されています。デフォルトでは日本語でコメントが生成されます。

### その他の機能

- マージ済みブランチの自動削除
- GPG署名付きコミット対応
- `push.autoSetupRemote`によるブランチ自動作成

## 注意事項

- `src/components/ui/**/*.tsx`のShadcn UIコンポーネントは直接編集せず、`className`でスタイルをカスタマイズしてください
- モジュールインポートには`@`エイリアスを使用できます
- コミットメッセージはConventional Commits規約に従ってください
