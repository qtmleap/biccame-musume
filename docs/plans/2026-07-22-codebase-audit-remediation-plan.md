# コードベース修正計画書 (2026-07-22)

同日付の `2026-07-22-codebase-audit-report.md` に列挙した問題点に対する、実施順・担当領域・検証手順・PR 分割方針を定める。

## 前提と参照

- 深刻度・発見内容は精査報告書 `docs/plans/2026-07-22-codebase-audit-report.md` を参照。
- ブランチ運用は `CLAUDE.md` の規約に従う (`develop` 直接コミット禁止、feature ブランチを切って PR を develop に送る)。
- コミットメッセージは commitlint に従う。type は `fix` / `chore` / `refactor` / `test` / `docs` を用途別に選ぶ。
- 開発用スクリプト名は既存の `package.json` に整合させる（既存が `bun run dev` などのため、追加も `bun run` 前提）。
- `develop` ブランチには `master` に無い変更が既に取り込まれている前提。各 PR は `develop` に向けて送る。

## フェーズ 0: 緊急対応（即日〜数日）

### T0-1. Turnstile シークレットの secret 化 [Critical C1]

**目的**: 本番でも `verifyTurnstileToken` が実際に検証を行うようにする。

**手順**:

1. Cloudflare ダッシュボードで staging / production 用の Turnstile サイトとシークレットを 2 組発行（未発行なら）。
2. `wrangler.toml` の 3 箇所（`[vars]`, `[env.staging.vars]`, `[env.production.vars]`）から `TURNSTILE_SECRET_KEY = "1x0000..."` を削除。代わりに以下のコメントを残す。
   ```toml
   # TURNSTILE_SECRET_KEY はローカル用に .dev.vars で "1x0000000000000000000000000000000AA" を使用。
   # staging / production は `wrangler secret put TURNSTILE_SECRET_KEY --env <env>` で注入する。
   ```
3. `.dev.vars` を作成（`.gitignore` 済み）し `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` を入れる。
4. secret 注入:
   ```sh
   wrangler secret put TURNSTILE_SECRET_KEY --env staging
   wrangler secret put TURNSTILE_SECRET_KEY --env production
   ```
5. `src/api/comment.ts:120` の挙動を staging で手動確認：
   - フロントの Turnstile widget を経由した投稿 → 成功
   - 意図的に無効なトークンで叩く（curl）→ 403 相当で拒否

**PR**: `fix/turnstile-secret-and-token-rotation`

### T0-2. Cloudflare API トークンのローテーション [Critical C2]

**目的**: ローカル `.env` に露出したトークンを無効化し、新規発行分を安全に運用する。

**手順**:

1. Cloudflare ダッシュボードで現行の API トークン（ローカル `.env` に保存されている実値、本ドキュメントにはマスクの都合上載せない）を revoke。
2. 同権限の新トークンを発行し、ローカルの `/home/vscode/app/.env` に上書き。
3. `.env.example` を新設（値は空文字）:
   ```dotenv
   CLOUDFLARE_API_TOKEN=
   CLOUDFLARE_ACCOUNT_ID=
   ```
4. `README` / `docs/setup.md`（無ければ新設）に環境変数の取得手順を記載。
5. IDE 履歴・シェル履歴（`~/.zsh_history` / `~/.bash_history`）から旧トークンを grep し、該当行を削除。

**PR**: T0-1 と同 PR にドキュメントとして同梱可（`.env.example` と README のみ）。トークン revoke 自体は手動作業でリポジトリ変更なし。

### T0-3. CSRF 適用範囲の拡張 [Critical C3]

**目的**: Cookie 認証を持つミューテーション経路すべてで CSRF を防ぐ。

**手順**:

1. `src/index.ts` の一括適用箇所に以下を追加:
   ```ts
   import { csrf } from 'hono/csrf'
   app.use('/api/*', csrf({ origin: (origin, c) => isAllowedOrigin(origin, c.env) }))
   ```
   `isAllowedOrigin` は `src/lib/allowed-origin.ts` に新設し、環境変数 `ORIGIN_ALLOWLIST`（カンマ区切り）と `c.req.header('origin')` を照合。
2. すでに `csrf` を個別適用している `src/api/auth.ts` と `src/api/user.ts` の重複を削除（トップレベルに一本化）。
3. Zodios クライアント側で `Origin` ヘッダが正しく付くことを確認（fetch は既定で付与）。
4. E2E で影響確認: `e2e/badges-flow.spec.ts`, `e2e/admin-event-edit.spec.ts` などのミューテーション系スペックが通ること。

**PR**: T0-1 の直後、単独 PR `fix/csrf-all-mutation-routes`

