# コードベース全体リファクタリング監査 (2026-06-29)

## 目的

`biccame-musume` (Hono + Vite + Cloudflare Workers + React 19 + Prisma D1) の現状コードを横断的に点検し、優先度付きで改善ポイントを洗い出す。本ドキュメントは作業着手前の合意形成用。個別の改善は別 plan として切り出して実装する。

調査範囲: `src/`, `__tests__/`, `e2e/`, ルート設定ファイル。総コード行数 27,509 行 / 262 ファイル。

---

## 優先度サマリ

- **P0 (壊れている / リスク高)**: 不審な依存バージョン、auto-generated バッジ仕様の重複ロジック、リクエスト境界での `as` キャスト
- **P1 (保守性が顕著に低下)**: 巨大ファイル分割、duplicate 出力スキーマ、event-service の create/update 共通化
- **P2 (整理整頓)**: knip で検出された未使用コード、ルート単位 (src/api) のサブグループ化、utils の責務分離
- **P3 (将来課題)**: CSP 段階導入、テスト網羅、Workers 環境最適化

---

## P0. 壊れている / リスクが高い

### P0-1. 依存バージョンが現実離れしている可能性

`package.json` の以下の固定バージョンは要確認:

```json
"axios": "1.16.0",
"lucide-react": "1.14.0",
```

- 公開 npm の axios 1.x は 1.7.x 系が最新近辺。`1.16.0` が実在するか / 内部 npm のミラー越しか確認する。
- `lucide-react` は本来 `0.5xx` 系であり、`1.14.0` 表記は誤植 / フォーク / 別パッケージのいずれかが疑わしい。

**TODO:**
- `bun pm view axios versions` / `bun pm view lucide-react versions` で実在確認
- 想定外なら直近 stable に修正

### P0-2. リクエスト/レスポンス境界で `as` キャストが多発

`src/middleware/cloudflare-access.ts:30` の `payload as JWTPayload`、`src/utils/token.ts:59,76` の `(await verify(...)) as CustomJwtClaims` など、外部入力を検証無しでキャストしている箇所が複数。

```ts
// src/utils/token.ts:59
const result = (await verify(token, c.env.JWT_SECRET_KEY, AlgorithmTypes.HS256)) as CustomJwtClaims
```

zod による `safeParse` を挟むか、検証層を独立させる。

**影響範囲:** `src/middleware/cloudflare-access.ts`, `src/utils/token.ts`, `src/utils/og-event-image.ts:144` の `satori(vdom as any, ...)`、`src/utils/twitter.ts:208`、`src/utils/moderation.ts:24`。

**TODO:**
- JWT payload 用の zod スキーマを定義し検証関数化
- `og-event-image.ts:144` の `as any` は satori の型問題なので、型ガード or `satori-html` 経由を検討

### P0-3. `src/api/admin-badge.ts` で OpenAPI レスポンススキーマが大量にインライン重複

`POST /api/admin/badges` (`createSpecialBadge`) と `PATCH /api/admin/badges/:code` の `responses[201|200].content.application/json.schema` が ほぼ同一の `z.object({...})` をインライン定義していて、`AdminCreatedBadge` と `AdminUpdatedBadge` で約 13 フィールド × 2 回の重複 (約 30 行 × 2)。さらに同型は `BadgeSchema` (`schemas/badge.dto.ts`) に既存。

```ts
// admin-badge.ts L99-128 (一部)
schema: z.object({
  badge: z.object({
    code: z.string().nonempty(),
    category: z.string().nonempty(),
    sub_category: z.string().nonempty(),
    name: z.string().nonempty().optional(),
    // ... (以下省略)
  }).openapi('AdminCreatedBadge')
})
```

**TODO:**
- `BadgeSchema` を `.openapi('AdminBadge')` で再利用
- レスポンスラッパは `BadgeResponseSchema = z.object({ badge: BadgeSchema })` として共通化

---

## P1. 保守性低下が顕著

### P1-1. `src/app/routes/admin/badges/index.tsx` (907 行) を分割

1 ファイルに以下が同居している:

