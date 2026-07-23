# コードベース精査報告書 (2026-07-22)

対象: `biccame-musume` (v0.31.0) — React 19 + TanStack Router + Vite + Hono + Cloudflare Workers + Prisma(D1)

## サマリ

本報告書は、リポジトリ全体（`src/`, `wrangler.toml`, `vite.config.ts`, `biome.json`, `.env`, `.github/workflows/`, `__tests__/`, `e2e/` ほか）を対象に、静的解析ではなく人手（LLM 併用）で確認した結果をまとめたものである。

- **Critical 3 件**（Turnstile 実質無効化、ローカル `.env` の API トークン露出、CSRF ミドルウェアの適用漏れ）
- **High 6 件**（client IP 偽装耐性、DB/外部 JSON の未検証パース、CORS 停滞設定、`routeTree.gen.ts` 差分ノイズ、devtools 本番残置、**管理画面イベント作成/編集の導線不整合**）
- **Medium 8 件** — DTO 二重定義、`defaultHook` 不統一、長大ファイル、Zod import 元不統一、TanStack Query 設定不整合、devtools パッケージ二重、components 直下の孤立ファイル、`error as any` 重複
- **Low 6 件** — `package.json` スクリプト不足、Vitest 未宣言、Biome `lineWidth` 不整合、`optimizeDeps` 旧回避策、CSP Report-Only、Zod 後の冗長キャスト

一方で、Zodios + zod-openapi による API 契約、`WeakMap` ベースの PrismaClient キャッシュ、3 層構成、E2E 網羅、PWA のバージョン駆動キャッシュ無効化、Biome の 11 個の custom grit plugins による厳格な規約は良質な設計として維持されるべきである。

修正の順序は別途 `2026-07-22-codebase-audit-remediation-plan.md` に定義した。

## 調査範囲と方法

- Explore agent 3 体を並列起動し、プロジェクト構造 / バックエンド (`src/api`, `src/services`, `src/lib`, `src/middleware`, `src/schemas`, `src/utils`) / フロントエンド (`src/app`, `src/components`, `src/atoms`, `src/hooks`) を分担調査
- `.env`, `wrangler.toml`, `.gitignore`, `docs/plans/` を直接読み取り
- `git status`, `git ls-files`, `git check-ignore` で追跡状況を確認

コード動作は変更していない（読み取りのみ）。

## 深刻度定義

| 深刻度 | 定義 |
|---|---|
| Critical | セキュリティ侵害・データ漏洩・本番停止の直接原因になり得るもの。原則、当日〜数日で対処。 |
| High | 明確なリスク（データ整合性、認可回避、開発生産性の慢性阻害）はあるが、悪用に条件が付くもの。1〜2 週間内で対処。 |
| Medium | コード品質、保守性、一貫性の欠如。仕様変更時に不具合を招きやすい。1〜2 スプリントで解消。 |
| Low | 改善余地はあるが影響が限定的。まとめて着手可能。 |

---

## Critical: 直ちに対応すべき事項

### C1. Turnstile シークレットが production でも公式テストキー

- **対象**: `wrangler.toml:75, 150, 229`
- **現状**: base / staging / production の `[vars]` すべてに `TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA"` が設定されている。これは Cloudflare が公開している「常に成功を返す」テストキー。
- **影響**: `src/api/comment.ts:120` の `verifyTurnstileToken(...)` が **全環境で常に true** を返す。コメント投稿の bot 対策として機能しない。無償で無制限にコメント投稿される可能性がある。
- **推奨対応**: `wrangler.toml` の `[vars]` から削除し、`wrangler secret put TURNSTILE_SECRET_KEY --env staging` / `--env production` で本物の secret を注入。ローカルは `.dev.vars` にテストキーを置く。詳細は修正計画書フェーズ 0 参照。

### C2. ローカル `.env` に実 Cloudflare API トークン露出