## フェーズ 1: セキュリティ強化（1 週間以内）

### T1-1. `X-Real-IP` フォールバック削除 [High H1]

- `src/middleware/ip-check.ts` および `src/middleware/vote-limit.ts` で client IP 取得を `CF-Connecting-IP` のみに変更。
- ローカル開発時 (`ENVIRONMENT === 'local'`) は `c.req.header('cf-connecting-ip') ?? '127.0.0.1'` の形で開発用フォールバック。
- 影響テスト: `__tests__/` に `middleware/ip-check.test.ts` を新設。

### T1-2. DB / 外部 JSON パースの Zod 検証化 [High H2]

- `src/lib/parse-json.ts` を新設:
  ```ts
  export const parseJsonWithSchema = <T>(raw: string, schema: ZodSchema<T>): T => {
    const parsed = schema.safeParse(JSON.parse(raw))
    if (!parsed.success) throw new HTTPException(500, { message: 'malformed stored JSON' })
    return parsed.data
  }
  ```
- 置換対象:
  - `src/services/badge-evaluator.ts:231, 356–368` → `parseJsonWithSchema(badge.conditionMeta, badgeConditionMetaSchema)`
  - `src/utils/twitter.ts:209` → Twitter レスポンス用スキーマを新設
  - `src/utils/character-whitelist.ts:20` → whitelist スキーマを新設
- ユニットテスト: 各スキーマの正常 / 異常系。

### T1-3. CORS 設定の整理 [High H3]

- 本番構成の確認: SPA は `wrangler.toml` の `[[env.production.assets]]` バインディング経由で同一オリジンから配信されているか。
- **同一オリジンなら**: `src/index.ts` から `cors` ミドルウェアを削除。
- **クロスオリジンなら**: `ORIGIN_ALLOWLIST` 環境変数（`[vars]` に環境別に定義）で `cors({ origin: allowlist, credentials: true })` を構成。
- E2E で確認。

### T1-4. 管理画面イベント作成/編集の導線修正 [High H6]

**目的**: 管理者が「作成 → 編集 → 一覧に戻る」を back キー含めて自然に行えるようにする。公開ページに突き抜けないようにする。

**手順**:

1. `src/app/routes/admin/events/new/index.tsx:25-27` の create 成功ハンドラを修正:
   ```ts
   const handleSuccess = (created: { uuid: string }) => {
     // /admin/events/new を履歴から消し、admin 一覧を back の着地点にしたうえで
     // 編集画面へ進む
     router.history.replace('/admin/events')
     router.navigate({
       to: '/admin/events/$uuid/edit',
       params: { uuid: created.uuid },
     })
   }
   ```
   - `useState(() => uuidv4())` の事前 uuid 生成方式は維持しつつ、上のハンドラ内では mutation の返却値の `uuid` を優先。
   - `replace: true` は使わない。
2. `src/app/routes/admin/events/$uuid/edit/index.tsx:19-21` の update 成功ハンドラに `replace: true` を追加:
   ```ts
   const handleSuccess = () => {
     router.navigate({ to: '/admin/events', replace: true })
   }
   ```
   - back で stale な編集フォームに戻らなくなる。
3. `src/app/routes/admin/events/new/index.tsx` の route の `validateSearch` に `redirectTo?: string` を追加し、コピー元 URL を保存できるようにする。既存のコピーボタン側（公開詳細ページ）が `navigate({ to: '/admin/events/new', search: { redirectTo: '/events/$uuid' } })` の形で遷移する経路にも余地を残す（将来実装、当 PR では受け皿のみ）。
4. Edit 画面のヘッダを create 画面と視覚的に区別:
   - `src/components/admin/event-form.tsx` にモード判別 (`mode: 'create' | 'edit'`) を props で受け、パンくず・ボタンラベル・タイトルバッジを分岐。
   - `src/app/routes/admin/events/{new,$uuid/edit}/index.tsx` から明示的に mode を渡す。

**検証**:

- 手動: `/events/$uuid` からコピー → create → 保存 → 編集画面に遷移する → back で `/admin/events` に着地することを確認。
- 手動: 編集画面で保存 → 一覧に遷移 → back で編集画面に戻らないことを確認。
- E2E: `e2e/admin-event-edit.spec.ts` に上記シナリオを追加。

**PR** (T1-4 単独): `fix/admin-event-create-navigation`

**PR** (フェーズ 1 まとめ、T1-1〜T1-3): `fix/security-ip-json-cors`

## フェーズ 2: 生成物運用とビルド衛生（1〜2 週間）

### T2-1. `routeTree.gen.ts` の追跡除外 [High H4]

