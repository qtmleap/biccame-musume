# Durable Object 移行 + 投票/イベント書き込みの高速化 (2026-06-29)

## TL;DR

- 本日のユーザー数 / ページビュー / その他カウンタ系は **Cloudflare KV → Durable Object** に移すべき。コストは下がり、競合バグも消える。
- 投票が遅いのは **D1 + Prisma の round-trip 累積** が主因 (`bulkVote` の `$transaction` は SQLite では並列化されず逐次)。最も効くのは「**ユーザーに見えるカウンタ更新を DO に寄せ、履歴永続化と badge 評価を `waitUntil` に逃がす**」設計。
- DO 採用の追加 base cost は Workers Paid に既に含まれる範囲。月額影響は± $5 圏。

---

## Part 1. 本日のユーザー数 / PV を Durable Object に

### 現状の問題

`src/api/stats.ts:42-71` の `incrementPageView`:

```ts
const totalValue = await env.PAGE_VIEWS.get(totalKey)
const totalCount = totalValue ? Number.parseInt(totalValue, 10) : 0
await env.PAGE_VIEWS.put(totalKey, String(totalCount + 1))
```

**問題 1: read-then-write が atomic ではない**
KV は `get` と `put` の間で他リクエストが介入し得る。同時 100 PV が来ると数十件のカウント増がロストする。日次値が常に過小になる構造バグ。

**問題 2: KV write は eventually consistent**
KV write は P95 で 60 秒の伝搬。`refetchInterval: 30000` で polling してる以上、最新値が見えない瞬間がある (`src/hooks/use-page-views.ts:8`)。

**問題 3: 書き込み単価が高い**
KV write は $5 / 1M。PV 1 回につき 3 write (total / today / path) = 1日 10万 PV で月 900 万 write = $45/月。

**問題 4: 一覧取得 (`getAllPathStats`) で `list` → `get` × N が直列**
`src/api/stats.ts:78-91` でパス数だけ KV `get` する。100 パスで 100 ラウンドトリップ。

### Durable Object 設計案

```
StatsDO (one global instance, name='global'):
  in-memory state:
    total: number
    daily: Map<dateKey, number>           // 過去 7 日のみ保持
    paths: Map<pathKey, number>
    dailyUsers: Map<dateKey, Set<userKey>>  // hash(IP+UA) を Set に
  RPC methods:
    increment(path, userKey): void          // O(1), in-memory
    snapshot(): { total, today, paths, todayUsers }
    todayUserCount(date): number
  alarm:
    5秒毎に state.storage.put({ total, daily, paths })
    日付ロールオーバー時に古い daily/dailyUsers をパージ
```

**ポイント:**

- `idFromName('global')` で**単一インスタンス** — グローバルカウンタなので shard 不要。
- `dailyUsers` は実装に応じて 2 路線:
  - **正確に数えたい場合**: `Set<string>` を Storage 永続化 (1 日 10 万ユニークで ~3MB → DO storage 内 OK)
  - **概算で十分**: HyperLogLog (HLL) を採用 → 12KB の sketch で誤差 ±0.5%
- 書き込みは **in-memory increment のみで応答**、永続化は `alarm()` で 5 秒毎にバッチ。Worker → DO の RPC は ~5ms。
- 読み込みも DO 内 in-memory state を即返却。

### コスト比較 (前提: 1日 10万 PV = 月 300万 increment、配信 200万 read)

| 項目 | KV (現状) | DO (移行後) |
|---|---:|---:|
| Write/Increment | $5/M × 9M = **$45** (3 keys/PV) | request $0.15/M × 3M = **$0.45** |
| Read | $0.50/M × 2M = $1.00 | request $0.15/M × 2M = $0.30 |
| Storage | $0.50/GB-month × <1GB ≈ $0 | $0.20/GB-month × <1GB ≈ $0 |
| Duration | — | $12.50/M GB-sec × ~0.05 GB-sec/M req × 5M req ≈ **$3** |
| Storage ops (DO alarm 永続化) | — | $1/M × 17k alarm/月 ≈ **$0.02** |
| **月額** | **~$46** | **~$3.77** |