- **対象**: `/home/vscode/app/.env`
- **現状**: `CLOUDFLARE_API_TOKEN=cfat_...`（実トークン形式）と `CLOUDFLARE_ACCOUNT_ID=...` が平文で存在。`.gitignore` の 128 行目で `.env` は追跡除外されており、`git ls-files` にも入っていないためリポジトリ本体には流出していない。ただし IDE でファイルが開かれた状態が確認できており、スクショ・画面共有・バックアップ経由の露出リスクは残る。
- **影響**: このトークンが第三者に渡ると Cloudflare アカウント (`2488ea57...`) の権限で操作される可能性。
- **推奨対応**: 早期にダッシュボードで **revoke → 再発行**。加えて `.env.example` を新設して値なしのテンプレートを提供、開発者がコピーして使う運用に統一。詳細は修正計画書フェーズ 0 参照。

### C3. CSRF ミドルウェア未適用のミューテーション経路

- **対象**: `src/api/{event,comment,vote,favorite,me,admin/*}.ts`
- **現状**: `hono/csrf` は `src/api/auth.ts` と `src/api/user.ts` にしか適用されていない。認証は Cookie に格納された JWT のみに依存。
- **影響**: Cookie SameSite=Lax でも POST は許容されるため、悪意のあるサイトからの `<form>` POST でユーザーの認証状態のまま副作用のあるリクエスト（投票、コメント、お気に入り、プロフィール更新など）が実行される可能性。
- **推奨対応**: `csrf` ミドルウェアを全ミューテーション ルーターに拡張、あるいはトップレベル `app.use('*', csrf({ origin: ... }))` で一括適用。フロントは同一オリジンから叩くため副作用は最小。

---

## High: 早期対応が望ましい事項

### H1. `X-Real-IP` フォールバックによる client IP 偽装耐性の欠如

- **対象**: `src/middleware/ip-check.ts`, `src/middleware/vote-limit.ts`
- **現状**: `CF-Connecting-IP` を優先しつつ、値が無い場合 `X-Real-IP` にフォールバック。
- **影響**: Cloudflare Workers に到達したリクエストの `CF-Connecting-IP` は Cloudflare が付与するため信頼できるが、`X-Real-IP` はクライアントが任意に付与可能。フォールバック経路を突かれると投票の rate limit / IP 帯 BAN が回避される。
- **推奨対応**: フォールバックを削除し `CF-Connecting-IP` のみ。ローカル `wrangler dev` は同ヘッダを自動付与するため実運用に影響なし。

### H2. DB / 外部 JSON の未検証パース

- **対象**: 
  - `src/services/badge-evaluator.ts:231, 356–368`（`JSON.parse(badge.conditionMeta) as BadgeConditionMeta`）
  - `src/utils/twitter.ts:209`（Twitter API レスポンス）
  - `src/utils/character-whitelist.ts:20`（外部 JSON）
- **現状**: `JSON.parse` の結果を Zod 検証せず `as` キャストで通している。
- **影響**: DB が破損した / 管理画面のバリデーションが緩んだ / 外部 API のスキーマが変わった場合、型システムはそれを検知できず、下流で `undefined` アクセス等でランタイム例外が発生する。バッジ評価は集計処理なので中断が広範に影響する可能性。
- **推奨対応**: `src/lib/parse-json.ts` に `parseJsonWithSchema<T>(raw: string, schema: ZodSchema<T>): T` を新設し、全箇所で利用。

### H3. CORS 設定が本番用オリジンを欠く / 停滞

- **対象**: `src/index.ts`
- **現状**: `cors({ origin: ['http://localhost:15175'], credentials: true })`
- **影響**: 本番オリジンからのブラウザ発 XHR が CORS 拒否される可能性、または同一オリジン運用で CORS ミドルウェア自体が不要な可能性がある。どちらにせよ現行値は事実として不整合。
- **推奨対応**: 本番が SPA を同一オリジンから配信（`ASSETS` バインディング）なら CORS ミドルウェア削除。異なる場合は環境変数 `ORIGIN_ALLOWLIST` で環境別に切り替える。

### H4. `routeTree.gen.ts` の慢性的な差分ノイズ