- `.gitignore` に `src/app/routeTree.gen.ts` を追加。
- `git rm --cached src/app/routeTree.gen.ts` で既存追跡を解除しコミット。
- `package.json` の scripts に生成ステップを追加（`predev`, `prebuild`）:
  ```json
  "predev": "tsr generate",
  "prebuild": "tsr generate"
  ```
  `@tanstack/router-cli` の CLI 名は現行構成に合わせて確定させる。
- `.github/workflows/deployment.yaml` および `code_review.yaml` の該当ステップにも `bun run predev` 相当を挿入。
- ローカル動作確認: `bun run dev` で自動生成 → ページが表示されること。

### T2-2. `TanStackRouterDevtools` を DEV 限定に [High H5]

- `src/app/routes/__root.tsx` を以下に修正:
  ```tsx
  {import.meta.env.DEV && <TanStackRouterDevtools />}
  ```
- production build (`bun run build`) 後の `dist/` に devtools バンドルが含まれないことを確認。

### T2-3. `package.json` に標準スクリプト追加 [Low L1]

```json
"lint": "biome check .",
"lint:fix": "biome check --write .",
"format": "biome format --write .",
"typecheck": "tsc -b --noEmit",
"test": "bun test",
"test:e2e": "playwright test"
```

`.github/workflows/` の該当ステップも新スクリプトに置換して重複を削減。

### T2-4. その他ビルド衛生 [Medium M6, Low L3, L4]

- `package.json` から `@tanstack/router-devtools` を削除。`@tanstack/react-router-devtools` 側に import を統一。
- `biome.json` の `formatter.lineWidth` を 120 に統一。
- `vite.config.ts` から `optimizeDeps.include: ['sonner']` を削除して回帰確認。

**PR** (フェーズ 2 まとめ): `chore/build-hygiene-routetree-devtools-scripts`

## フェーズ 3: コード品質・整合性（2〜4 週間）

### T3-1. DTO 二重定義の統一 [Medium M1, M4]

- `src/schemas/_base.ts` に共通ベーススキーマを配置（`z` は `zod` から）:
  ```ts
  import { z } from 'zod'
  export const userBaseSchema = z.object({ id: z.string(), ... })
  ```
- `src/schemas/user.dto.ts` は `userBaseSchema` を再 export し、必要な箇所で `@hono/zod-openapi` の `.openapi()` を後付け:
  ```ts
  import { z } from '@hono/zod-openapi'
  import { userBaseSchema } from './_base'
  export const UserSchema = userBaseSchema.openapi({ ref: 'User' })
  export const UserSchemaForClient = userBaseSchema
  ```
- Zodios 側は `UserSchemaForClient` を、OpenAPI 側は `UserSchema` を使う運用。7 ペアすべて同様に。

### T3-2. `defaultHook` 統一 [Medium M2]

- `src/lib/create-openapi-router.ts`:
  ```ts
  export const createRouter = () => new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>({
    defaultHook: (result) => {
      if (!result.success) throw new HTTPException(400, { message: 'validation error', cause: result.error })
    },
  })
  ```
- 既存の `new OpenAPIHono(...)` を全て `createRouter()` に置換。
- `src/index.ts:152` の `app.onError` の `ZodError` 分岐は `HTTPException.cause` が `ZodError` の場合に細分化する。

### T3-3. API エラーメッセージ抽出 [Medium M8]

- `src/utils/api-error.ts` に:
  ```ts
  import { AxiosError } from 'axios'
  export const getApiErrorMessage = (error: unknown, fallback = '通信エラーが発生しました'): string => {
    if (error instanceof AxiosError) return error.response?.data?.message ?? fallback
    return fallback
  }
  ```
- `src/components/ranking/ranking-vote-badge.tsx:60`, `src/components/characters/character-vote-button.tsx:83` の `error as any` を置換。

### T3-4. TanStack Query 設定整合 [Medium M5]

- `src/hooks/use-events.ts` の `useEvents` / `useEvent`:
  - `staleTime: 0` を撤廃、`refetchOnMount: 'always'` も撤廃
  - 明示的な最新化が必要なコンポーネント側で `queryClient.invalidateQueries` を呼ぶ
- E2E で回帰確認。

### T3-5. `src/components/` 直下ファイルの整理 [Medium M7]

- `character-list-card.tsx` → `src/components/characters/character-list-card.tsx`
- `selected-store-info.tsx` → `src/components/location/selected-store-info.tsx`
- `store-list-item.tsx` → `src/components/location/store-list-item.tsx`
- 参照側の import path 修正。

### T3-6. Zod 後の冗長キャスト削除 [Low L6]

- `src/utils/token.ts` の `parseJwtPayload` から `as CustomJwtClaims` を削除。

