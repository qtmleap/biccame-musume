# Work Plan: ページ機能・UI/UX 改善

Date: 2026-04-10

## Goal

`src/app/routes/` 配下の全ページを対象に、機能追加・UI/UX 改善・バグ修正・一貫性向上を実施する。調査で洗い出した高・中・低優先度の項目を一括対応する（admin 認証ガードは Cloudflare Access で対応済みのため除外）。

## Tasks

### Frontend

#### 高優先度
- [x] `/` からデバッグボタン（`BirthdayDisplaySwitcher`, `ClearCacheButton`）を除去または dev 限定表示
- [x] `/events` の `useEffect` 依存配列バグを修正（フィルター変更時に `page` を 1 にリセット）
- [x] `/events` の「管理」リンクを非ログインユーザーから非表示化
- [x] `/characters/$id.tsx` を `$id/index.tsx` ディレクトリ形式にリネーム

#### 中優先度
- [x] `/me/completed`, `/me/interested` に `beforeLoad` 認証ガード追加（`/me/index.tsx` と同じパターン）
- [x] `/calendar` モバイル版の `CalendarEventList` に `handleDayClick` を接続
- [x] `/calendar` の `CalendarMonthDots` / `CalendarMonthTabs` にレスポンシブ表示クラス追加
- [x] `/events/$uuid` モバイルでの関連イベント表示（`RecentEventsList` の mobile レイアウト追加）
- [x] `/location` に `Suspense` + `LoadingFallback` を追加
- [x] `/ranking` に `<h1>` 見出しを追加
- [x] `/ranking` のカードから `/characters/$id` への `<Link>` を追加
- [x] `/` の `HomeContent` に `ErrorBoundary` を追加

#### 低優先度
- [x] `/about`, `/contact`, `/events/$uuid` の独自背景色を削除して共通スタイルに統一
- [x] `/route` のインライン `読み込み中...` を共通 `LoadingFallback` に置換
- [x] `/contact` の FAQ を Shadcn `Accordion` コンポーネントでリファクタ
- [x] `/location` の `mapKey` リマウント問題を解消（選択変更で GoogleMap を再マウントしない）

### QA
- [x] `bunx tsc -b --noEmit` で型チェック
- [x] `bunx biome check src/` で lint/format
- [x] 各論理グループごとに commitlint 形式でコミット

## Execution Order

1. **並列バッチ 1（独立した小修正）**
   - `/` デバッグボタン除去
   - `/events` useEffect 修正
   - `/events` 管理リンク制御
   - `/about`, `/contact`, `/events/$uuid` 背景色統一
   - `/route` LoadingFallback 統一
   - `/ranking` h1 追加 + Link 追加
   - `/location` Suspense 追加
   - `/me/completed`, `/me/interested` auth guard

2. **並列バッチ 2（中規模リファクタ）**
   - `/characters/$id.tsx` → `$id/index.tsx` リネーム
   - `/calendar` モバイル Drawer 接続 + レスポンシブ表示
   - `/events/$uuid` モバイル関連イベント表示
   - `/contact` FAQ Accordion 化
   - `/` ErrorBoundary 追加
   - `/location` mapKey 問題解消

3. **QA（最終）**
   - 型チェック・lint・コミット

## Deliverables

- `src/app/routes/**` 全般の修正
- `src/app/components/**` 関連コンポーネントの修正
- コミット（機能グループごとに分割、commitlint 形式）

## Risks / Notes

- `/characters/$id.tsx` のリネームは TanStack Router の型生成（`routeTree.gen.ts`）に影響する可能性がある — リネーム後に再生成が必要
- `/location` の `mapKey` 削除は GoogleMap コンポーネントのステート管理次第で追加修正が必要な可能性あり
- `/calendar` の `CalendarMonthDots` / `CalendarMonthTabs` の本来の想定ブレークポイントが不明 — 実装者判断（モバイル: Dots / デスクトップ: Tabs の想定で進める）
- admin 認証ガードは Cloudflare Access で対応済みのため本プランから除外
