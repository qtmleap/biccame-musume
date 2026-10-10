import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { VIEWER_BASE } from './schema'
import { EMULATED_FILE } from './store'

// イベント検出ビューワの API をローカルで配信するハンドラ（bun run event-detect serve が Bun.serve に渡す）。
// 画面は管理画面の /admin/event-detect で、vite の dev 中継（/__event-detect）経由でここの /__event-detect/api/* を呼ぶ。
// データは `bun run event-detect prepare` で .cache/event-detect に用意しておく。初回アクセス時に読み込み、
// prepare が posts.jsonl・meta.json・gold.json を、emulate が emulated-v1.json を書き換えたら次のアクセスで読み直す
// （再起動は要らない）。

type Api = { handle: (request: Request) => Promise<Response> }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// prepare が書き換えるファイルと、emulate が書く結果。labels.json は API 自身が書くので入れない（ラベルのたびに全件
// 読み直しになる）。gap-events.json も API がリクエストのたびに読むので入れない。emulated-v1.json は emulate を
// 実行するまで無いので、無いときは目印なしとして扱い、現れたときに変化として読み直す（検証用の -score.json 等は入れない）
const WATCHED_FILES = ['posts.jsonl', 'meta.json', 'gold.json', EMULATED_FILE]

/** 読み込み済みのデータが古いかを見分ける目印。ファイルごとの mtime と size をつなぐ（無いファイルは '-'） */
const dataStamp = async (dir: string) => {
  const parts = await Promise.all(
    WATCHED_FILES.map(async (name) => {
      const info = await stat(resolve(dir, name)).catch(() => undefined)
      return info ? `${info.mtimeMs}:${info.size}` : '-'
    })
  )
  return parts.join(' ')
}

/** 成功しても失敗しても終わりだけを待つ */
const settled = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    () => undefined
  )

export const createViewerHandler = (options: {
  dir: string
  loadApi: () => Promise<Api>
  /** 読み込み済みのデータを捨てて読み直すときに呼ぶ（初回の読み込みでは呼ばない） */
  onReload?: () => void
}) => {
  const state: { api?: Promise<Api>; stamp?: string } = {}

  const start = (stamp: string, previous?: Promise<Api>) => {
    // 古い読み込みが終わってから新しい読み込みを始める。全履歴では 1 回が約 19 秒・5.7GB なので、同時に 2 つ持たない。
    // 変化が読み込み中に何度も起きると読み込みが順に走るが、メモリは常に 1 つ分で済む
    const loading = previous ? settled(previous).then(() => options.loadApi()) : options.loadApi()
    state.api = loading
    state.stamp = stamp
    // 読み込みに失敗したら次のアクセスで読み直す
    loading.catch(() => {
      if (state.api === loading) state.api = undefined
    })
    return loading
  }

  const api = async () => {
    // 目印は読み込みを始める前の値を記録する。読み込み中に書き換わっても次のアクセスで変化として見つかる。
    // prepare の途中（posts.jsonl だけ新しく meta.json が古い）に読んだ場合も、meta.json の更新でもう一度読み直す
    const stamp = await dataStamp(options.dir)
    const current = state.api
    if (!current) return start(stamp)
    if (state.stamp === stamp) return current
    options.onReload?.()
    return start(stamp, current)
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
