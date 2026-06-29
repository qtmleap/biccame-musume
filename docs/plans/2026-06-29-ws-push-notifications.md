# バックグラウンドタスク完了通知 — WebSocket + Durable Object Hibernation (2026-06-29)

## 背景

`docs/plans/2026-06-29-do-counters-and-vote-perf.md` の Part 2/3 で導入した **バッジ評価 `waitUntil` 化** によって、投票・店舗訪問・イベント達成のレスポンスは即返却されるようになった。代償として、サーバー応答に含まれていた `newBadges[]` は常に空配列となり、クライアント側は固定遅延 (現状 2500ms) の `setTimeout` で `['me', 'badges']` を再取得している:

- バッジ評価が早く終わった場合: 余分な待ち時間が発生
- バッジ評価が遅延した場合: 2.5 秒では足りずに stale を表示する可能性
- 「バッジ獲得！」の即時 toast が失われた

これを **「サーバーが背景タスク完了を能動的に push する」** 仕組みに置き換える計画。

---

## アーキテクチャ選定

### 検討した方式

| 方式 | 評価 | 採用 |
|---|---|---|
| **クライアント polling** (現状の setTimeout) | 実装最小、無駄リクエストあり、リアルタイム性なし | △ 現状の暫定 |
| **HTTP SSE** (text/event-stream) | 単方向で十分。だが Workers の wall time 制限 (~30s) で接続が切れる、再接続コスト | ✕ |
| **WebSocket (通常)** | 双方向、長時間接続可。だが Worker request duration 課金が積算される | △ |
| **WebSocket Hibernation (DO 経由)** | DO の `acceptWebSocket()` で idle 時は課金停止。状態保持も DO storage で永続化可能 | **✓ 採用** |

### Hibernation を採用する理由 (Cloudflare 独自機能)

通常の WebSocket は接続が生きている限り課金 (duration)。一方 `state.acceptWebSocket(ws)` で受け入れた WS は、メッセージ受信時のみ DO がウェイクアップする「hibernation 対応モード」になる。アイドル時は GB-sec の課金が走らない。

公式: https://developers.cloudflare.com/durable-objects/best-practices/websockets/#websocket-hibernation-api

---

## 設計

### コンポーネント

```
┌────────────┐        ┌──────────────────┐
│   Browser  │◄──WS──►│  Worker (Hono)   │
│            │        │  /api/me/ws      │
└────────────┘        │   ┌────────────┐ │
                      │   │ upgrade →  │ │
                      │   │ DO routing │ │
                      │   └─────┬──────┘ │
                      └─────────┼────────┘
                                ▼
                  ┌─────────────────────────┐
                  │   UserPushDO            │
                  │   idFromName(userId)    │
                  │   - acceptWebSocket(ws) │
                  │   - storage: lastEvents │
                  │   webSocketMessage(...) │
                  └────────────▲────────────┘
                               │ RPC: pushBadge(badgeDto)
                               │
        ┌──────────────────────┴────────────────────┐
        │   waitUntil(evaluateOn*)                  │
        │   → 完了後に UserPushDO.pushBadge(...) を  │
        │     呼ぶ                                   │
        │   (vote.ts / me.ts / favorite.ts 各所)    │
        └───────────────────────────────────────────┘
```

### `UserPushDO` 概要

```ts
export class UserPushDO {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(req: Request): Promise<Response> {
    const upgrade = req.headers.get('Upgrade')
    if (upgrade !== 'websocket') return new Response('Expected WebSocket', { status: 426 })

    const { 0: client, 1: server } = new WebSocketPair()
    this.state.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  // RPC: 背景タスクから呼ばれる
  async pushBadge(badge: BadgeDto): Promise<void> {
    const message = JSON.stringify({ type: 'badge_earned', badge })
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(message)
      } catch {
        // 切断済みは無視
      }
    }
    // 未接続のためバッファ (5分 TTL)
    if (this.state.getWebSockets().length === 0) {
      await this.state.storage.put(`pending:${Date.now()}`, message, {
        expirationTtl: 300
      })
    }
  }

  webSocketMessage(ws: WebSocket, msg: string): void {
    // 主に keepalive 用。クライアントは "ping" を 30s 毎に送る
    if (msg === 'ping') ws.send('pong')
  }

  webSocketClose(ws: WebSocket, code: number): void {
    // hibernation 中もクローズイベントは届く。掃除は自動
  }

  // 再接続時のキャッチアップ
  async webSocketOpen(ws: WebSocket): Promise<void> {
    const pending = await this.state.storage.list({ prefix: 'pending:' })
    for (const [key, msg] of pending) {
      ws.send(msg as string)
      await this.state.storage.delete(key)
    }
  }
}
```

### バッジ評価フックの変更

`badge-evaluator.ts` の `evaluateOnVote` / `evaluateOnVisit` / `evaluateOnEventComplete` の戻り値 `Badge[]` を、評価完了時に `UserPushDO.pushBadge()` する形に変える。または呼び出し側 (`api/vote.ts` 他) で:

```ts
c.executionCtx.waitUntil(
  evaluateOnVote(ctx, lastVotedId).then(async (badges) => {
    if (badges.length === 0) return
    const stub = c.env.USER_PUSH.get(c.env.USER_PUSH.idFromName(userId))
    await Promise.all(badges.map((b) => stub.pushBadge(prismaBadgeToDto(b))))
  })
)
```

### クライアント側

`src/hooks/use-push-stream.ts` (新規) で WS を一元管理:

```ts
export const usePushStream = () => {
  const queryClient = useQueryClient()
  const { isAuthenticated, idToken } = useAuth()
  
  useEffect(() => {
    if (!isAuthenticated) return
    const ws = new WebSocket(`wss://${location.host}/api/me/ws?token=${idToken}`)
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'badge_earned') {
        const { name, description } = resolveBadgeText(msg.badge)
        toast.success(`バッジ獲得: ${name}`, { description })
        queryClient.invalidateQueries({ queryKey: ['me', 'badges'] })
      }
    }
    // keepalive
    const ping = setInterval(() => ws.send('ping'), 30_000)
    return () => { clearInterval(ping); ws.close() }
  }, [isAuthenticated, idToken])
}
```

`src/app/main.tsx` あたりで 1 回だけ呼ぶ。

これで `use-bulk-vote.ts` / `use-vote.ts` / `use-user-activity.ts` の `setTimeout` ベース再取得は撤去できる。

---

## コスト試算

前提: DAU 1,000、平均接続時間 8 時間、1 セッションあたり投票 5 / 訪問 2 / イベント達成 1 = badge eval 8 回。

| 項目 | 数量/月 | 単価 | 月額 |
|---|---:|---:|---:|
| DO 接続 (WS open) | 30k | $0.15 / 1M req | $0.0045 |
| DO message (in+out) | 30 × 8 × 30k = 7.2M | $0.20 / 1M | **$1.44** |
| DO duration (active, hibernation 除外) | 約 30k × 50ms × 128MB ≈ 0.2 GB-sec | $12.50 / M GB-sec | **$0.0025** |
| DO storage ops (pending buffer) | 100k ops | $1 / 1M | $0.10 |
| **合計** | | | **約 $1.5/月** |

参考: 仮に hibernation を使わない通常 WS だと、接続中 ずっと duration 課金 → 1k 同接 × 8h × 30日 × 128MB ≈ 110 GB-sec × $12.50/M = $0.001/月... あれ意外と安い。実はこの規模なら hibernation のメリットは "$1 程度の節約" にとどまる。

**結論: コスト面では誤差。採用理由は接続管理コードの単純化と将来スケール時の保険。**

---

## 投入順序とリスク

### 推奨タイミング

**「StatsDO」「VoteCounterDO」と同じ PR で導入する。** 理由:
- DO migration (`new_sqlite_classes`) は 1 回でまとめると wrangler 設定の差分が小さい
- DO 3 種 (Stats / VoteCounter / UserPush) は責務が完全に独立、コードコンフリクト無し
- 一度に動作確認した方が production 投入の不確実性が減る

### 想定 PR 構成

```
feat(do): Introduce Durable Objects for stats, vote counters and user push
├── src/durable-objects/stats.ts
├── src/durable-objects/vote-counter.ts
├── src/durable-objects/user-push.ts
├── src/api/stats.ts            ← KV → STATS DO
├── src/api/vote.ts             ← bulkVote 内 VOTE_COUNTER 呼び出し
├── src/api/me/ws.ts            ← WS upgrade endpoint
├── src/hooks/use-push-stream.ts
└── wrangler.toml               ← bindings + migrations 追記
```

### リスク

- **接続認証**: WS upgrade 前に Firebase ID Token 検証が必要。クエリパラメータでトークンを渡すか、初回メッセージで認証メッセージを送る方式。
- **再接続ストーム**: クライアントが exponential backoff で再接続する仕組みを最初から入れる (Cloudflare ガイド推奨パターン)。
- **未配信メッセージ**: `pending:` バッファに 5 分積んだあとも未接続なら捨てる。重大通知 (= 課金等) には不向きだが、バッジ表示には十分。
- **デプロイ時の WS 切断**: Workers 新バージョン deploy で既存 WS は切断される。クライアント側 reconnect が必須。

### 巻き戻し

- WS endpoint を `404` で塞ぐ feature flag (`PUSH_ENABLED` env) を最初から入れる
- 旧 `setTimeout` ロジックは 1〜2 リリース残し、`PUSH_ENABLED=false` で復帰できる
- DO storage に書いたデータは ephemeral なので消えても影響なし

---

## TODO (実施時)

- [ ] `wrangler.toml` に `[[durable_objects.bindings]]` × 3 と `[[migrations]]` (new_sqlite_classes) 追加
- [ ] `src/durable-objects/user-push.ts` 実装 (上記スケッチをベースに)
- [ ] WS upgrade endpoint (`/api/me/ws`) + token 検証
- [ ] `api/vote.ts`、`api/me.ts` の `waitUntil` 内で `UserPushDO.pushBadge` 呼び出し
- [ ] `src/hooks/use-push-stream.ts` + `main.tsx` での hook 起動
- [ ] 既存 `setTimeout` ベース invalidate は `PUSH_ENABLED=false` の fallback として残す
- [ ] e2e で「投票 → toast 表示」を verify
