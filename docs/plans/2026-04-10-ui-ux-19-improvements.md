# Work Plan: UI/UX 19 項目一括改善

Date: 2026-04-10

## Goal

先行調査で洗い出した 20 項目のうち、多言語対応（#20）を除く 19 項目の UI/UX 改善を実施する。

## Tasks

### Backend

- [ ] **#5a** `GET /api/search?q=...` エンドポイント追加（イベント全文検索）
  - `src/schemas/search.dto.ts`（新規）— `SearchQuerySchema`, `SearchResultSchema`
  - `src/services/event-service.ts` — `searchEvents(env, q)` 追加（Prisma `contains`）
  - `src/api/search.ts`（新規）, `src/index.ts` に登録
  - `src/utils/client.ts` に Zodios エントリ追加

### Frontend — 高優先度

- [ ] ~~**#1** `/route/` をヘッダーナビに追加~~ — **除外**: `/route/` は開発中のため非公開継続
- [ ] **#2** ブレッドクラム実装 — `src/components/common/breadcrumb.tsx`（新規, Shadcn Breadcrumb）、`characters/$id`, `events/$uuid` 詳細ページへ挿入
- [ ] **#3** 店舗 → 関連イベントリンク — `src/components/events/event-detail-info.tsx:70-73` に `/events?store=<storeKey>` リンク追加（必要に応じ `events/index.tsx` に store フィルタ atom 追加）
- [ ] **#4** `/me/interested` ↔ `/me/completed` 相互リンク追加
- [ ] **#5b** グローバル検索 UI — ヘッダーに `CommandDialog`（cmdk/Shadcn）、イベントは `/api/search` 経由、キャラ・店舗は `characters.json` 上でクライアント側フィルタ
- [ ] **#6** キャラクター一覧に名前検索入力 — `src/app/routes/characters/index.tsx:36-50`（クライアント側フィルタ）
- [ ] **#7** イベントフィルタリセットボタン — `src/app/routes/events/index.tsx:148-175`
- [ ] **#8** 削除・ログアウトに確認ダイアログ — `admin/event-list.tsx`, `me/index.tsx:76-82`（Shadcn `AlertDialog`）

### Frontend — 中優先度

- [ ] **#9** 無効ボタンに ARIA 属性 — `src/components/events/event-detail-header.tsx:134-174`
- [ ] **#10** Google Maps `gestureHandling='cooperative'` on mobile + `tabIndex`/`aria-label` — `src/app/routes/location/index.tsx:80`
- [ ] **#11** ダークモード修正 — `footer.tsx:9` を semantic tokens に、`ranking-list.tsx:19` の `#0068B7` をダーク対応
- [ ] **#12** ガントチャート touch ハンドラ追加 + スクロールヒント — `src/components/events/event-gantt-chart.tsx`
- [ ] **#13** ホームイベント一覧の空状態 — `src/components/home/event-list.tsx:85-86`（null → Empty state）
- [ ] **#14** Skeleton ローディング — `src/components/common/loading-fallback.tsx` を Shadcn `Skeleton` に置換
- [ ] **#15** ページネーション件数表示 — `src/components/events/paginated-event-grid.tsx:60-120`（「1-12 / 45件」）

### Frontend — 低優先度

- [ ] ~~**#16** 404 ページに `/route/` 追加~~ — **除外**: `/route/` は開発中のため非公開継続
- [ ] **#17** フッターにサイトマップ + プライバシーポリシーリンク — `src/components/common/footer.tsx`
- [ ] **#18** Web Share API フォールバック強化 — `src/components/events/event-detail-header.tsx:184-190`（Popover で X 共有 + コピー）

### QA（最後）

- [ ] `bunx tsc -b --noEmit`
- [ ] `bunx biome check src/`
- [ ] commitlint 形式でコミット

## Execution Order

1. **Sequential**: Backend が `#5a`（search API + Zodios schema）を先に完了
2. **Parallel**: Frontend で #1, #2, #4, #6, #7, #8, #9, #10, #11, #13, #14, #15, #16, #17, #18 を実施
3. **Sequential (after #5a)**: Frontend で #5b（グローバル検索 UI）
4. **Parallel**: #3（store フィルタ atom との兼ね合いあり）, #12（ガントチャート）
5. **Final**: QA エージェントで型チェック・lint・コミット

## Deliverables

- `src/api/search.ts`, `src/schemas/search.dto.ts`: 新規検索エンドポイント
- `src/components/common/breadcrumb.tsx`: 共通ブレッドクラム
- `src/components/common/global-search.tsx`: グローバル検索ダイアログ
- `src/components/common/loading-fallback.tsx`: Skeleton 版へ全面改修
- 既存ファイル多数: 上記タスクリスト参照

## Risks / Notes

- **#19 仮想スクロール — スコープから除外**: Frontend からのプッシュバックを採用。実測された問題がないため、投機的な最適化は避ける。必要に応じ別途計測後に再検討。
- **#17 フッターリンク先 URL 未確定**: プライバシーポリシー・サイトマップのターゲット URL が未確認。存在しなければ暫定でプレースホルダ route を作成するか、ユーザーに確認する必要あり。
- **#5 検索範囲**: イベントはサーバ側全文検索（タイトル `contains`）、キャラ・店舗は既にクライアントにロード済みのため in-memory フィルタで統一。
- **#3 store クエリパラメータ**: `events/index.tsx` に store フィルタ atom が既存でなければ追加する。Frontend エージェントに現状確認を委ねる。
- **#12 ガントチャートの touch サポート**: 既存のマウスハンドラを touch イベントにミラーリング。既存ドラッグロジックの回帰リスクあり、慎重にレビューが必要。
- **ブランチ**: 現在 `feature/design`。このブランチ上で作業続行。
- **作業量**: 18 タスク + QA の大規模 PR 1 本。コミットはタスクごとに分割する想定。
