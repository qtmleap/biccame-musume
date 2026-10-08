import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { VIEWER_BASE } from './schema'
import { loadViewerApi } from './store'

// bun dev（vite serve）に相乗りして、イベント検出ビューワの API を配信する。build には含めない。
// 画面は管理画面の /admin/event-detect（workers/app/src/app/routes/admin/event-detect）で、ここは /__event-detect/api/* だけを受ける。
// データは `bun run event-detect prepare` で .cache/event-detect に用意しておく。初回アクセス時に読み込む。

type Api = Awaited<ReturnType<typeof loadViewerApi>>

/** node の req を Request にする。path は VIEWER_BASE を除いたもの */
const toRequest = async (req: IncomingMessage, path: string): Promise<Request> => {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const method = req.method === undefined ? 'GET' : req.method
  return new Request(new URL(path, 'http://localhost'), {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) })
  })
}

const send = async (res: ServerResponse, response: Response) => {
  res.statusCode = response.status
  for (const [key, value] of response.headers) res.setHeader(key, value)
  res.end(Buffer.from(await response.arrayBuffer()))
}

export const eventDetectViewer = (options: { repoRoot: string; now: () => string }): Plugin => {
  const dir = resolve(options.repoRoot, '.cache/event-detect')
  const state: { api?: Promise<Api> } = {}

  const api = () => {
    if (!state.api) {
      state.api = loadViewerApi({
        dir,
        charactersPath: resolve(options.repoRoot, 'workers/app/public/characters.json'),
        now: options.now
      })
      // 読み込みに失敗したら次のアクセスで読み直す
      state.api.catch(() => {
        state.api = undefined
      })
    }
    return state.api
  }

  return {
    name: 'event-detect-viewer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url === undefined ? '' : req.url
        if (url !== VIEWER_BASE && !url.startsWith(`${VIEWER_BASE}/`)) return next()
        const path = url.slice(VIEWER_BASE.length).split('?')[0]
        // 画面は管理画面のルートが描画する。ここは API だけを受ける
        if (!path.startsWith('/api/')) return next()
        try {
          if (!existsSync(resolve(dir, 'meta.json'))) {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: `データがありません。先に bun run event-detect prepare を実行してください（${dir}）` }))
            return
          }
          const request = await toRequest(req, url.slice(VIEWER_BASE.length))
          await send(res, await (await api()).handle(request))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
      })
    }
  }
}