- ルートコンポーネント (Suspense / リスト / フィルタ)
- `BadgeCreateDialog` (special バッジ作成、storeKeys / eventId 切替フォーム)
- `BadgeEditDialog` (バッジ編集フォーム、auto-generated と special で挙動分岐)
- `RARITY_CHIP` などのヘルパ

特に Create/Edit Dialog は `condition_meta` の `storeKeys[]` セレクタや `eventId` 入力が L256-303 と L472-520 でほぼ同一の Controller ブロックを 2 度書いている。

**TODO:**
- `BadgeFormFields` (condition_meta 入力含む) を共通コンポーネント化し create/edit で再利用
- ヘルパ (`RARITY_CHIP` 等) を `lib/badge-display.ts` に集約
- 目標: ファイル分割後それぞれ 250 行以内

### P1-2. `src/services/event-service.ts` createEvent / updateEvent の重複

L207-275 (create) と L277-330 (update) は以下が同一:

- 日付変換 (`dayjs(...).toDate()` × 3)
- `conditions` / `referenceUrls` / `stores` の `create`/`deleteMany+create` ブロック
- `include` 句

```ts
// 両方に存在
const startDate = dayjs(data.startDate).toDate()
const endDate = data.endDate ? dayjs(data.endDate).toDate() : null
const endedAt = data.endedAt ? dayjs(data.endedAt).toDate() : null
```

**TODO:**
- `mapEventInputToPrisma(data)` ヘルパで Prisma 入力を組み立て、create/update で共有
- 共通 `include` を定数化

### P1-3. `src/services/badge-evaluator.ts` ディスパッチャをテーブル化

L188-265 の `switch (sub)` は 15 ケース。各ケースで `meta.xxx` が未定義なら throw → 該当 evaluator を呼ぶ、という同形を繰り返している。新しい sub_category 追加時の追従コストが高い。

**TODO:**
- `Record<BadgeSubCategory, (ctx, meta) => Promise<boolean>>` 形式のレジストリに変換
- meta 検証は zod の discriminated union (`BadgeConditionMetaSchema` を sub_category ごとに narrow) で吸収
- これにより `as StoreKey` / `as BadgeArea` キャストも削減

### P1-4. `src/utils/client.ts` (566 行) を Zodios ドメイン別に分割

全 API エンドポイント定義が単一の `makeApi([...])` 配列。React の各 hooks (`use-events`, `use-favorites`, ...) が `client.<endpoint>` を呼ぶ構造なので、ドメイン単位 (events / votes / badges / me / admin) に分割しても呼び出し側互換は保てる (Zodios 複数 instance または同一 instance に合成)。

**TODO:**
- `src/utils/client/<domain>.ts` に分割、`src/utils/client/index.ts` で `makeApi([...events, ...votes, ...badges, ...])` のように合成
- 各 hooks の import パスは変えない (re-export 維持)

### P1-5. `BadgeConditionMeta` を discriminated union 化

`src/schemas/badge.dto.ts:42-50` の `BadgeConditionMetaSchema` は全フィールド optional なフラット型で、`badge-evaluator` 側で `if (!meta.storeKey) throw` と都度ガードを書く羽目になっている。

**TODO:**
- `BadgeSubCategorySchema` ごとに必要フィールドが決まる以上、`z.discriminatedUnion('sub_category', [...])` を作る
- admin フォーム側 (`admin/badges/index.tsx`) も union 化された型からフォームを生成

### P1-6. 巨大コンポーネント分割 (UI 全般)

| ファイル | 行数 | 主な責務混在 |
|---|---:|---|
| `components/events/event-detail-header.tsx` | 413 | ヘッダ表示 + 状態バッジ + 共有 / 編集ボタン群 |
| `components/admin/event-form.tsx` | 392 | フォーム + 重複 URL チェック + 確認ステップ |
| `components/admin/event-list.tsx` | 386 | リスト + フィルタ + ソート + 一括操作 |
| `components/ranking/ranking-list.tsx` | 383 | リスト本体 + 投票案内 + 多数の inline motion 設定 |
| `components/auth/login-dialog.tsx` | 264 | Firebase Auth UI + プロバイダ別ハンドラ |

**TODO:**
- それぞれ「表示」「操作 (hooks)」「サブセクション」に分解
- `ranking-list.tsx` は motion preset を `lib/motion.ts` に集約