**PR** (フェーズ 3 まとめ): 領域別に細分。
- `refactor/dto-consolidation`
- `refactor/openapi-router-factory`
- `refactor/api-error-helper`
- `chore/tanstack-query-defaults`
- `chore/components-folder-cleanup`

## フェーズ 4: リファクタリングとテスト拡充（継続）

### T4-1. 長大ファイルの分割 [Medium M3]

- **`src/services/badge-evaluator.ts` (396 行)** → `src/services/badge-evaluator/`
  - `area-mapping.ts` — エリア判定 (`storeKeys` 系)
  - `condition-parser.ts` — `BadgeConditionMeta` のパース (T1-2 と統合)
  - `evaluator.ts` — 評価本体
- **`src/services/event-service.ts` (408 行)** → `event/{read,write,aggregate}.ts` に分離
- **`src/api/me.ts` (297 行)** → `src/services/me-service.ts` に業務ロジック抽出、`api/me.ts` はルーティングのみ

### T4-2. 型安全化: `as string[]` の Zod 化 [Medium M3 副題]

- `src/services/badge-evaluator.ts` の `storeKeys as string[]` を `z.array(z.string()).parse(storeKeys)` に。
- `src/lib/event-form.ts:58–118` の form 由来キャストも Zod 化。
- `src/api/admin-badge.ts:201` の `} as CreateSpecialBadgeBody` を Zod スキーマの `.parse()` に。

### T4-3. テスト拡充 [Low L2, 継続]

- Vitest + React Testing Library セットアップ:
  ```
  vitest.config.ts
  test/setup.ts        # jsdom + @testing-library/jest-dom/vitest
  ```
- 未カバー領域のユニットテスト追加:
  - `src/services/{vote-service,me-service,user-service,favorite-service}.ts`
  - `src/utils/token.ts` (`signToken` / `verifyToken` / `parseJwtPayload`)
  - `src/middleware/{cloudflare-access,ip-check,vote-limit}.ts`
  - Durable Objects の入出力（Miniflare で Local DO テスト）
  - `src/utils/turnstile.ts` (実際の Turnstile API はモック)
- コンポーネントテスト:
  - `src/components/common/error-boundary.tsx`
  - `src/components/pwa/{install-prompt-ios,update-overlay,update-prompt}.tsx`
  - フォーム系 (`event-form`, `comment-form`)

### T4-4. CSP を Report-Only から Enforce へ [Low L5]

- `secureHeaders` の CSP を段階的に Enforce に切り替え、24〜48 時間 Report を観察してから本番反映。

**PR** (フェーズ 4): 分割 PR で継続的に。1 PR = 1 ファイル分割 or 1 service のテスト追加、を目安。

---

## 検証手順

各フェーズの各 PR で、以下を必ず実行:

```sh
bun run typecheck
bun run lint
bun test
bun run test:e2e     # ローカル wrangler dev 前提
bun run build
```

フェーズ 0 のみ手動検証を追加:

- `wrangler dev --env staging` で起動し、Turnstile widget を経由したコメント投稿が成功、無効トークン直叩きが失敗することを curl 等で確認。
- 旧 Cloudflare API トークンが revoke 済みで、旧値では認証が通らないことを curl で確認 (`curl -H "Authorization: Bearer OLD_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify` → 401)。
- CSRF 有効化後、E2E がすべて通ることを確認。

## PR 分割方針

| 順序 | ブランチ名 | フェーズ | 深刻度 |
|---|---|---|---|
| 1 | `fix/turnstile-secret-and-env-example` | 0 (T0-1, T0-2) | Critical |
| 2 | `fix/csrf-all-mutation-routes` | 0 (T0-3) | Critical |
| 3 | `fix/security-ip-json-cors` | 1 (T1-1..T1-3) | High |
| 3b | `fix/admin-event-create-navigation` | 1 (T1-4) | High |
| 4 | `chore/build-hygiene-routetree-devtools-scripts` | 2 (T2-1..T2-4) | High/Medium/Low |
| 5 | `refactor/dto-consolidation` | 3 (T3-1) | Medium |
| 6 | `refactor/openapi-router-factory` | 3 (T3-2) | Medium |
| 7 | `refactor/api-error-helper` | 3 (T3-3) | Medium |
| 8 | `chore/tanstack-query-defaults` | 3 (T3-4) | Medium |
| 9 | `chore/components-folder-cleanup` | 3 (T3-5, T3-6) | Medium/Low |
| 10+ | フェーズ 4 の分割 PR（継続） | 4 | Medium/Low |

各 PR は `develop` ブランチ向け。commitlint に沿った type を使い、body は 100 字/行 (`project_commitlint_rules` 準拠)。push 前に `bunx commitlint --last` を実行して検証。
