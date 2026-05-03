# Work Plan: 管理者コメント削除機能 + 管理者投稿の ID 記録

Date: 2026-05-03T07:06:13+09:00

## Goal

Cloudflare Access 認証済みの管理者がイベントコメントを `AlertDialog` 確認付きで削除できるようにする。
あわせて、コメント投稿時に管理者ログイン中であれば、そのログインメール (ID) をコメントレコードに保存し、UI で管理者バッジを表示できるようにする。

## Tasks

### Backend

- [ ] `prisma/schema.prisma` に `EventComment.adminEmail String? @map("admin_email")` を追加
- [ ] `bunx prisma migrate diff --from-schema-datamodel ... --to-schema-datasource ...` で SQL 生成 → `bunx prisma migrate dev --name add_admin_email_to_event_comment` で適用
- [ ] `src/middleware/cloudflare-access.ts` に `CFAuthOptional` を追加
  - JWT があれば検証して `c.set('adminEmail', payload.email)`、無ければ素通し
  - 既存 `CFAuth` (strict / 401) はそのまま `DELETE` で使用
  - `ENVIRONMENT === 'local'` 時は両方とも `'dev@localhost'` を `adminEmail` にセット
- [ ] `src/types/bindings.ts` の `Variables` に `adminEmail?: string` を追加
- [ ] `src/schemas/comment.dto.ts`: `CommentResponseSchema` に `adminEmail: z.string().email().nullable().optional()` を追加
- [ ] `src/services/comment-service.ts`:
  - `createComment` の `data` に `adminEmail?: string`、書き込み + `toResponse` 出力に追加
  - `deleteComment(prisma, commentId)` を追加 (`update where id, set deletedAt = now()`)
  - `toResponse` で `adminEmail` も返却
- [ ] `src/api/comment.ts`:
  - `POST /:uuid/comments` ルートに `CFAuthOptional` を挟み、`c.get('adminEmail')` を `createComment` に渡す
  - `DELETE /:uuid/comments/:commentId` を追加 (`CFAuth` で保護、論理削除、204 もしくは `{ id }` 返却)

### Frontend

- [ ] `src/utils/client.ts` に `deleteEventComment` (`DELETE /api/events/:uuid/comments/:commentId`) を追加 (`SuccessResponseSchemaForClient`)
- [ ] `src/hooks/use-delete-comment.ts` を新規作成: `useMutation` + `queryClient.invalidateQueries({ queryKey: ['events', eventUuid, 'comments'] })`、sonner で成功/失敗 toast
- [ ] `src/components/events/comments/comment-list.tsx`: `CommentItem` に `eventUuid` を渡す
- [ ] `src/components/events/comments/comment-item.tsx`:
  - 既存の Trash ボタンを `AlertDialogTrigger` でラップ、`AlertDialogContent` で「このコメントを削除しますか？」確認
  - `disabled` 撤去、`isPending` で抑止、削除実行
  - `comment.adminEmail` が存在するとき、表示名横に「管理者」バッジ (純白/純黒不可、トーン色)

### QA

- [ ] `bunx tsc -b --noEmit`
- [ ] `bunx biome check src/` (必要なら `--write`)
- [ ] commitlint 形式で commit (例: `feat(comments): admin delete with alert dialog and admin id stamp`)

## Execution Order

1. Sequential: Backend (DTO 確定 → migration → service → route)
2. Parallel after DTO 確定: Frontend (client / hook / UI) も並行可
3. Sequential 最後: QA

## Deliverables

- `prisma/schema.prisma`: `EventComment.adminEmail` 追加
- `prisma/migrations/<timestamp>_add_admin_email_to_event_comment/migration.sql`: 自動生成
- `src/middleware/cloudflare-access.ts`: `CFAuthOptional` 追加
- `src/types/bindings.ts`: `Variables.adminEmail`
- `src/schemas/comment.dto.ts`: `adminEmail` 追加
- `src/services/comment-service.ts`: `adminEmail` 対応 + `deleteComment`
- `src/api/comment.ts`: optional auth on POST + DELETE 追加
- `src/utils/client.ts`: `deleteEventComment`
- `src/hooks/use-delete-comment.ts`: 新規
- `src/components/events/comments/comment-list.tsx`: prop drilling
- `src/components/events/comments/comment-item.tsx`: AlertDialog + 削除実行 + 管理者バッジ

## Risks / Notes

- DELETE は論理削除 (`deletedAt`) で統一済み。物理削除は行わない。
- `CFAuthOptional` は JWT 検証失敗時に静かに素通す設計 (POST が 401 で詰まらないように)。
- Admin badge は管理者投稿のみ表示。既存コメントは `adminEmail = null` なので影響なし。
- `comment-item.tsx` 内の `useCloudflareAccess` は引き続き UI ガードに使用 (削除ボタン表示)。サーバ側は JWT で再検証。
- E2E は `/control_panel` 対象外ルールに従い対象外。