※ DO Duration は in-memory only 処理が支配的なので極めて小さい (1 req ≈ 1ms × 128MB)。
※ Workers Paid base $5/月 は両方に共通なので除外。

**結論: 月額 ~$42 削減 + atomic 整合性獲得 + read 即時 (no eventual consistency)**

### 実装スケッチ

`src/durable-objects/stats.ts` (新規):

```ts
export class StatsDO {
  private total = 0
  private daily = new Map<string, number>()
  private paths = new Map<string, number>()
  private dailyUsers = new Map<string, Set<string>>()
  private dirty = false

  constructor(private state: DurableObjectState, private env: Env) {
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Snapshot>('snapshot')
      if (stored) this.restore(stored)
    })
  }

  async fetch(req: Request): Promise<Response> {
    // RPC dispatch
  }

  async alarm(): Promise<void> {
    if (this.dirty) {
      await this.state.storage.put('snapshot', this.dump())
      this.dirty = false
    }
    // 翌アラームをスケジュール (5 秒後)
    await this.state.storage.setAlarm(Date.now() + 5_000)
  }
}
```

`wrangler.toml`:
```toml
[[durable_objects.bindings]]
name = "STATS"
class_name = "StatsDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["StatsDO"]   # SQLite-backed DO (推奨, 標準より安価)
```

`src/api/stats.ts` 側は `env.STATS.get(env.STATS.idFromName('global')).fetch(...)` に差し替え。

### 移行戦略

1. **Phase A**: DO を staging に投入、KV と並行 dual-write
2. **Phase B**: 1 日観察し DO 値が KV 値以上 (= ロストが起きていない) を確認
3. **Phase C**: read を DO 側に切替、KV を廃止
4. **Phase D**: KV namespace `PAGE_VIEWS` 削除

---

## Part 2. なぜ投票が遅いのか

### 計測前提

Cloudflare D1 のレイテンシは 同リージョンでも:
- 単発 `prepare().run()`: ~30-80ms
- `batch([...])`: 8 statement で ~50-100ms (1 RTT)
- Prisma D1 adapter は **statement 毎に** binding 経由で fetch する

### `POST /api/votes/bulk` のクリティカルパス分解

`src/services/vote-service.ts:99-148` の `bulkVote` を時系列で展開:

```
T0  +0ms    : エンドポイント到達
T1  +5ms    : verifyTokenOptional (JWT verify, KV 1回)
T2  +50ms   : rateLimiter middleware (1 KV get)
T3  +50ms   : Promise.all(isVoteLimited × N) ← 並列だが N=50 で最遅 ~150ms
T4  +200ms  : Promise.all([markVoteLimited × N, $transaction(...)])
              ├─ markVoteLimited × N (並列 KV put)
              └─ $transaction:
                  ├─ voteCount.upsert × N  (D1 で逐次 SQL × 50)
                  └─ vote.createMany × 1
              この transaction が ~300-600ms
T5  +800ms  : evaluateOnVote (バッジ評価 1〜数 D1 クエリ) ~50-100ms
T6  +900ms  : c.json(...)
```

**総レイテンシ目算: 800ms〜1.2s**

### 真の原因ランキング

1. **🔴 D1 round-trip × N (Prisma `$transaction`)** — 寄与最大
   Prisma の D1 adapter は `$transaction` を渡しても、内部的には `BEGIN; stmt1; stmt2; ...; COMMIT;` を 1 リクエストに合成できない。各 upsert で binding fetch。SQLite 自体は速くても network が積もる。

2. **🟡 KV `isVoteLimited` × N** — 並列だが N=50 で tail latency に支配される

3. **🟢 バッジ評価の同期実行** — 投票完了後に `prisma.vote.count` 等で追加 D1 クエリ。レスポンスを止める意味なし。

