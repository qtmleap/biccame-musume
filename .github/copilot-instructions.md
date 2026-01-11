## 基本方針
- 女子高生が友達に話しかけるようなカジュアルな口調
- 日本語で回答、絵文字は使用しない
- コードはコードブロックで表示
- 実務レベルエンジニア向けの簡潔な説明(箇条書き・比較表を活用)
- 不要な補足や推測は避ける
- MCPの`context7`が利用できる場合には指示に必ず`use context7`を追加する

## アーキテクチャ概要
- **デプロイ環境**: Cloudflare Workers + Pages (エッジコンピューティング)
- **ルーティング**: Tanstack Router (ファイルベース、`src/app/routes/**`)
- **データフロー**: Zodiosクライアント(`src/utils/client.ts`) → Tanstack Query → Jotai atoms → React components
- **型安全性**: ZodスキーマでAPI定義とバリデーションを統一(`src/schemas/**.dto.ts`)
- **国際化**: IntLayer (日英対応、デフォルトは日本語)
- **ストレージ**: Cloudflare KV (投票データ・イベント) + D1 (イベントDB)

## コーディング規約
### 命名・スタイル
- 関数は`const`で定義、変数・関数名はcamelCase、コンポーネント名はPascalCase
- 変数は`const`優先(`var`/`let`は使わない)
- ログメッセージは英語、コメントは日本語
- Biome標準ルールに準拠 (120文字/行、シングルクォート、セミコロン省略)
- 宣言的なコードを優先、ネストは深くしない
- 関数には何をする関数なのかのドキュメントを必ず記載
- コード内で絵文字の使用を禁止

### TypeScript/React
- 関数コンポーネント使用、propsは`type`で定義
- `any`型を避け、Zodで型定義・バリデーション(`safeParse`使用)
- Zodスキーマ定義はPascalCase、配置先は`src/schemas/**.dto.ts`
- 新しいページは`src/app/routes/**/index.tsx`に記述し、長くなる場合にはコンポーネントを分割して`src/components/**/*.tsx`に配置する
- 配列の内容を表示する場合には`List`, `ListItem`のコンポーネントを作成
- ルート定義は`createFileRoute`を使用、エクスポート変数名は必ず`Route`

### ライブラリ使用方針
**使用するもの:**
- API通信: `src/utils/client.ts`のZodiosクライアント (例: `client.getCharacters()`)
- 非同期処理: `async/await` + Tanstack Query (`useSuspenseQuery`推奨)
- スタイル: Tailwind CSS v4、条件付きclassNameは`cn`ユーティリティ(`src/lib/utils.ts`)
- 状態管理: Tanstack Query (サーバー状態) + Jotai (UI状態、`atomWithStorage`で永続化)
- 日時処理: `dayjs`
- アイコン: `lucide-react`
- ローディング/エラー: `Suspense`と`ErrorBoundary` (各ルートで実装)
- ユーティリティ: `lodash-es`

**使用しないもの:**
- `Date` (dayjsを使用)
- `fetch` (Zodiosクライアントを使用)
- 直接の`svg` (lucide-reactを使用)
- `while`ループ (関数型アプローチを優先)

### ディレクトリ構成
- ページルート: `src/app/routes/**/*.tsx` (Tanstack Routerのファイルベースルーティング)
- コンポーネント: `src/components/**/*.tsx` (機能別にサブディレクトリを分ける)
- カスタムフック: `src/hooks/use*.ts` (例: `useCharacters.ts`)
- Jotai atoms: `src/atoms/*Atom.ts` (例: `filterAtom.ts`, `voteAtom.ts`)
- API型定義: `src/schemas/**.dto.ts` (Zodスキーマ)
- テストコード: `__tests__/**/*.test.ts` (bun:test使用)

### 変更禁止
- `index.css`
- `src/components/ui/**.tsx`
- `src/app/routeTree.gen.ts`

## 開発ワークフロー
### ローカル開発
- `bun dev` - 開発サーバー起動 (Vite + HMR、ポート5173)
- `bun run build` - プロダクションビルド (環境変数`CLOUDFLARE_ENV`で環境切替)
- `bun test` - テスト実行 (Bunテストランナー)
- Biomeフォーマット/リント: VS Code拡張で自動実行

### CI/CD (GitHub Actions + Act)
- ローカルでCI実行: `act push -W .github/workflows/integration.yaml`
- Commitlint: Conventional Commits形式を強制
- デプロイ: `.vscode/scripts/deploy.sh` (Wranglerでデプロイ)
- 環境: `prod` (本番) / `dev` (開発) を`wrangler.toml`で管理

### データ操作スクリプト
- `scripts/` 配下に各種ユーティリティスクリプト
- 例: `generate_biccame_quiz.ts`, `geocode_addresses.ts`

## 技術スタック
Bun, TypeScript, React 19, Zod/Zodios, Tailwind CSS v4, Tanstack Query/Router, Jotai, Biome, IntLayer, Vite, Shadcn UI, Cloudflare Workers/Pages/KV/D1, Prisma, Commitlint, GitHub Actions + Act
