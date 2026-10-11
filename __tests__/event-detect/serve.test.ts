import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
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

describe('viewer handler のデータ読み直し', () => {
  // utimes に渡す UNIX 秒。2026-01-01T00:00:00Z とその翌日
  const BEFORE = 1767225600
  const AFTER = BEFORE + 24 * 60 * 60

  // テストごとの一時ディレクトリ（共有の dataDir は触らない）
  const fixture = { dir: '' }

  /** 固定の mtime でファイルを書く。mtime の分解能に頼らず、変化の有無をテストで決める */
  const writeAt = async (name: string, content: string, mtime: number) => {
    const path = join(fixture.dir, name)
    await writeFile(path, content)
    await utimes(path, mtime, mtime)
  }

  beforeEach(async () => {
    fixture.dir = await mkdtemp(join(tmpdir(), 'event-detect-serve-reload-'))
    await writeAt('posts.jsonl', '', BEFORE)
    await writeAt('meta.json', '{}', BEFORE)
    await writeAt('gold.json', '{}', BEFORE)
  })

  afterEach(async () => {
    await rm(fixture.dir, { recursive: true, force: true })
  })

  /** loadApi の呼び出しごとに世代番号を持つ API を返す。応答の本文で、どの世代のデータが答えたかが分かる */
  const generationHandler = (gate?: Promise<void>) => {
    const loads: string[] = []
    const reloads: string[] = []
    const handler = createViewerHandler({
      dir: fixture.dir,
      loadApi: async () => {
        loads.push('load')
        const generation = loads.length
        if (generation === 1) await gate
        return { handle: async () => Response.json({ generation }) }
      },
      onReload: () => reloads.push('reload')
    })
    return { handler, loads, reloads }
  }

  const summary = async (handler: (request: Request) => Promise<Response>) =>
    (await handler(request(`${BASE}/api/summary`))).text()

  const generation = (n: number) => JSON.stringify({ generation: n })

  test('データが変わらなければ読み直さない', async () => {
    const { handler, loads, reloads } = generationHandler()
    expect(await summary(handler)).toBe(generation(1))
    expect(await summary(handler)).toBe(generation(1))
    expect(await summary(handler)).toBe(generation(1))
    expect(loads).toHaveLength(1)
    expect(reloads).toHaveLength(0)
  })

  for (const name of ['posts.jsonl', 'meta.json', 'gold.json']) {
    test(`${name} の mtime が変わると次のアクセスで読み直し、onReload を 1 回呼ぶ`, async () => {
      const { handler, loads, reloads } = generationHandler()
      expect(await summary(handler)).toBe(generation(1))

      await utimes(join(fixture.dir, name), AFTER, AFTER)
      expect(await summary(handler)).toBe(generation(2))
      expect(loads).toHaveLength(2)
      expect(reloads).toHaveLength(1)

      // 読み直したあとは、また変わるまで読み直さない
      expect(await summary(handler)).toBe(generation(2))
      expect(loads).toHaveLength(2)
      expect(reloads).toHaveLength(1)
    })
  }

  test('emulated-v1.json が無くても 503 にならず、現れたとき・mtime が変わったとき・消えたときに読み直す', async () => {
    const { handler, loads, reloads } = generationHandler()
    // emulate を実行するまでファイルは無い。無いまま普通に答える
    const first = await handler(request(`${BASE}/api/summary`))
    expect(first.status).toBe(200)
    expect(await first.text()).toBe(generation(1))
    expect(await summary(handler)).toBe(generation(1))
    expect(loads).toHaveLength(1)

    // emulate が結果を書いたら読み直す
    await writeAt('emulated-v1.json', '[]', BEFORE)
    expect(await summary(handler)).toBe(generation(2))
    expect(await summary(handler)).toBe(generation(2))
    expect(loads).toHaveLength(2)
    expect(reloads).toHaveLength(1)

    // 書き直されたら（mtime が変わったら）読み直す
    await utimes(join(fixture.dir, 'emulated-v1.json'), AFTER, AFTER)
    expect(await summary(handler)).toBe(generation(3))
    expect(loads).toHaveLength(3)
    expect(reloads).toHaveLength(2)

    // 消えたときも、結果の無い状態として読み直す（503 にはしない）
    await rm(join(fixture.dir, 'emulated-v1.json'))
    const removed = await handler(request(`${BASE}/api/summary`))
    expect(removed.status).toBe(200)
    expect(await removed.text()).toBe(generation(4))
    expect(loads).toHaveLength(4)
    expect(reloads).toHaveLength(3)
  })

  test('検証用の emulated-v1-score.json などを書き換えても読み直さない', async () => {
    const { handler, loads, reloads } = generationHandler()
    await summary(handler)
    await writeAt('emulated-v1-score.json', '{}', AFTER)
    await writeAt('emulated-v1-clef-0.5.json', '[]', AFTER)
    await writeAt('emulated-v1-clef-0.5-score.json', '{}', AFTER)
    expect(await summary(handler)).toBe(generation(1))
    expect(loads).toHaveLength(1)
    expect(reloads).toHaveLength(0)
  })

  test('mtime が同じでも size が変わっていれば読み直す', async () => {
    const { handler, loads, reloads } = generationHandler()
    await summary(handler)
    await writeAt('posts.jsonl', '{"id":"1"}\n', BEFORE)
    expect(await summary(handler)).toBe(generation(2))
    expect(loads).toHaveLength(2)
    expect(reloads).toHaveLength(1)
  })

  test('labels.json と gap-events.json を書き換えても読み直さない', async () => {
    const { handler, loads, reloads } = generationHandler()
    await summary(handler)
    await writeAt('labels.json', '{"1":"event"}', AFTER)
    await writeAt('gap-events.json', '[]', AFTER)
    expect(await summary(handler)).toBe(generation(1))
    await writeAt('labels.json', '{"1":"event","2":"none"}', BEFORE)
    expect(await summary(handler)).toBe(generation(1))
    expect(loads).toHaveLength(1)
    expect(reloads).toHaveLength(0)
  })

  test('変化のあとに同時に来たアクセスは 1 回の読み直しを共有する', async () => {
    const { handler, loads, reloads } = generationHandler()
    await summary(handler)
    await utimes(join(fixture.dir, 'meta.json'), AFTER, AFTER)
    const bodies = await Promise.all([summary(handler), summary(handler), summary(handler)])
    expect(bodies).toEqual([generation(2), generation(2), generation(2)])
    expect(loads).toHaveLength(2)
    expect(reloads).toHaveLength(1)
  })

  test('読み込み中に変化しても、古い読み込みが終わるまで次の読み込みを始めない', async () => {
    const releases: Array<() => void> = []
    const gate = new Promise<void>((resolve) => {
      releases.push(resolve)
    })
    const { handler, loads, reloads } = generationHandler(gate)

    const first = summary(handler)
    await Bun.sleep(30)
    expect(loads).toHaveLength(1)

    await utimes(join(fixture.dir, 'meta.json'), AFTER, AFTER)
    const second = summary(handler)
    await Bun.sleep(30)
    // 古い読み込みがまだ終わっていない間は、次の loadApi を呼ばない（古いデータと新しいデータを同時に持たない）
    expect(loads).toHaveLength(1)
    expect(reloads).toHaveLength(1)

    for (const release of releases) release()
    expect(await first).toBe(generation(1))
    expect(await second).toBe(generation(2))
    expect(loads).toHaveLength(2)
    expect(reloads).toHaveLength(1)
  })

  test('読み直しに失敗したら 500 を返し、次のアクセスで読み直す（onReload は重ねて呼ばない）', async () => {
    const loads: string[] = []
    const reloads: string[] = []
    const handler = createViewerHandler({
      dir: fixture.dir,
      loadApi: async () => {
        loads.push('load')
        const generation = loads.length
        if (generation === 2) throw new Error('posts.jsonl が壊れています')
        return { handle: async () => Response.json({ generation }) }
      },
      onReload: () => reloads.push('reload')
    })
    expect(await summary(handler)).toBe(generation(1))

    await utimes(join(fixture.dir, 'meta.json'), AFTER, AFTER)
    const failed = await handler(request(`${BASE}/api/summary`))
    expect(failed.status).toBe(500)
    expect(await failed.text()).toBe(JSON.stringify({ error: 'posts.jsonl が壊れています' }))

    expect(await summary(handler)).toBe(generation(3))
    expect(loads).toHaveLength(3)
    expect(reloads).toHaveLength(1)
  })
})