- **対象**: `src/app/routeTree.gen.ts`
- **現状**: `git status` で常に未ステージ、`git diff` は 273 行の追加/削除。Biome では `!src/**/routeTree.gen.ts` で除外されているが、Git は追跡しており PR ごとに大量の差分が付く。
- **影響**: レビューノイズによる見落とし増、コンフリクト頻発、差分の signal が薄まる。
- **推奨対応**: `.gitignore` に追加 + `prebuild` / `predev` で再生成 + CI でもビルド前に生成、を推奨（案 A）。

### H5. `TanStackRouterDevtools` が本番でも常時レンダー

- **対象**: `src/app/routes/__root.tsx`
- **現状**: `import.meta.env.DEV` ガードなしで常時 mount。
- **影響**: 本番バンドルに devtools が入るため bundle size 増、内部ルート構造の露呈、パフォーマンス低下。
- **推奨対応**: `{import.meta.env.DEV && <TanStackRouterDevtools />}` に置換。

### H6. 管理画面イベント作成/編集の導線不整合

- **対象**:
  - `src/app/routes/admin/events/new/index.tsx:25-27`（create 成功時の遷移）
  - `src/app/routes/admin/events/$uuid/edit/index.tsx:19-21`（update 成功時の遷移）
  - `src/app/routes/admin/events/$uuid/index.tsx:5`（`/admin/events/$uuid` → edit への即時 redirect）
  - `src/components/admin/event-form.tsx`（create / edit で共通利用）
- **現状**:
  - **Create 成功時**: `navigate({ to: '/admin/events/$uuid/edit', params: { uuid: newUuid }, replace: true })` を実行。`newUuid` は `useState(() => uuidv4())` で client 側に事前生成し、そのまま create payload に載せる方式のため、遷移先は「作成された event の編集画面」。edit 画面は create 画面と同じ `EventForm` を使い回すため見た目がほぼ同一で、利用者は「作成後に同じ create ページに戻ってきた」と誤認する。
  - **Update 成功時**: `router.navigate({ to: '/admin/events' })`（一覧へ）で妥当だが、`replace: true` が付いていないため back で編集画面の stale キャッシュに戻れてしまう。
  - **Back の挙動**: create 成功時の `replace: true` により `/admin/events/new` が履歴から消える。その直前の履歴が公開イベント詳細 (`/events/$uuid`) だと、back で公開ページに突き抜ける。「コピー」フローで公開詳細から create に来た場合に発生。
- **影響**:
  - 管理者が「作成 → 続けて別のイベントを作る」や「作成 → 一覧に戻る」を行う際に UX が破綻。back でも脱出できず、意図的に URL を打ち直すハメになる。
  - 編集直後に戻ると stale な form 状態が表示され、二重編集事故の温床。
- **推奨対応**:
  1. Create 成功時は `router.history.replace('/admin/events')` を先に呼び、続けて `navigate({ to: '/admin/events/$uuid/edit', params: { uuid } })` で編集画面に遷移。back は必ず admin 一覧に着地。
  2. Update 成功時の `router.navigate({ to: '/admin/events' })` に `replace: true` を付与し、back で編集画面の stale キャッシュに戻らない。
  3. コピーフロー用に `/admin/events/new` に `redirectTo` search param を受け付け、`beforeLoad` で history を明示的に組み替える経路も検討。
  4. Edit 画面のヘッダに視覚的な区別を追加（例: パンくずまたはタイトル色）— UI 側の副次対応、根本策とセットで。

---

## Medium: 品質改善事項

### M1. DTO の `Schema` / `SchemaForClient` 二重定義

- **対象**: `src/schemas/{user,activity,vote,favorite}.dto.ts` ほか、計 7 ペア
- **現状**: 「Zodios クライアント用に openapi メソッドを使わないバージョン」と注記されたパラレル定義。
- **影響**: 仕様変更時に片方だけ更新される事故が起きやすい。
- **推奨対応**: 共通ベーススキーマを `zod` で定義し、`.openapi()` を後付けするヘルパー `toOpenApi(schema, meta)` を作って一元化。

### M2. `defaultHook` の適用が一部ルーターのみ

