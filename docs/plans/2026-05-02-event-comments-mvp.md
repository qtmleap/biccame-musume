# Work Plan: イベントページにユーザーコメント機能 (Phase 1 MVP)

Date: 2026-05-02

## Goal

イベント詳細ページ (`/events/$uuid`) に、匿名ユーザーが短いコメントを投稿・閲覧できる機能を追加する。Phase 1 は最小機能 + 最低限の荒らし対策のみ。

## Phase 1 スコープ

- 匿名投稿（ニックネーム 1〜20 文字 + 本文 1〜200 文字）
- フラットな一覧（新しい順、返信なし）
- **削除機能なし**（一度投稿したら本人も削除不可。管理者削除のみ Phase 2 で対応）
- 不適切コメント判定（Workers AI `@cf/meta/llama-guard-3-8b`、`unsafe` 判定で 400）
- IP レート制限（KV、5 件/分/IP）
- Cloudflare Turnstile による Bot 対策
- `deletedAt` カラムは持っておく（Phase 2 の管理者削除用）

## Phase 1 対象外

- 返信、いいね、通報、編集、管理画面 UI、通知

## Tasks

### Backend

- [ ] `prisma/schema.prisma` に `EventComment` モデル追加
  - フィールド: `id` (uuid PK), `eventId` (FK→Event cascade), `nickname`, `body`, `ipAddress`, `deletedAt?`, `createdAt`, `updatedAt`
  - index: `eventId`
- [ ] Prisma マイグレーション作成 (`bunx prisma migrate dev`)
- [ ] `src/bindings.ts` / `wrangler.toml` に `COMMENT_LIMITER` (KV)、`TURNSTILE_SECRET_KEY`、`AI` (Workers AI binding) 追加
- [ ] `src/schemas/comment.dto.ts` に Zod DTO 追加
  - `CreateCommentRequestSchema` (nickname, body, turnstileToken)
  - `CommentResponseSchema` (id, nickname, body, createdAt)
- [ ] `src/utils/turnstile.ts` 新規作成（`ENVIRONMENT === 'local'` で bypass、`vote-limit` の dev bypass パターン踏襲）
- [ ] `src/utils/moderation.ts` 新規作成
  - `env.AI.run('@cf/meta/llama-guard-3-8b', { messages: [{ role: 'user', content: body }] })` を呼ぶ
  - レスポンスの `safe` / `unsafe` を判定、`unsafe` のみ true 返却
  - 緩めポリシー: 出力に含まれる violation category のうち `S10`(Hate) と `S11`(Self-Harm) などの重カテゴリのみ NG にする方向で実装時に調整
  - ローカル env では bypass オプション
- [ ] `src/middleware/comment-rate-limit.ts` 新規作成（key: `comment_rate:{ip}:{minute-bucket}`、TTL 90s、≥5 で 429）
- [ ] `src/services/comment-service.ts` 新規作成（list / create のみ、create で `moderation` 呼ぶ）
- [ ] `src/api/comment.ts` 新規作成、2 エンドポイント
  - `GET /api/events/:uuid/comments` — 公開、論理削除除外
  - `POST /api/events/:uuid/comments` — 匿名、レート制限 + Turnstile + Llama Guard モデレーション
- [ ] テスト
  - Unit: モデレーションのレスポンスパーサ、Turnstile bypass
  - Integration: POST happy path、unsafe → 400、6 件目 → 429、GET で `deletedAt != null` を除外
  - AI 呼び出しはテスト時 mock

### Frontend

- [ ] `src/components/events/comments/CommentSection.tsx` 新規（list + form の統合コンテナ）
- [ ] `src/components/events/comments/CommentForm.tsx` 新規
  - Shadcn `Input` (nickname) / `Textarea` (body) / `Button` / `Form`
  - Turnstile widget (`@marsidev/react-turnstile`)
  - 本文 500 → **200 文字**でカウンタ表示（DTO に合わせる）
- [ ] `src/components/events/comments/CommentList.tsx` 新規
  - Loading: `Skeleton` × 3
  - Empty: 「まだコメントはありません」（muted トーン）
  - Error: `Alert` (destructive) + リトライ
- [ ] `src/components/events/comments/CommentItem.tsx` 新規
  - ニックネーム + 本文 + 投稿日時のみ表示（削除ボタンなし）
