# Work Plan: マイページの「気になるイベント」「達成済みイベント」が表示されないバグ修正

Date: 2026-07-24

## Goal

マイページで、`UserEvent` に `interested` / `completed` として登録されているのに、対応するイベントカードが表示されないケースを解消する。ユーザー体感は「データはちゃんと取れてるみたいなのに、表示されない時がある」。

## 症状

- `useUserActivity()` から返される `interestedEvents` / `completedEvents`（eventId の配列）にはイベントが入っている
- でもマイページ (`src/app/routes/me/index.tsx`) およびサブページ (`me/interested`, `me/completed`) のイベントカードに表示されない
- 一部だけ表示されない（全滅ではない）

## 原因

`src/services/event-service.ts:205-226` の `getEvents`:

```ts
export const getEvents = async (env: Bindings): Promise<Event[]> => {
  const prisma = getPrisma(env)
  // 半年前の日付を計算
  const startDate = dayjs().subtract(6, 'month').toDate()

  const events = (
    await prisma.event.findMany({
      where: {
        isVerified: true,
        // 半年以内に開催されたイベントのみ取得
        startDate: { gte: startDate }
      },
      select: EVENT_LIST_SELECT,
      orderBy: { startDate: 'desc' }
    })
  ).map((v) => transform(v))
  ...
}
```

`startDate < 半年前` のイベントはこのレスポンスに含まれない。一方 `getUserActivities` は期間フィルタなしで `UserEvent` の eventId を返している。

マイページ側 (`src/app/routes/me/index.tsx:88-89` および `me/interested/index.tsx:25`, `me/completed/index.tsx:25`):

```ts
const interestedEventDetails = allEvents.filter((e) => interestedEvents.includes(e.uuid))
const completedEventDetails = allEvents.filter((e) => completedEvents.includes(e.uuid))
```

`allEvents`（＝ `useEvents()` の返り値）に含まれないイベントは filter で落ちるため、**半年より前に開催されたイベントに対する interested / completed 登録は UI 上一切表示されない**。

## 修正方針の選択肢

### 案 A: `getUserActivities` のレスポンスに Event 詳細を含める（結合済みで返す）

**pros**: クライアント側の結合ロジック不要。マイページ以外の場所（events ページ等）に副作用なし。

**cons**: `getUserActivities` の API contract 変更。Zodios client / OpenAPI schema / Prisma クエリの見直し。既存の呼び出し側の破壊的変更に注意。

### 案 B: マイページ用に「ユーザーの登録イベントすべて」を返す専用 API を追加

例: `GET /me/events?status=interested` `GET /me/events?status=completed`

**pros**: 変更が局所的。既存の `getEvents` の半年フィルタは温存できる（一覧ページのパフォーマンス保護）。マイページ以外への影響ゼロ。

**cons**: エンドポイントが増える。同じような結合ロジックがサーバー側にもう 1 つできる。

### 案 C: `getEvents` の半年フィルタを外す（もしくはオプション化）

**pros**: シンプル。データが揃うだけ。

**cons**: `/events` 一覧ページなど全ユーザー向けの list が肥大化。長期運用でパフォーマンス問題が出る。もし半年フィルタが「情報鮮度を保つ」目的なら仕様が変わる。

### 案 D: クライアント側で不足分を個別 fetch

`interestedEvents` / `completedEvents` の eventId のうち `allEvents` に無いものだけ `useEvent(id)` で個別取得。

**pros**: サーバー変更なし。

**cons**: N+1 の懸念。マイページ表示のたびに個別 fetch が増える。UX 悪化とサブリクエスト上限のリスク。

### 推奨

**案 B（専用 API 追加）** を推奨。

理由:
- 既存の `getEvents` の設計意図（＝全ユーザー向けリストの鮮度確保）を壊さない
- マイページに必要なイベント集合が明確に「ユーザーが interested/completed 登録したイベント」なので、その集合単位の API があるのは意味的にも自然
- 変更が `src/api/me.ts` (or `src/api/user-activity.ts`) と `src/services/event-service.ts` にヘルパー追加、クライアントは `useEvents` の呼び出しを差し替えるだけで済む
- `getUserActivities` の contract は変えずに済む（案 A の破壊的変更を避けられる）

## 実装ステップ（案 B）

1. **サービス層**: `getEventsByIds(env, eventIds: string[]): Promise<Event[]>` を `event-service.ts` に追加。半年フィルタを掛けず `where: { uuid: { in: eventIds }, isVerified: true }` で引く
2. **API 層**: `GET /me/events` を追加し、`?status=interested` / `?status=completed` で分岐。`UserEvent` から eventId 一覧を取り、`getEventsByIds` で詳細解決
3. **Zodios client**: OpenAPI 定義を更新、client を再生成
4. **フック**: `useMyInterestedEvents()` / `useMyCompletedEvents()` を新設（もしくは `useUserActivity` に統合）
5. **UI 差し替え**: `me/index.tsx`, `me/interested/index.tsx`, `me/completed/index.tsx` の以下を差し替え
   ```ts
   const interestedEventDetails = allEvents.filter((e) => interestedEvents.includes(e.uuid))
   ```
   → 新フックの返り値を直接使う
6. **`useEvents` を保持**: 他ページ（`/events`, カレンダー等）は現状の半年フィルタのままで問題ないので触らない

## 影響ファイル

- `src/services/event-service.ts`
- `src/api/me.ts`（or 新規 `src/api/user-events.ts`）
- `src/schemas/event.dto.ts`（新 endpoint スキーマ）
- `src/utils/client.ts`（Zodios 再生成）
- `src/hooks/use-user-activity.ts`（フック追加 or 既存フック拡張）
- `src/app/routes/me/index.tsx`
- `src/app/routes/me/interested/index.tsx`
- `src/app/routes/me/completed/index.tsx`

## テスト

- 半年より前に開催された `Event` に対して `UserEvent(status='interested')` が存在するユーザーで、マイページの「気になるイベント」欄に表示される
- 同じく `status='completed'` で「達成済みイベント」欄に表示される
- 半年以内の登録済みイベントも従来通り表示される
- `/events` 一覧ページ・カレンダー等の他ページの表示件数が変わらないこと（`useEvents` は変更しない前提）

## ブランチ

`fix/mypage-events-full-history`（バッジ関連 plan の `fix/badge-count-and-area-complete` とは別作業）

## 補足

`getUserActivities` レスポンスに Event 詳細を含める案 A も筋は良いので、API 設計者と合意した上で案 A に振り直すのはあり。その場合はフロント側修正がさらに減る（フック 1 本で完結）。