- **対象**: `src/api/*.ts` のうち `defaultHook` を設定しているのは `auth.ts` と `user.ts` 程度。
- **現状**: 他は `OpenAPIHono` の既定挙動で 400 を返すが、`src/index.ts:152` の `app.onError` の分岐 (`ZodError`) には到達しない。
- **推奨対応**: `src/lib/create-openapi-router.ts` を新設し、全ルーターがそのファクトリ経由で生成される形にする。エラーは `throw new HTTPException(400, ...)` に集約。

### M3. 長大ファイルと責務混在

- **対象**: `src/services/event-service.ts` (408 行), `badge-evaluator.ts` (396 行), `src/api/me.ts` (297 行), `src/api/admin-badge.ts` (318 行), `src/api/vote.ts` (248 行), `src/api/direction.ts` (222 行), `src/api/comment.ts` (220 行)
- **影響**: 変更影響の見積もりが困難、テストが書きづらい。
- **推奨対応**: `badge-evaluator.ts` は「エリアマッピング」「条件パース」「評価本体」に分離。`event-service.ts` は「読取」「書込」「集計」に分離。

### M4. Zod の import 元不統一

- **対象**: `src/schemas/*.dto.ts`
- **現状**: 一部は `import { z } from 'zod'`、他は `from '@hono/zod-openapi'`。後者のみ `.openapi()` メタが付く。
- **推奨対応**: OpenAPI 対象は `@hono/zod-openapi` に統一。DTO 統一（M1）と同時実施。

### M5. TanStack Query の設定不整合

- **対象**: `src/hooks/use-events.ts` の `useEvents` / `useEvent`
- **現状**: グローバル既定は `staleTime: 5min`, `networkMode: 'offlineFirst'` なのに、これらは `staleTime: 0 + refetchOnMount: true` を上書きしている。
- **影響**: offline-first の意図とズレ、PWA でモバイル回線時に不要な再取得が走る。
- **推奨対応**: 意図を明文化。offline-first を維持するなら `staleTime: 60_000` 程度に。

### M6. devtools パッケージの二重依存

- **対象**: `package.json`
- **現状**: `@tanstack/react-router-devtools` と `@tanstack/router-devtools` の両方が入っている。
- **推奨対応**: `@tanstack/router-devtools` を削除し `@tanstack/react-router-devtools` に統一。

### M7. `src/components/` 直下の孤立ファイル

- **対象**: `character-list-card.tsx`, `selected-store-info.tsx`, `store-list-item.tsx`
- **現状**: 他の同種コンポーネントは feature フォルダ (`characters/`, `location/`) に集約されている中で、これらだけ直下に置かれている。
- **推奨対応**: `character-list-card.tsx` → `characters/`、`selected-store-info.tsx` / `store-list-item.tsx` → `location/` に移動。

### M8. `error as any` の重複

- **対象**: `src/components/ranking/ranking-vote-badge.tsx:60`, `src/components/characters/character-vote-button.tsx:83`
- **現状**: 投票エラー時に `(error as any).response?.data?.message` 相当のアクセス。
- **推奨対応**: `src/utils/api-error.ts` に `getApiErrorMessage(error: unknown): string` を作り、共通利用。

---

## Low: 軽微な改善点

### L1. `package.json` に `lint` / `typecheck` / `test` / `format` スクリプトが無い

- **現状**: Biome / TypeScript / Playwright / `bun test` は入っているが npm script が存在せず、CI は直接ツール呼び出しで動いている。
- **推奨対応**: 標準スクリプトを追加してローカル開発体験と CI を統一。

### L2. `__tests__/` に `.test.ts` があるのに Vitest 未宣言

- **現状**: `bun test` 前提の運用。
- **推奨対応**: 明示的な選定と `package.json` への `test` script 追加、または Vitest 導入。

### L3. Biome の `lineWidth` 設定不整合

- **現状**: base `formatter.lineWidth: 80`、JS のみ `120` に上書き。
- **推奨対応**: 120 に統一（実装が長い箇所が既に 120 前提）。

### L4. `optimizeDeps.include: ['sonner']` の残置

- **現状**: `vite.config.ts` に旧回避策としてのみ残っている可能性。
- **推奨対応**: 削除して回帰なしを確認。

### L5. `secureHeaders` の CSP が Report-Only

