import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { VIEWER_BASE } from './schema'

// イベント検出ビューワの API をローカルで配信するハンドラ（bun run event-detect serve が Bun.serve に渡す）。
// 画面は管理画面の /admin/event-detect で、vite の dev 中継（/__event-detect）経由でここの /__event-detect/api/* を呼ぶ。
// データは `bun run event-detect prepare` で .cache/event-detect に用意しておく。初回アクセス時に読み込む。

type Api = { handle: (request: Request) => Promise<Response> }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const createViewerHandler = (options: { dir: string; loadApi: () => Promise<Api> }) => {
  const state: { api?: Promise<Api> } = {}

  const api = () => {
    if (!state.api) {
      const loading = options.loadApi()
      state.api = loading
      // 読み込みに失敗したら次のアクセスで読み直す
      loading.catch(() => {
        if (state.api === loading) state.api = undefined
      })
    }
    return state.api
  }

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    if (url.pathname !== VIEWER_BASE && !url.pathname.startsWith(`${VIEWER_BASE}/`))
      return json(404, { error: 'not found' })
    const path = url.pathname.slice(VIEWER_BASE.length)
    // 画面は管理画面のルートが描画する。ここは API だけを受ける
    if (!path.startsWith('/api/')) return json(404, { error: 'not found' })
    try {
      if (!existsSync(resolve(options.dir, 'meta.json')))
        return json(503, {
          error: `データがありません。先に bun run event-detect prepare を実行してください（${options.dir}）`
        })
      const method = request.method
      const forwarded = new Request(new URL(`${path}${url.search}`, 'http://localhost'), {
        method,
        headers: request.headers,
        ...(method === 'GET' || method === 'HEAD' ? {} : { body: await request.arrayBuffer() })
      })
      return await (await api()).handle(forwarded)
    } catch (error) {
      return json(500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}