---

## P2. 整理整頓

### P2-1. knip の検出結果

`bunx knip --no-progress` 結果から:

**未使用ファイル (1):**
- `src/lib/leaderboard.ts` → 削除候補

**未使用 export (11):**
- `BADGE_CATEGORY_MAP` (`lib/badge-categories.ts:125`)
- `stickerTransformStyle` (`lib/sticker.ts:23`)
- `ON_DEMAND_FILE_URL_TEMPLATE` / `ON_DEMAND_FILE_REGEX` / `onDemandHashRegex` (`lib/x-transaction/constants.ts`)
- `BadgeListSchema` / `UserBadgeListSchema` / `AdminBadgeResponseSchema` (`schemas/badge.dto.ts`)
- `EXCLUDED_STORE_KEYS`, `getLargeTwitterPhoto`, `__resetBiccameMusumeIdCache`

**未使用エクスポート型 (14):** `UpdateStoreResponse`, `UpdateEventResponse`, `AdminCommentsResponse`, `BadgeSubCategory`, `UserBadge`, `MyBadgesResponse`, `BadgeDefDto`, `BadgeLeaderboardResponse`, `GetBadgesResponse`, `EarnedBadge`, `MeRank`, `CreateCommentRequest`, `ListCommentsResponse` 他

**重複 export:** `STATUS_BADGE|STATUS_BADGE_SM|STATUS_BADGE_DETAIL` (`locales/component.tsx`)、`MyBadgesResponseSchema|GetMyBadgesResponseSchema`、`BadgeLeaderboardResponseSchema|GetBadgeLeaderboardResponseSchema`、`BadgeSchema|AdminBadgeResponseSchema` (badge.dto.ts)

**未使用 dep (12)** ※要二次検証 ※`components/ui/` は tsconfig/biome から除外されているため knip が参照を辿れていない可能性が高い:
`@radix-ui/react-avatar`, `react-checkbox`, `react-dialog`, `react-label`, `react-select`, `react-separator`, `react-slot`, `react-tabs`, `react-toggle`, `react-tooltip`, `cmdk`, `embla-carousel-react`

**TODO:**
- knip の `entry` 設定に `src/components/ui/**/*.tsx` を追加して再評価
- 真に未使用な export / file は削除
- duplicate export はエイリアスを片方に寄せる

### P2-2. `src/api/admin-*.ts` をサブグループ化

`src/index.ts` で個別に `app.route('/api', adminBadges)` のように 4 つ並んでいる:
```ts
app.route('/api', adminBadges)
app.route('/api', adminComments)
app.route('/api', adminUsers)
app.route('/api', adminTwitter)
```

`OpenAPIHono` を `/admin` 配下にまとめ、`CFAuth` をグループ単位で適用すると、各ファイルから `middleware: [CFAuth]` の繰り返しが消える。

**TODO:**
- `src/api/admin/index.ts` で 4 つを合成し `app.route('/api/admin', adminApp)` に統一
- CFAuth は `adminApp.use('*', CFAuth)` に集約

### P2-3. `src/utils/` の責務分離

現状の `utils/` 配下:
```
client.ts (Zodios), twitter.ts (Twitter API クライアント), token.ts (JWT),
character-whitelist.ts, holidays.ts, og-event-image.ts, og-meta.ts,
tweet-text.ts, moderation.ts ...
```

「ユーティリティ」というよりサービス・統合層が混在。

**TODO:**
- `src/utils/client.ts` → `src/api-client/`
- `src/utils/twitter.ts` → `src/services/twitter-service.ts` (Workers バインディング依存があるため)
- `src/utils/token.ts` → `src/lib/auth/token.ts`
- 純粋なヘルパだけ utils に残す (`tweet-text.ts`, `holidays.ts` 等)

### P2-4. プロジェクト規約違反

CLAUDE.md / 内製 agent の規約「no `??`, no `let`, no type assertions, no `while`」に対する違反検出:

- `let` 9 箇所 (`src/app/main.tsx:45`, `utils/character-whitelist.ts:6`, `utils/og-event-image.ts:14,24`, `components/ranking/ranking-vote-badge.tsx:57`, `components/pwa/update-prompt.tsx:6,7`, `components/events/upcoming-event-list.tsx:37`, `components/events/gantt/use-gantt-layout.ts:105,245`)
- `??` 104 箇所
- 型アサーション (`as Foo`) は前述 P0-2 と巨大コンポーネント内 (`admin/badges/index.tsx` の `STORE_NAME_LABELS[sk as keyof typeof ...]` パターン) で多発

※ 現 `biome.json` は `recommended` のみで上記ルールを enforce していない。

**TODO:**
- 規約として継続するなら biome rule (`noLet`, `noNonNullAssertion` 等) を有効化
- 規約緩和するなら CLAUDE.md / agent description から削除

### P2-5. ルート直下の不要物

`backups/`, `dev-dist/`, `dist/`, `test-results/`, `cookie.txt` はすべて `.gitignore` 済みでリポジトリに混入はしていないが、ローカル作業ディレクトリに残留中。`cookie.txt` は debug 用かどうか確認。

**TODO:**
- 不要なら `git clean -ndX` で削除候補確認後にクリーンアップ
- `cookie.txt` の用途を確認しドキュメント化 or 削除

---

## P3. 将来課題

### P3-1. CSP の段階導入

`src/index.ts:41-58` のコメントに `Phase 2 で Report-Only から段階導入する想定` とある。Google Maps / Firebase / Turnstile / Twitter 画像のオリジン棚卸しを別 plan で。

### P3-2. テスト網羅性

- `__tests__/` 18 ファイル / `src/` 262 ファイル
- `services/` 配下 (`badge-evaluator.ts` 410 行、`event-service.ts` 392 行) に対するユニットテストが薄い
- `badge-evaluator` は決済ロジック級にビジネスクリティカル — discriminated union 化 (P1-5) と同時にゴールデンテスト整備推奨

**TODO:**
- 最低限 `badge-evaluator` の 15 sub_category 全網羅テストを追加
- `event-service.createEvent`/`updateEvent` の冪等性テスト

### P3-3. Prisma `select` を活用してレスポンス幅を削る

`src/services/event-service.ts` の `getEvent`/`getEvents`/`searchEvents` は `include` で関連を取り切っているが、`select` で必要列のみに絞る最適化余地あり (D1 のシリアライズコスト削減)。

**TODO:** クエリ単位のプロファイリング後に判断

### P3-4. PWA / Service Worker 周りの top-level await

`src/app/main.tsx:46-71` の `await import('virtual:pwa-register')` は production ビルド時のみだが、bundle 構造によってはハイドレーション開始を遅らせる。`requestIdleCallback` 越しに遅延登録する変更を検討。

---

## 推奨実施順序

1. **P0-1** (依存バージョン確認) — 30 分
2. **P0-3 + P1-3** (admin-badge スキーマ重複削除 + badge-evaluator テーブル化) — 共に badge ドメインなので 1 PR で
3. **P1-2** (event-service create/update 共通化)
4. **P1-1** (admin/badges/index.tsx 分割)
5. **P1-5** (`BadgeConditionMeta` discriminated union 化) — admin/badges フォーム連動
6. **P0-2** (JWT / 外部入力の zod 検証) — 認証層の安全網
7. **P1-4** (Zodios client 分割)
8. **P1-6** (巨大コンポーネント分割) — 順次
9. **P2-1 ~ P2-5** (knip 整理、admin サブグループ化、utils 再配置、規約整合)
10. **P3** はバックログへ

---

## 影響範囲チェックリスト (実施時の必須確認)

- [ ] 各リファクタ前後で `bun run build` (= `tsc -b && vite build`) が green
- [ ] `bunx knip` の数値が悪化していない
- [ ] OpenAPI 出力 (Zodios client) の URL / メソッド差分が無い (互換性)
- [ ] `__tests__/` および `e2e/` が green
- [ ] D1 マイグレーション差分が出ていない (ドメインモデル変更を伴わない確認)

---

## 補足: 本監査のメタ

- 調査日: 2026-06-29 (develop ブランチ、a2cb763 時点)
- 並列 Explore agent 3 体を投入したが認証エラーで全 fail。手動調査で代替。
- knip 結果は `bunx knip --no-progress` (2026-06-29 実行) を引用。