- **現状**: `src/index.ts` の CSP は Report-Only ヘッダで送出。
- **推奨対応**: 意図的（フェーズを踏んで Enforce に移行）なら方針を README/コメントに明記。

### L6. `parseJwtPayload` の冗長キャスト

- **対象**: `src/utils/token.ts`
- **現状**: Zod parse 後に `as CustomJwtClaims`。Zod が既に型付きを返すのでキャスト不要。
- **推奨対応**: キャストを削除。

---

## 対応済み / 検討中（現状の良い点）

- **Zodios + zod-openapi による API 契約統一** — `src/utils/client/index.ts` が `makeApi([...])` を 14 個の domain endpoint から合成し、`new Zodios('/', api)` に集約。フロント・バックの契約が実質的に同一 Zod スキーマで駆動されている。
- **PrismaClient の WeakMap キャッシュ** — `src/lib/prisma.ts`。Workers のリクエストごとインスタンス化を避け、D1 バインディングに紐づけて再利用する設計。
- **3 層構成** — `api/` (route + validation) → `services/` (Prisma + business rules) → `lib/`, `utils/`。責務分離が明確。
- **E2E 網羅** — `e2e/` 配下に admin, badges, location, routes, sticky, visual, user-activity のスペック + screenshots ベースの visual diff。
- **バックエンド ユニットテスト** — parser 系 (`parse_hours`, `parse_calendar`, `extract_prefecture`, `calendar_birthdays`)、`event-service`, `badges` 5 ファイル、`api/comment`, `twitter/tweet-text`。
- **PWA のバージョン駆動キャッシュ無効化** — `__APP_VERSION__` / `__GIT_HASH__` を vite define で埋め込み、`checkVersionAndClearCache` で TanStack Query キャッシュを世代管理。
- **Biome の 11 custom grit plugins** — `no-let`, `no-new-date`, `no-nullish-coalescing`, `no-type-assertion`, `prefer-z-*` など、コード規約を静的に強制。
- **CSP を含む `secureHeaders`** — 適用済み（enforcement は今後）。
- **CFAuth を admin ルータで一括適用** — `src/api/admin/index.ts` で `/admin/*` に集中。

---

## 参考: 主要ファイル一覧

### 設定・インフラ

- `wrangler.toml` — バインディングと環境変数（`[env.staging]`, `[env.production]`）
- `vite.config.ts` — TanStack Router / Cloudflare / Tailwind / intlayer / PWA / sitemap
- `biome.json` + `biome-plugins/` — フォーマット規約 + custom grit rules
- `tsconfig.json` — strict, `target ES2022`, path alias `@/*`
- `playwright.config.ts` — chromium single project, port 15175
- `.github/workflows/` — `code_review`, `deployment`, `integration`, `update_dependencies`

### バックエンド

- `src/index.ts` — Hono エントリ、CORS / CSP / onError
- `src/api/` — 15 ルーター
- `src/services/` — `event-service`, `badge-evaluator`, `me-service`, ほか
- `src/lib/prisma.ts` — PrismaClient factory
- `src/middleware/{cloudflare-access,ip-check,vote-limit,og-rewrite}.ts`
- `src/schemas/*.dto.ts` — Zod DTO
- `src/utils/{token,turnstile,twitter,character-whitelist}.ts`

### フロントエンド

- `src/app/main.tsx` — router bootstrap, PWA 登録, page-view tracking
- `src/app/routes/__root.tsx` — providers, error boundary
- `src/app/routes/**/*.tsx` — file-based routes
- `src/app/routes/admin/events/{index,new/index,$uuid/index,$uuid/edit/index}.tsx` — 管理画面イベント CRUD の遷移中枢（H6 参照）
- `src/components/admin/event-form.tsx` — create / edit 共有フォーム
- `src/components/{ui,admin,auth,badges,calendar,characters,common,events,home,location,pwa,ranking,route}/`
- `src/atoms/*.ts` — Jotai (12 atoms)
- `src/hooks/use-*.ts` — Zodios wrappers
- `src/utils/client/index.ts` — Zodios composition
- `src/index.css`, `src/themes/{default,light,dark}.css`
