# Work Plan: お気に入り娘 + 一括投票

Date: 2026-05-05
Branch: `feat/favorite-bulk-vote`

## Goal

ビッカメ娘に対して以下を提供する:

1. **お気に入り登録** — ログインユーザーが個別キャラを推しとして登録/解除
2. **お気に入り娘に一括投票** — 自分の推しリストに 1 タップで全員投票
3. **全員に一括投票** — ビッカメ娘全員に 1 タップで投票

既存の「1日1回/IP/キャラ」制限はそのまま維持。一括投票は投票済みキャラを skip して残りだけ通す。

## Tasks

### Backend

- [ ] `prisma/schema.prisma` に `FavoriteCharacter` モデル追加（`uid` + `characterId` ユニーク）
- [ ] Prisma マイグレーション生成（`prisma migrate diff` → `migrate dev`）
- [ ] `src/schemas/favorite.dto.ts` 新規（FavoriteListSchema 等）
- [ ] `src/schemas/vote.dto.ts` に `BulkVoteRequestSchema` / `BulkVoteResponseSchema` 追加（per-character の voted/skipped 結果）
- [ ] `src/services/favorite-service.ts` 新規（add / remove / list、characterId はビッカメ娘マスタで検証）
- [ ] `src/services/vote-service.ts` に `bulkVote(env, characterIds, ip)` 追加（KV 制限を per-character で評価して skip）
- [ ] `src/middleware/vote-limit.ts` の KV 判定を `isVoteLimited(kv, ip, characterId)` ヘルパに切り出し
- [ ] `src/api/favorite.ts` 新規（`GET/POST/DELETE /api/me/favorites/:characterId`、`verifyToken` 必須）
- [ ] `src/api/vote.ts` に `POST /api/votes/bulk`（characterIds[] 受領、bulkVote を呼ぶ）追加。**未ログインでも実行可**（IP+character の KV 制限のみで弾く）
- [ ] `src/index.ts` でルート配線

### Frontend

- [ ] `src/utils/client.ts` に新エンドポイントを追加
- [ ] `src/hooks/use-favorites.ts` 新規（useSuspenseQuery + add/remove mutation）
- [ ] `src/hooks/use-bulk-vote.ts` 新規（成功時に返却された characterIds 全件で `lastVoteTimesAtom` を更新）
- [ ] `src/atoms/vote-atom.ts` の更新ヘルパを配列対応化
- [ ] `src/components/characters/character-favorite-button.tsx` 新規（Shadcn Button + lucide `Heart` アイコン、ON は塗り＋ブランド色、OFF はアウトライン。未ログイン時は disabled + tooltip）
- [ ] `src/components/characters/bulk-vote-button.tsx` 新規（characterIds prop、全件投票済み時は disabled）
- [ ] `src/components/characters/character-list.tsx` の各カードに favorite ボタン配置
- [ ] `src/app/routes/me/favorites/index.tsx` 新規（推し一覧 + 「推し全員に投票」ボタン）
- [ ] **`src/components/ranking/ranking-list.tsx` の改修**:
  - 「各ビッカメ娘を1日に1回応援できます」テキスト削除
  - `RibbonBadge`（bg-brand 真っ赤）→ ハート + 数字のピル型バッジに置き換え（muted 系トーン、`bg-vote-count` テーマ変数を新設）
  - ranking ページ上部に「ビッカメ娘全員に投票」ボタン配置（**未ログインでも実行可**）
- [ ] `src/themes/light.css` / `dark.css` に `--vote-count` / `--vote-count-foreground` 追加

### QA

- [ ] `bunx tsc -b --noEmit`
- [ ] `bunx biome check src/`
- [ ] commitlint 形式でコミット

## Execution Order

1. **直列**: Prisma スキーマ + マイグレーション、DTO 定義（型を先に固める）
2. **並列**: Backend 実装（service + route）と Frontend 実装（hook + component）
3. **直列**: フロント・バック疎通確認、QA

## Deliverables

- 新ファイル: `src/schemas/favorite.dto.ts`, `src/services/favorite-service.ts`, `src/api/favorite.ts`, `src/hooks/use-favorites.ts`, `src/hooks/use-bulk-vote.ts`, `src/components/characters/character-favorite-button.tsx`, `src/components/characters/bulk-vote-button.tsx`, `src/app/routes/me/favorites/index.tsx`
- 既存変更: `prisma/schema.prisma`, `src/schemas/vote.dto.ts`, `src/services/vote-service.ts`, `src/middleware/vote-limit.ts`, `src/api/vote.ts`, `src/index.ts`, `src/utils/client.ts`, `src/atoms/vote-atom.ts`, `src/components/characters/character-list.tsx`, `src/app/routes/characters/index.tsx`

## Risks / Notes

- ビッカメ娘マスタの参照元（`src/data/` or assets fetch）を最初に確認する
- 一括投票の同時実行は KV upsert のレースに注意（per-character で順次でも問題ない量）
- お気に入りボタンは未ログイン時に「ログインしてね」の disabled 表示にして導線維持
