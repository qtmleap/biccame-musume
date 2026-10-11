import type { Plugin } from 'vite'

// scripts/event-detect.ts の serve と packages/shared の VIEWER_BASE に合わせる。
const BASE = '/__event-detect'
const ORIGIN = 'http://127.0.0.1:15176'
// fetch が本文を展開するため、接続情報と圧縮前の長さを引き継がない。
const HOP_BY_HOP_HEADERS = [
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'content-encoding',
  'upgrade'
]

// Cloudflare の run_worker_first より先に登録する。通常の server.proxy では届かない。
export const eventDetectProxy = (): Plugin => ({
  name: 'event-detect-proxy',
  apply: 'serve',
  configureServer: (server) => {
    server.middlewares.use(async (req, res, next) => {
      const url = req.url === undefined ? '' : req.url
      const path = url.split('?')[0]
      if (path !== BASE && !path.startsWith(`${BASE}/`)) return next()
      try {
        const method = req.method === undefined ? 'GET' : req.method
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        const headers = new Headers()
        for (const [key, value] of Object.entries(req.headers)) {
          if (value === undefined || HOP_BY_HOP_HEADERS.includes(key)) continue
          headers.set(key, Array.isArray(value) ? value.join(', ') : value)
        }
        const response = await fetch(`${ORIGIN}${url}`, {
          method,
          headers,
          redirect: 'manual',
          ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) })
        })
        res.statusCode = response.status
        for (const [key, value] of response.headers) {
          if (!HOP_BY_HOP_HEADERS.includes(key)) res.setHeader(key, value)
        }
        res.end(Buffer.from(await response.arrayBuffer()))
      } catch {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: `イベント検出ビューワの API に接続できません。bun run event-detect serve を起動してください（${ORIGIN}）`
          })
        )
      }
    })
  }
})