4. **🟢 `vote.createMany` の同期書き込み** — 履歴テーブル。ユーザー応答に不要。

5. **🟢 トランザクションロック** — D1 (SQLite) は database-level lock。並列投票が直列化される。

### 高速化策

#### 案 A: 投票カウンタを DO に寄せる (推奨・大)

VoteCounter DO:
```
class VoteCounterDO {
  counts: Map<charId, number>     // year スコープ
  dailyVoted: Map<userKey, Set<charId>>  // 本日投票済み
  
  bulkVote(userKey, charIds[]): { voted: charId[], skipped: charId[] }
}
```

- `bulkVote` は **in-memory で重複チェック + カウンタ +1** → ~5ms 応答
- D1 への永続化は `c.executionCtx.waitUntil(env.QUEUE.send({ ... }))` で background
- 「本日投票済みかどうか」も DO 内の Set で O(1)
- `getAllVoteCounts` も DO 内 Map から即返却 → 現状の `prisma.voteCount.findMany` を廃止可

**想定レイテンシ: 800ms → 50ms 以下**

トレードオフ:
- DO は単一インスタンスなので shard 戦略必要(年スコープなら `idFromName(year)` で十分シャード不要)
- DO がダウンすると投票が止まる(可用性は高いが ゼロではない)
- D1 の `voteCount` テーブルは「back-of-record」になる(true source は DO 側)

#### 案 B: D1 batch API を直接使う (中)

Prisma を一部捨てて raw D1 で batch:

```ts
await env.DB.batch([
  ...toVote.map((charId) => env.DB.prepare(
    'INSERT INTO vote_counts (character_id, year, count) VALUES (?, ?, 1) ' +
    'ON CONFLICT(character_id, year) DO UPDATE SET count = count + 1'
  ).bind(charId, year)),
  env.DB.prepare('INSERT INTO votes (id, character_id, ip_address, user_id) VALUES ' +
    toVote.map(() => '(?, ?, ?, ?)').join(',')).bind(...)
])
```

50 statement → 1 RTT。**~600ms → ~80ms**

#### 案 C: バッジ評価と vote.createMany を `waitUntil` に逃がす (小)

`src/api/vote.ts:121-138` の `evaluateOnVote` 部分:
```ts
// 現状: await して結果を返す
const newBadges = userId !== undefined && lastVotedId !== undefined
  ? (await evaluateOnVote(...))
  : []
return c.json({ ..., newBadges })

// 改善: バッジは即返却に含めず、background で評価
c.executionCtx.waitUntil(evaluateOnVote(...).then((badges) => {
  // 結果はユーザーごとの badge ストアに pending として書き込み
}))
return c.json({ ..., newBadges: [] /* 次回ロード時に取得 */ })
```

→ **80-100ms 短縮**

vote.createMany も同様に `waitUntil` 化可能。

#### 案 D: vote_limiter を DO に統合 (中)

KV `isVoteLimited` × N は並列でも tail latency 重い。VoteCounter DO に `dailyVoted` Set を持たせれば KV ラウンドトリップが消える。

### 推奨組み合わせ

**短期 (1-2 PR で着地、リスク低):**
- 案 C: バッジ評価を `waitUntil` 化 → 100ms 削減
- 案 B: bulkVote 内を D1 raw batch に → 500ms 削減
- 累計 **800ms → 200ms 程度**

**中期 (DO 採用、設計検討要):**
- 案 A + D: VoteCounter DO 導入、KV vote-limiter 廃止
- 累計 **200ms → 50ms 程度**

---

## Part 3. イベント達成 / お気に入りの高速化

### 現状

`src/services/favorite-service.ts:18-26`:
```ts
await prisma.favoriteCharacter.upsert({
  where: { userId_characterId: { userId, characterId } },
  update: {},
  create: { userId, characterId }
})
```

`upsert` 1発 + `addFavoriteCharacter` 経由の `evaluateOnVisit`/`evaluateOnEventComplete` (badge 評価) で都度 D1 クエリ × 数本。