- [ ] `src/app/routes/events/$uuid/index.tsx` 末尾に `<CommentSection uuid={uuid} />` をマウント
- [ ] TanStack Query
  - key: `['events', uuid, 'comments']`
  - mutation 成功で `invalidateQueries` し、フォームをリセット
  - フォームに「投稿後は削除できません。送信前に内容を確認してください」の注意書き
- [ ] エラーハンドリング
  - 400 → `FormMessage` 「不適切な内容と判定されました」（具体的理由は出さない）
  - 429 → `Alert` 「送信が多すぎます。しばらくしてからお試しください」
- [ ] アクセシビリティ: ラベル明示、`role="alert"`、ボタン `aria-label`
- [ ] 楽観的更新は **やらない**（Phase 1 はシンプル優先）

### QA

- [ ] `bunx tsc -b --noEmit`
- [ ] `bunx biome check src/`
- [ ] commitlint 形式でコミット（バックエンド/フロントエンドで分けるか相談）

## Execution Order

1. **Sequential**: Prisma スキーマ追加 → マイグレーション → bindings/wrangler.toml 更新 → DTO 定義
2. **Parallel** (DTO 完了後):
   - Backend: turnstile util / rate-limit middleware / NG ワード util / service layer
   - Frontend: `CommentSection` のシェル、ルートへのマウント
3. **Sequential**: Hono ルート配線 → backend テスト
4. **Parallel** (DTO 完成後はずっと): Frontend のフォーム・リスト・アイテム実装
5. **Sequential**: QA → コミット

## Deliverables

### Backend
- `prisma/schema.prisma` (修正)
- `prisma/migrations/<timestamp>_add_event_comment/migration.sql` (新規)
- `src/bindings.ts` (修正)
- `wrangler.toml` (修正、KV namespace 追加)
- `src/schemas/comment.dto.ts` (新規)
- `src/utils/turnstile.ts` (新規)
- `src/utils/ng-words.ts` (新規)
- `src/middleware/comment-rate-limit.ts` (新規)
- `src/services/comment-service.ts` (新規)
- `src/api/comment.ts` (新規) + ルートマウント

### Frontend
- `src/components/events/comments/CommentSection.tsx` (新規)
- `src/components/events/comments/CommentForm.tsx` (新規)
- `src/components/events/comments/CommentList.tsx` (新規)
- `src/components/events/comments/CommentItem.tsx` (新規)
- `src/app/routes/events/$uuid/index.tsx` (修正、マウント)

## Risks / Notes

- **削除不可の UX**: 投稿前確認を強めに表示する（注意書き + 確認ダイアログを入れるか実装時に再判断）
- **AI レイテンシ**: Llama Guard 3 8B で +500ms〜1s 程度。フォームの送信ボタン disable + ローディング必須
- **AI コスト**: Workers AI Neurons 課金。スパムで連投されると効くので、レート制限 (5/分/IP) を AI 呼び出し**前**に通すこと（順序: rate-limit → Turnstile → moderation）
- **AI 誤検知**: 健全コメントが弾かれた場合、ユーザーは理由が分からない。Phase 2 で「誤判定なら通報」フォームを検討
- **AI 出力フォーマット**: Llama Guard の出力（`safe` または `unsafe\nS1,S5` 等）パーサが脆いので、安全側に倒す（パース失敗時は通す or 弾くを実装時に判断、デフォは通す＝可用性優先）
- **日本語精度**: Llama Guard 3 は多言語対応だが日本語精度は英語ほど高くない可能性。リリース後しばらくはログ監視
- **Turnstile キー**: `TURNSTILE_SITE_KEY` (frontend, Vite env) と `TURNSTILE_SECRET_KEY` (backend, Workers secret) の 2 つが必要。本番キーの登録手順をユーザーに別途案内
- **IP 取得**: Cloudflare Workers では `request.headers.get('cf-connecting-ip')`、ローカル `wrangler dev` では `127.0.0.1` 固定になる点に注意
- **管理画面削除**は Phase 2。`deletedAt` カラムだけ用意しておけば後付け可
- **E2E**: 既存の web 用 Turnstile bypass を活用（`/control_panel` は対象外）
