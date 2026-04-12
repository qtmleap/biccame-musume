# Work Plan: イベント編集フォーム RHF 挙動修正とリファクタリング

Date: 2026-04-11

## Goal

イベント編集ページ (`/admin/events/$uuid/`) の React Hook Form の挙動バグを修正し、内部実装をリファクタする。UI/機能挙動は変えない。

## Root Causes

- **フォーカス喪失 & 値の巻き戻り**: `conditions-section.tsx:162,175` で `register` と別に `onChange → useFieldArray.update()` を毎打鍵で呼んでおり、`update()` がフィールド `id` を再生成 → Input が remount → フォーカス喪失。`parseInt('') || 1` により空欄が 1 に置換される。
- **purchaseAmount 空欄時の NaN**: `valueAsNumber: true` のみで空欄を処理していない。
- **submit 失敗後の過剰バリデーション**: `useForm` に `mode` 未指定のため、submit 失敗後は RHF デフォルトの `reValidateMode: 'onChange'` で毎打鍵バリデーションが走る。
- **handleReset が編集データを破棄**: `reset(DEFAULT_VALUES)` になっている。
- **useFieldArray.update の誤用**: `handleAdd` で `update(fields.length, ...)` を使っているが、末尾追加は `append` が正しい。

※ `useEventOrNull` は `useSuspenseQuery` で、親が `<Suspense>` gating 済みのため、defaultValues の再同期問題は実在しない。

## Tasks

### Frontend

#### (A) 挙動修正
- [x] A1. `conditions-section.tsx` の quantity Input から二重 onChange を除去し、`register` に `setValueAs: v => v === '' ? undefined : Number(v)` を付与
- [x] A2. `purchaseAmount` も同じ `setValueAs` パターンに統一
- [x] A3. `event-form.tsx` の `useForm` に `mode: 'onBlur'` を追加
- [x] A4. `handleReset()` のリセット対象を `getInitialValues(defaultValues)` に変更
- [x] A5. `conditions-section.tsx` の `handleAdd` で `update(fields.length, ...)` を `append(...)` に置換（`useFieldArray` を props から受け取る形にリファクタ）

#### (B) リファクタリング
- [x] B1. `onSubmit` 内の 40 行 payload 整形を `toEventPayload(data, { isEditMode, fallbackUuid })` として module scope に抽出
- [x] B2. `toFormValues` / `getInitialValues` の重複を `src/lib/event-form.ts` に統一
- [x] B3. numeric input パターンを `register + setValueAs` で統一

### QA
- [x] `bunx tsc -b --noEmit`
- [x] `bunx biome check src/`
- [x] commitlint 形式でコミット (`d55d230`)

## Execution Order
1. 順次: B2（共通化） → A1–A5（挙動修正） → B1（payload 抽出） → B3（最終統一）
2. 最後: QA

## Deliverables
- `src/lib/event-form.ts`（新規 or 既存を拡張）
- `src/components/admin/event-form.tsx`
- `src/components/admin/form/conditions-section.tsx`
- `src/app/routes/admin/events/$uuid/index.tsx`

## Risks / Notes
- `ConditionsSection` の props 形が変わる（`update` を `append` に置き換え）ため、呼び出し側の変更が必要
- `mode: 'onBlur'` にすると初回 submit 前のリアルタイムエラー表示が減る — 意図通り
- UI 挙動は変えない前提のため、フィールドの見た目・順序は維持
