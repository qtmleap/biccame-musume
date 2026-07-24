# 公開 API 他ユーザー情報リーク修正計画書 (2026-07-24)

一般ユーザー向け公開 API から他のユーザーの個人情報 (Firebase uid / displayName / thumbnailURL / email 等) が漏れている箇所を修正する。同日に別 PR (#129 `fix/badges-hide-holders`) で `/api/badges/:code/holders` を修正済み。ここではその他の残件を対象とする。

## 前提と参照

- 監査は Fable (claude-fable-5) で `/home/vscode/app/src/api/` 配下の非管理者エンドポイント (admin/, admin-\*.ts 以外) を全件レビューして実施。
- スコープ: 対象ファイルは `auth.ts` / `badge.ts` / `comment.ts` / `direction.ts` / `event-group.ts` / `event.ts` / `favorite.ts` / `me.ts` / `og.ts` / `search.ts` / `stats.ts` / `user.ts` / `version.ts` / `vote.ts`。
- 判定基準: 未認証または一般ユーザーの JWT で叩けるエンドポイントが、他ユーザーを識別可能な情報 (uid / displayName / thumbnailURL / email など) を返す場合をリークとみなす。UI 上明示的に公開されるゲーム的機能 (ゲームランキング等) は「意図的公開」として区別するが、UI で使われていなければ削除・非公開化を優先する。
- ブランチ運用は `CLAUDE.md` の規約に従う (`develop` 直接コミット禁止、feature ブランチを切って `develop` 向けに PR)。
- コミットは commitlint に従う。type は `fix` / `refactor` / `docs` を用途別に選ぶ。
- 既に修正済み: `#129 fix(badges): 獲得者一覧を管理者専用APIに分離し公開APIは獲得人数のみ返す` (`/api/badges/:code/holders` を `{ total }` のみに変更、管理者用に `/api/admin/badges/:code/holders` を新設)。

## 対象一覧

| ID | 深刻度 | エンドポイント | リーク内容 |
|----|-------|--------------|-----------|
| L1 | 🔴 High | `GET /api/events/:uuid/comments`, `GET /api/events/:id` | コメント投稿者の生 Firebase uid |
| L2 | 🔴 High | `GET /api/badges/leaderboard` | 上位 50 人の uid + displayName + thumbnailURL (UI 未使用) |
| L3 | 🟡 Medium | `GET /api/badges/leaderboard?uid=<X>` | 認証なしで任意ユーザーの獲得数・順位が引ける照会オラクル |
| L4 | 🟡 Medium | `GET /api/users`（`user.ts:27`） | `middlewares` タイポで `verifyToken` が実質無効。今は fail-closed で漏れていないが時限爆弾 |
| L5 | 🟢 Low | `src/utils/token.ts:95` `console.info` | Firebase JWT payload (email 含む) を毎リクエストログ出力 |

## フェーズ 1: 高深刻度（最優先）

### T1-1. コメント投稿者 uid の除去 [L1]

**目的**: `/api/events/:uuid/comments` および `/api/events/:id` のレスポンスから他ユーザーの生 Firebase uid を削除する。

**背景**:
- `comment.dto.ts:29-34` `CommentResponse` が `userId: string` を持ち、`comment-service.ts` の `listComments` および `event-service.ts` の `toCommentResponse` がそのまま生 uid を返す。
- フロント (`src/components/events/comments/comment-item.tsx:50`) は `comment.userId && ...` の truthy 判定で「ログイン投稿バッジ」を出すためだけに使っており、uid の値自体は参照していない。
- したがって値を渡す必要はなく `boolean` に置換できる。破壊的変更にはならない。

**手順**:
1. `src/schemas/comment.dto.ts` の `CommentResponseSchema` から `userId: z.string()` を除去し、代わりに `verified: z.boolean()` (または `isLoggedIn: z.boolean()`) を追加。命名は既存の他 DTO と揃える。
2. `src/services/comment-service.ts` の `toResponse` / `listComments` で `userId: row.userId` を `verified: row.userId !== null` に置換。
3. `src/services/event-service.ts` の `EVENT_DETAIL_SELECT` からコメントの `userId` 選択を外す (または内部で使うだけにして外に出さない)。`toCommentResponse` も同様に変換。
4. フロント `src/components/events/comments/comment-item.tsx:50` の `comment.userId && ...` を `comment.verified && ...` に差し替え。
5. Zodios クライアント (`src/utils/client/*`) のレスポンス型が自動で追随することを type-check で確認。

**検証**:
- `bun run type-check` / `bun run biome:check` パス。
- `/events/:id` を Network タブで開き、`comments[].userId` フィールドが返却されないことを確認。
- コメントログイン投稿の「ログイン済み」表示バッジが従来通り出ることを確認。

**PR**: `fix/comment-user-id-leak`

### T1-2. バッジリーダーボードの他人情報露出停止 [L2]

**目的**: `/api/badges/leaderboard` から他ユーザーを識別可能なフィールドを除去する。

**背景**:
- `badge.ts:68-169` が未認証で叩ける状態で上位 50 人の `uid` + `displayName` + `thumbnailURL` を返す (`badge.dto.ts:112-120` `LeaderboardEntrySchema`)。
- Zodios クライアント (`src/utils/client/badges.ts:27` `getBadgeLeaderboard`) は登録されているが、対応する hook (`use-badge-leaderboard` 等) およびコンポーネントは存在せず UI 未使用。
- 管理用途には別途 `/api/admin/badges/leaderboard` (`admin-badge.ts`) が存在するため、公開版を残す必然性はない。

**手順 (方針 A: 削除、推奨)**:
1. `src/api/badge.ts` から `GET /badges/leaderboard` ハンドラーを削除。
2. `src/schemas/badge.dto.ts` から `LeaderboardEntrySchema` / `BadgeLeaderboardResponseSchema` / `GetBadgeLeaderboardQuerySchema` を削除。
3. `src/utils/client/badges.ts` から `getBadgeLeaderboard` エンドポイント定義を削除。
4. `src/api/index.ts` (or 該当箇所) の import が残っていれば整理。

**手順 (方針 B: 残す場合)**:
- `LeaderboardEntrySchema` から `uid` を除去し、`displayName` / `thumbnailURL` のみを返す。
- `me` セクションはセッションの JWT から `uid` を導出する形に変え、クエリ `?uid=` を廃止 (T1-3 と統合)。

**推奨**: 方針 A。UI で未使用のため機能欠損なし。

**検証**:
- `bun run type-check` パス。
- 該当ルートが 404 を返すこと (`curl https://.../api/badges/leaderboard`)。

**PR**: `fix/badges-leaderboard-remove` (T1-2 と T1-3 は同一 PR で処理可能)

## フェーズ 2: 中深刻度

### T2-1. leaderboard `?uid=` オラクルの塞ぎ [L3]

**目的**: 認証なしで任意 uid の順位を引けるオラクル状態を解消する。

**背景**: `GET /api/badges/leaderboard?uid=<X>` は `me` セクションに X のバッジ獲得数と順位を返す (`badge.ts:89, 123-164`)。`Cache-Control: public` (`badge.ts:166`) 付きのため CDN キャッシュにも乗る。

**手順**:
- T1-2 で方針 A (エンドポイント削除) を採用すれば同時解消。個別対応不要。
- 方針 B を採用する場合、`verifyTokenOptional` ミドルウェアを追加し、`me` は `jwtPayload.uid` から取得。クエリ `uid` は削除。`Cache-Control` は `me` を含むレスポンスでは `no-store` に変更。

**PR**: T1-2 と統合。

### T2-2. `user.ts:27` の `middlewares` タイポ修正 [L4]

**目的**: `@hono/zod-openapi` の正しいプロパティ名は `middleware` (単数)。`middlewares` (複数) と書かれているため `verifyToken` が実質無効化されている。現状はハンドラー側で `getFirebaseToken` が null を返し 401 になる (fail-closed) が、将来グローバルに `jwtPayload` がセットされる変更を入れた瞬間に前提が崩れる。

**手順**:
1. `src/api/user.ts:27` の `middlewares: [verifyToken]` を `middleware: [verifyToken]` に修正。
2. 他ファイルにも同じタイポが無いか grep で確認: `grep -rn "middlewares:" src/api/`。
3. 手動で `/api/users` (相当のエンドポイント) を叩き、Authorization ヘッダー無しで 401 が返ることを再確認。

**検証**:
- `bun run type-check` / `bun run biome:check` パス。
- 認証必須の挙動が変わらないこと。

**PR**: `fix/user-api-middleware-typo`

## フェーズ 3: 低深刻度

### T3-1. Firebase JWT payload のログ出力削除 [L5]

**目的**: `src/utils/token.ts:95` の `console.info('VerifyToken:', payload)` は Firebase JWT payload (`email` 等) を丸ごと出力しているため、Cloudflare Workers のログ収集設定によっては PII が長期保管される可能性がある。

**手順**:
1. `console.info` を削除するか、`uid` のみに絞る (`console.info('VerifyToken uid:', payload.uid)`)。
2. デバッグ用途で残す必要があれば `DEBUG` フラグ経由に変更。

**検証**:
- ローカルで `wrangler dev` を起動し、認証リクエストを送っても payload が出力されないことを確認。

**PR**: `chore/remove-jwt-payload-log`

## PR 分割方針

以下の 3 本 (最短 2 本) で分ける。

| PR | 対応 ID | ブランチ |
|----|---------|---------|
| 1 | L1 | `fix/comment-user-id-leak` |
| 2 | L2 + L3 | `fix/badges-leaderboard-remove` |
| 3 | L4 + L5 | `fix/user-api-middleware-typo` (L5 も同梱可) |

## 検証共通

各 PR で以下を実施する。

1. `bun run type-check` パス。
2. `bun run biome:check` パス。
3. 影響箇所の Network タブ手動確認 (レスポンスに他ユーザーの識別可能情報が含まれないこと)。
4. E2E は既存テストがある範囲で回す。
5. `develop` へ merge 後、staging で同上を再確認。

## 参照

- 監査元: Fable による `/home/vscode/app/src/api/` 全公開エンドポイントレビュー (2026-07-24 セッション)。
- 既対応: PR #129 `fix(badges): 獲得者一覧を管理者専用APIに分離し公開APIは獲得人数のみ返す`。
