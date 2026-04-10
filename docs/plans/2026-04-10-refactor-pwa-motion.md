# Work Plan: PWA・Motion 重点リファクタリング
Date: 2026-04-10

## Goal
プロジェクト全体のリファクタリング。特に PWA 挙動と motion アニメーションを重点的に改善し、コード品質を底上げする。

## 現状サマリ
- **PWA**: vite-plugin-pwa は既に `autoUpdate` + Workbox マルチキャッシュ戦略で堅牢に設定済み。更新 UI は toast のみで改善余地あり。
- **Motion**: `motion@12` が 31 ファイル・217 宣言で使用されているが、spring/easing 設定が各所にハードコードされ共通化されていない。
- **God components**: `event-gantt-chart.tsx` (393行)、`character-detail-content.tsx` (328行)、`routes/index.tsx` (207行)。
- **型**: `any` が 2 箇所（`event-service.ts:4`, `event-form.tsx:1`）。
- **DB**: `name` → `title` リネームの TODO が `event-service.ts:74` に残存。Prisma スキーマは `name` のまま。
- **API**: `/api/version` は `OpenAPIHono` ではなく bare `Hono` で実装されており OpenAPI spec に含まれていない。

## Tasks

### Frontend
- [x] `src/lib/motion.ts` を新設し、共有の spring/easing/transition プリセット（`SPRING_PRESET`, `FADE_IN`, `EASE_OUT` 等）を定義
- [x] 31 ファイルの motion 呼び出しを共有プリセット参照に置換
- [x] `event-gantt-chart.tsx` を `GanttHeader` / `GanttRow` / `GanttTimeline` + `useGanttLayout` hook に分割
- [x] `character-detail-content.tsx` を `src/components/characters/detail/` 配下のサブコンポーネントに分割
- [x] `routes/index.tsx` からインラインの `BirthdayDisplaySwitcher` / `ClearCacheButton` を `src/components/home/` へ切り出し
- [x] PWA 更新 UI を改善: `src/components/pwa/update-prompt.tsx` として永続バナー（リロード CTA + 閉じる）を新設し、`main.tsx` の SW 更新イベントと接続
- [x] `ClearCacheButton` 等のデバッグ UI を `import.meta.env.DEV` でガード、または `src/components/dev/` 配下に隔離
- [x] `event-form.tsx:1` の `any` を Zod 推論型で置換

### Backend
- [x] Prisma マイグレーション: `Event.name` → `Event.title` へリネーム（`prisma migrate diff` 経由、直接 SQL 禁止）
- [x] マイグレーション後、`event-service.ts` の `transform` 内の `title: event.name` ワークアラウンドと `biome-ignore` を削除
- [x] `transform` の `any` を `Prisma.EventGetPayload<{ include: { conditions; referenceUrls; stores } }>` へ置換
- [x] `/api/version` を `OpenAPIHono` へ移行し OpenAPI spec に含める

### QA
- [x] `bunx tsc -b --noEmit` で型チェック
- [x] `bunx biome check src/` で lint + format
- [x] `bunx knip` で未使用エクスポートを確認
- [x] commitlint 形式でタスク単位にコミット

## Execution Order
1. **Sequential (foundation)**: motion.ts プリセット作成 → 各コンポーネントの置換
2. **Parallel**: (a) God component 分割, (b) PWA 更新 UI, (c) Backend の Prisma マイグレーション + 型修正
3. **Sequential (最後)**: `any` 除去 → QA（型・lint・knip）→ コミット

## Deliverables
- `src/lib/motion.ts`: 共有 motion プリセット
- `src/components/events/gantt/*.tsx`: 分割後の Gantt コンポーネント群
- `src/components/characters/detail/*.tsx`: 分割後の詳細コンポーネント群
- `src/components/home/birthday-display-switcher.tsx`, `clear-cache-button.tsx`
- `src/components/pwa/update-prompt.tsx`: PWA 更新バナー
- `prisma/schema.prisma` 更新 + 新マイグレーション
- `src/services/event-service.ts` クリーンアップ
- `src/api/version.ts` を OpenAPIHono 化

## Risks / Notes
- **Prisma マイグレーションはデータ破損リスクあり**: `name` → `title` は rename であり、データ保持のため `prisma migrate diff` 生成 SQL を目視確認すること。D1 は SQLite ベースのため `ALTER TABLE ... RENAME COLUMN` の挙動に注意。
- **Motion の一括置換は視覚的回帰リスク**: プリセット適用後は主要画面を手動確認する必要あり。
- **Gantt 分割は広範囲変更**: 既存の props・ロジック互換性を維持すること。