イベント達成系 (`src/api/me.ts` の `updateUserEvent`) も同様で **「DB 書き込み 1〜2 本」+「バッジ評価で D1 クエリ数本」+「badge unlock 結果を取得して返却」** が直列。

### 改善策

#### お気に入り
- 単発 upsert は高速 (1 D1 RTT、~50ms)。問題はバッジ評価チェーン。
- `c.executionCtx.waitUntil(evaluateOnVisit(...))` で逃がせば応答時間は 50ms 程度。

#### イベント達成
- `updateUserEvent` の D1 書き込みは継続 (耐久性要)
- バッジ評価のみ `waitUntil` 化
- UI 側で「達成おめでとう + 後から付与されたバッジを次回画面遷移時に表示」に UX 変更

#### バッジ評価そのものの最適化
`badge-evaluator.ts` の各 evaluator は単発の `prisma.userStore.count` 等を投げる。**特定イベント** (`evaluateOnEventComplete`) で関連 sub_category だけ評価する形にすれば、N+1 を抑えられる。

「お気に入り追加」「来店マーク」「イベント達成」「投票」それぞれで、**そのアクションで unlock し得る badge subset** を事前に絞ってから評価する。

```ts
const SUBSCRIBED_ON_VISIT: BadgeSubCategory[] = [
  'visit', 'area_any', 'area_complete', 'count', 'all_areas_any_visit'
]
// evaluateOnVisit は SUBSCRIBED_ON_VISIT のみ評価
```

これで「投票」アクションで「visit 系 badge を全件再評価」する無駄が消える。

---

## Part 4. 実施順序とリスク

| 順序 | 施策 | 効果 | リスク |
|---|---|---|---|
| 1 | バッジ評価 `waitUntil` 化 (全アクション) | 投票 -100ms、その他 -50ms | 低: バッジ表示が遅延するが UI 文言で吸収可 |
| 2 | `bulkVote` を D1 raw batch に置換 | 投票 -500ms | 中: Prisma 部分置換のため SQL/型整合確認要 |
| 3 | `StatsDO` 導入 (PV / 本日のユーザー数) | KV 競合バグ解消、月 $42 削減 | 中: DO migration 必要、dual-write 期間運用 |
| 4 | `VoteCounterDO` 導入 + KV vote-limiter 廃止 | 投票 -100ms (KV round-trip 削減) | 高: 投票全体の信頼性が DO に依存 |
| 5 | バッジ評価の subset 限定 | バッジ chain -50ms | 低: 評価関数の static metadata 化のみ |

### 計測項目 (実施前後で必ず取る)

- `bulkVote` p50 / p95 (50キャラ一括時)
- 単発 `POST /api/votes/:id` p50 / p95
- `POST /api/stats` p50
- `GET /api/votes` (全カウント取得) p50
- `bunx wrangler tail --format json` で 1 リクエスト分の `cpu_time` / `wall_time`

### 巻き戻し戦略

- DO 系は **dual-write 期間 (1〜2週間)** を必ず設ける
- D1 raw batch は feature flag (env var) で Prisma 版に即時戻せるよう実装
- `waitUntil` 化は副作用順序のテストを e2e で固める

---

## 補足: Cloudflare 公式の料金 (2026-06 時点)

- Workers Paid: $5/月 (base、両方共通)
- Durable Objects (SQLite-backed):
  - Request: $0.15 / 1M
  - Duration: $12.50 / 1M GB-sec
  - Storage Read: $1 / 1M ops
  - Storage Write: $1 / 1M ops
  - Storage: $0.20 / GB-month
- KV:
  - Read: $0.50 / 1M
  - Write/Delete/List: $5 / 1M
  - Storage: $0.50 / GB-month
- D1:
  - Read: $0.001 / 1k rows read
  - Write: $1 / 1M rows written
  - Storage: $0.75 / GB-month (5GB included)

※ 価格は変動する。実施前に dash.cloudflare.com で再確認のこと。
