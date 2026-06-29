import { DurableObject } from 'cloudflare:workers'
import type { Bindings } from '@/types/bindings'

// 未接続時にバッファする push メッセージの上限件数。 これを超えると古いものから
// 捨てる。 DO storage には KV のような expirationTtl が無いため、 件数上限で
// 暴走を防ぐ。 バッジ獲得は同一ユーザーで連続発生しても 1 セッション数件のため
// 32 件もあれば実運用は十分に保たれる。
const PENDING_MAX_ENTRIES = 32

// pending key の prefix。 `pending:<msec timestamp>:<badge>:<rand>` の形にすることで
// 文字列ソートが時系列ソートと一致する (古いものほど先頭)。
const PENDING_PREFIX = 'pending:'

export type PushBadgePayload = {
  code: string
  name: string
  description: string
  iconName: string
  rarity: string
}

type ServerMessage = { type: 'badge_earned'; badge: PushBadgePayload } | { type: 'pong' }

/**
 * UserPushDO — 認証済みユーザーごとの WebSocket Hibernation 用 DO。
 *
 * 設計: `idFromName(userId)` でユーザーごとに 1 インスタンス。
 * `acceptWebSocket()` で受け入れた WS は idle 時に Duration 課金が止まる。
 * 接続が無いタイミングで pushBadge() が呼ばれた場合は storage の `pending:` 領域に
 * 積み、 上限 {@link PENDING_MAX_ENTRIES} を超えたら古いものから捨てる。
 * 再接続時に fetch ハンドラ側の {@link drainPending} で取りこぼし配信する。
 */
export class UserPushDO extends DurableObject<Bindings> {
  async fetch(req: Request): Promise<Response> {
    const upgrade = req.headers.get('Upgrade')
    if (upgrade?.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 })
    }
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    // acceptWebSocket() 直後に pending を flush する。 hibernation 仕様上
    // webSocketOpen は呼ばれない可能性があるため、 接続確立タイミングで
    // 確実に取りこぼし配信できる本フローを正規ルートとする。
    await this.drainPending(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * バックグラウンドタスク (バッジ評価 waitUntil) から呼ばれる RPC。
   * 接続中の全 WS にバッジ獲得イベントを送る。 未接続のときは pending: に
   * 積み、 次回の接続確立時 {@link drainPending} で配信する。
   */
  async pushBadge(badge: PushBadgePayload): Promise<void> {
    const message: ServerMessage = { type: 'badge_earned', badge }
    const encoded = JSON.stringify(message)
    const sockets = this.ctx.getWebSockets()
    if (sockets.length === 0) {
      const key = `${PENDING_PREFIX}${Date.now()}:${badge.code}:${this.uniqueSuffix()}`
      await this.ctx.storage.put(key, encoded)
      await this.prunePending()
      return
    }
    for (const ws of sockets) {
      try {
        ws.send(encoded)
      } catch {
        // 既に閉じられた WS は無視 (Cloudflare ランタイムが回収する)
      }
    }
  }

  /**
   * pending エントリ数が上限を超えた場合に古いものから削除する。
   * key の prefix にタイムスタンプを埋めているので、 文字列ソート = 時系列。
   */
  private async prunePending(): Promise<void> {
    const all = await this.ctx.storage.list<string>({ prefix: PENDING_PREFIX })
    if (all.size <= PENDING_MAX_ENTRIES) return
    const sortedKeys = [...all.keys()].sort()
    const dropCount = all.size - PENDING_MAX_ENTRIES
    for (const key of sortedKeys.slice(0, dropCount)) {
      await this.ctx.storage.delete(key)
    }
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return
    if (message === 'ping') {
      const pong: ServerMessage = { type: 'pong' }
      ws.send(JSON.stringify(pong))
      return
    }
    if (message === 'sync') {
      // 接続確立後に何らかの理由で fetch ハンドラ側の drainPending が
      // 漏れた場合のフォールバック。 クライアントが任意のタイミングで呼べる。
      await this.drainPending(ws)
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): Promise<void> {
    // hibernation 経由でも close は届く。 ランタイム側で WS は自動回収されるため
    // 明示的な掃除は不要。 異常切断時 (code !== 1000) のみログを残す。
    if (code !== 1000) {
      console.warn(`[UserPushDO] WS closed with code ${code}`)
    }
    try {
      ws.close(code, 'closing')
    } catch {
      // 既に閉じている
    }
  }

  override async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    console.error('[UserPushDO] WS error:', error)
  }

  /**
   * 再接続クライアントへの取りこぼし配信。
   * `pending:` に積まれたメッセージを順次送り、 送り終えたら削除する。
   * acceptWebSocket() で受け入れた WS の場合、 hibernation 仕様上
   * webSocketOpen は呼ばれない可能性があるため、 取りこぼし配信は
   * クライアントから `sync` メッセージを送ってもらう形で対応する。
   */
  async drainPending(ws: WebSocket): Promise<void> {
    const pending = await this.ctx.storage.list<string>({
      prefix: PENDING_PREFIX
    })
    if (pending.size === 0) return
    for (const [key, value] of pending) {
      try {
        ws.send(value)
      } catch {
        // 送信失敗 → key は残してリトライ機会を残す
        continue
      }
      await this.ctx.storage.delete(key)
    }
  }

  private uniqueSuffix(): string {
    // pending key の衝突回避用。 同一ユーザーが同じ badge を立て続けに
    // 受け取るシナリオは想定していないが、 念のためランダム断片を足す。
    const buf = new Uint8Array(4)
    crypto.getRandomValues(buf)
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
}
