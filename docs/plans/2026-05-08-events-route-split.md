# Work Plan: イベント作成・編集ルート分離

Date: 2026-05-08

## Goal

`/admin/events/$uuid` が新規作成・コピー・編集を兼ねている現状を解消し、専用ルートに分離する。コピー直後・新規作成直後にまれに発生する 404 を構造的に防ぐ。

## Background

現状 (`src/app/routes/admin/events/$uuid/index.tsx:13-27`) は、URL の UUID を `useEventOrNull` で fetch し、結果が `null` なら create / copy モード、値があれば edit モードと判定している。新規・コピー時もクライアント採番 UUID で API を叩いており、レース条件で 404 が発生することがある。

## Tasks

### Frontend
- [x] 新ルート `src/app/routes/admin/events/new/index.tsx` を作成
  - `crypto.randomUUID()` で UUID を1回だけ生成し props で `EventForm` に渡す（自分自身の event は fetch しない）
  - `?from=<uuid>` がある場合のみ元イベントを fetch、`toCopyFormValues` で初期値生成
  - クエリパラメータからの初期値は `toFormValuesFromQuery`
  - 作成成功後は `/admin/events/$uuid/edit` に navigate
- [x] 新ルート `src/app/routes/admin/events/$uuid/edit/index.tsx` を作成
  - URL param の UUID で event を fetch、無ければ `notFound()`
  - 既存の編集モード処理を移植
- [x] 旧 `src/app/routes/admin/events/$uuid/index.tsx` を `/admin/events/$uuid/edit` にリダイレクト（後方互換）
- [x] コピーボタン `src/components/admin/event-list.tsx:129-139` のリンクを `/admin/events/new?from=<sourceUuid>` に変更（UUID 事前生成不要に）
- [x] 編集ボタン `src/components/events/event-detail-header.tsx:400` 等の遷移先を `/admin/events/$uuid/edit` に変更
- [x] 管理画面の「新規作成」ボタンの遷移先を `/admin/events/new` に変更
- [x] `EventForm` コンポーネント側はモードを props で受ける形に整理（既存ロジックの再利用、JSX の重複なし）

### Backend / Hooks
- [x] `src/hooks/use-events.ts` の `useCreateEvent` の onSuccess で `queryClient.setQueryData(['events', uuid], created)` を実行（個別キャッシュ事前投入）
- [x] 同 `useUpdateEvent` の onSuccess でも `setQueryData(['events', uuid], updated)` を実行

### QA
- [x] `bun run typecheck` 相当（`bunx tsc -b --noEmit`）
- [x] `bunx biome check src/`
- [x] `commitlint` 形式でコミット

## Execution Order

1. Sequential: ルート追加（new, edit）→ EventForm props 整理
2. Parallel: ナビゲーション差し替え（list / detail-header / 管理画面ボタン）と hooks のキャッシュ投入
3. Sequential: 旧ルートのリダイレクト整理 → QA

## Deliverables

- `src/app/routes/admin/events/new/index.tsx`（新規）
- `src/app/routes/admin/events/$uuid/edit/index.tsx`（新規）
- `src/app/routes/admin/events/$uuid/index.tsx`（リダイレクト化 or 削除）
- `src/components/admin/event-form.tsx`（mode props 整理）
- `src/components/admin/event-list.tsx`（コピーリンク修正）
- `src/components/events/event-detail-header.tsx`（編集リンク修正）
- `src/hooks/use-events.ts`（個別キャッシュ setQueryData 追加）

## Risks / Notes

- 旧 URL `/admin/events/$uuid` のブックマークがあれば 410 ではなくリダイレクトで救う。
- `useEventOrNull` を呼ばなくなる箇所が増えるので、不要になったエクスポートは整理対象。
- コピー時 `from` の対象 event が存在しない場合は `/admin/events/new` に fallback するか 404 にするかは TBD（暫定: `from` を無視して空フォーム）。
