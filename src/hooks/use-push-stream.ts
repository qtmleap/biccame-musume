import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { client } from '@/utils/client'

type PushedBadge = {
  code: string
  name: string
  description: string
  iconName: string
  rarity: string
}

type ServerMessage = { type: 'badge_earned'; badge: PushedBadge } | { type: 'pong' }

const PING_INTERVAL_MS = 30_000
const RECONNECT_INITIAL_MS = 1_000
const RECONNECT_MAX_MS = 30_000

const buildWsUrl = (): string => {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/api/me/ws`
}

/**
 * UserPushDO への WebSocket 接続を維持し、 サーバー側 waitUntil で push される
 * バッジ獲得イベントを受け取って toast 表示 + query invalidate を行う。
 *
 * 認証状態が変化したら張り直す。 接続失敗は exponential backoff で再試行する。
 * 既存の setTimeout invalidate (use-bulk-vote 等) は撤去せず保険として残す。
 * push が早く来た場合は invalidate が二重発火するが idempotent なので無害。
 */
export const usePushStream = (): void => {
  const queryClient = useQueryClient()
  const { isAuthenticated, user } = useAuth()

  useEffect(() => {
    if (!isAuthenticated || user === null) return

    let ws: WebSocket | null = null
    let pingTimer: ReturnType<typeof setInterval> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectDelay = RECONNECT_INITIAL_MS
    let cancelled = false
    // session Cookie は auth-provider が並列に発行しているため、
    // Firebase Auth state だけで WS を張ると Cookie 到着前に 401 で
    // ハンドシェイクが失敗する。 初回 connect の前に同じ
    // /api/auth エンドポイントを叩いて Cookie の確立を保証する。
    // 一度成立すれば maxAge 5 日のため、 再接続時はスキップする。
    // Biome noLet を避けるため mutable フラグはオブジェクトで持つ。
    const sessionState = { ensured: false }

    const clearTimers = () => {
      if (pingTimer !== null) {
        clearInterval(pingTimer)
        pingTimer = null
      }
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const scheduleReconnect = () => {
      if (cancelled) return
      const delay = reconnectDelay
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
      reconnectTimer = setTimeout(connect, delay)
    }

    const handleMessage = (raw: string) => {
      const parsed: ServerMessage = (() => {
        try {
          return JSON.parse(raw) as ServerMessage
        } catch {
          return { type: 'pong' }
        }
      })()
      if (parsed.type === 'badge_earned') {
        toast.success(`バッジ獲得: ${parsed.badge.name}`, {
          description: parsed.badge.description
        })
        queryClient.invalidateQueries({ queryKey: ['me', 'badges'] })
      }
    }

    const ensureSession = async (): Promise<boolean> => {
      if (sessionState.ensured) return true
      try {
        const idToken = await user.getIdToken()
        await client.authenticate(undefined, { headers: { Authorization: `Bearer ${idToken}` } })
        sessionState.ensured = true
        return true
      } catch (err) {
        console.warn('[push-stream] session establish failed:', err)
        return false
      }
    }

    const connect = async () => {
      if (cancelled) return
      const ok = await ensureSession()
      if (cancelled) return
      if (!ok) {
        scheduleReconnect()
        return
      }
      try {
        ws = new WebSocket(buildWsUrl())
      } catch (err) {
        console.warn('[push-stream] connect failed:', err)
        scheduleReconnect()
        return
      }

      ws.onopen = () => {
        reconnectDelay = RECONNECT_INITIAL_MS
        try {
          ws?.send('sync')
        } catch {
          // 接続直後の send 失敗は致命ではない、 次の ping/メッセージで補える
        }
        pingTimer = setInterval(() => {
          try {
            ws?.send('ping')
          } catch {
            // 切れていたら onclose に流れる
          }
        }, PING_INTERVAL_MS)
      }

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          handleMessage(event.data)
        }
      }

      ws.onerror = () => {
        // onclose で再接続するため、ここではログだけ
        console.warn('[push-stream] ws error')
      }

      ws.onclose = () => {
        if (pingTimer !== null) {
          clearInterval(pingTimer)
          pingTimer = null
        }
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      cancelled = true
      clearTimers()
      try {
        ws?.close(1000, 'unmount')
      } catch {
        // ignore
      }
    }
  }, [isAuthenticated, user, queryClient])
}
