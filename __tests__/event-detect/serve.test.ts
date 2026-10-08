import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createViewerHandler } from '../../scripts/lib/event-detect/serve'

const BASE = '/__event-detect'

type Call = { path: string; method: string; body: string; contentType: string | null }

let dataDir = ''
let emptyDir = ''

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'event-detect-serve-data-'))
  emptyDir = await mkdtemp(join(tmpdir(), 'event-detect-serve-empty-'))
  await writeFile(join(dataDir, 'meta.json'), '{}')
})

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true })
  await rm(emptyDir, { recursive: true, force: true })
})

/** handle に渡った Request を記録する API。応答は path をそのまま JSON で返す */
const recordingApi = () => {
  const calls: Call[] = []
  const api = {
    handle: async (request: Request) => {
      const url = new URL(request.url)
      calls.push({
        path: `${url.pathname}${url.search}`,
        method: request.method,
        body: await request.text(),
        contentType: request.headers.get('content-type')
      })
      return Response.json({ ok: true, path: url.pathname })
    }
  }
  return { api, calls }
}

const request = (path: string, init?: RequestInit) => new Request(`http://127.0.0.1:15176${path}`, init)

describe('viewer handler', () => {
  test('VIEWER_BASE を除いた /api/... とメソッド・クエリ・ボディを handle に渡す', async () => {
    const { api, calls } = recordingApi()
    const handler = createViewerHandler({ dir: dataDir, loadApi: async () => api })

    const get = await handler(request(`${BASE}/api/posts?scope=passed&limit=2`))
    expect(get.status).toBe(200)
    expect(get.headers.get('content-type')).toContain('application/json')
    expect(await get.text()).toBe(JSON.stringify({ ok: true, path: '/api/posts' }))

    const put = await handler(
      request(`${BASE}/api/labels/3`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict: 'event' })
      })
    )
    expect(put.status).toBe(200)

    expect(calls).toEqual([
      { path: '/api/posts?scope=passed&limit=2', method: 'GET', body: '', contentType: null },
      { path: '/api/labels/3', method: 'PUT', body: '{"verdict":"event"}', contentType: 'application/json' }
    ])
  })

  test('VIEWER_BASE の外と /api/ で始まらないパスは 404 で、API を呼ばない', async () => {
    const { api, calls } = recordingApi()
    let loaded = 0
    const handler = createViewerHandler({
      dir: dataDir,
      loadApi: async () => {
        loaded += 1
        return api
      }
    })
    for (const path of ['/foo', '/api/summary', `${BASE}`, `${BASE}/`, `${BASE}/index.html`, `${BASE}x/api/summary`]) {
      const response = await handler(request(path))
      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(await response.text()).toContain('"error"')
    }
    expect(calls).toHaveLength(0)
    expect(loaded).toBe(0)
  })

  test('meta.json が無ければ 503 で prepare を案内し、API も読み込まない', async () => {
    const { api, calls } = recordingApi()
    let loaded = 0
    const handler = createViewerHandler({
      dir: emptyDir,
      loadApi: async () => {
        loaded += 1
        return api
      }
    })
    const response = await handler(request(`${BASE}/api/summary`))
    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.text()).toBe(
      JSON.stringify({
        error: `データがありません。先に bun run event-detect prepare を実行してください（${emptyDir}）`
      })
    )
    expect(calls).toHaveLength(0)
    expect(loaded).toBe(0)
  })

  test('loadApi が失敗したら 500 を返し、次のアクセスで読み直す', async () => {
    const { api, calls } = recordingApi()
    const attempts: string[] = []
    const handler = createViewerHandler({
      dir: dataDir,
      loadApi: async () => {
        attempts.push('load')
        if (attempts.length === 1) throw new Error('posts.jsonl が壊れています')
        return api
      }
    })
    const failed = await handler(request(`${BASE}/api/summary`))
    expect(failed.status).toBe(500)
    expect(await failed.text()).toBe(JSON.stringify({ error: 'posts.jsonl が壊れています' }))

    const retried = await handler(request(`${BASE}/api/summary`))
    expect(retried.status).toBe(200)
    expect(calls.map((call) => call.path)).toEqual(['/api/summary'])

    // 成功したら以降は読み直さない
    await handler(request(`${BASE}/api/accounts`))
    expect(attempts).toHaveLength(2)
  })

  test('同時に来たアクセスは読み込みを共有する', async () => {
    const { api } = recordingApi()
    const attempts: string[] = []
    const handler = createViewerHandler({
      dir: dataDir,
      loadApi: async () => {
        attempts.push('load')
        await Bun.sleep(10)
        return api
      }
    })
    const responses = await Promise.all([
      handler(request(`${BASE}/api/summary`)),
      handler(request(`${BASE}/api/accounts`))
    ])
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect(attempts).toHaveLength(1)
  })

  test('handle が例外を投げたら 500 で message を返す', async () => {
    const handler = createViewerHandler({
      dir: dataDir,
      loadApi: async () => ({
        handle: async () => {
          throw new Error('boom')
        }
      })
    })
    const response = await handler(request(`${BASE}/api/summary`))
    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.text()).toBe(JSON.stringify({ error: 'boom' }))
  })

  test('Error 以外が投げられても 500 を返す', async () => {
    const handler = createViewerHandler({
      dir: dataDir,
      loadApi: async () => ({
        handle: async () => {
          throw 'plain string'
        }
      })
    })
    const response = await handler(request(`${BASE}/api/summary`))
    expect(response.status).toBe(500)
    expect(await response.text()).toBe(JSON.stringify({ error: 'plain string' }))
  })
})
