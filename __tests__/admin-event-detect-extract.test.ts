import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import admin from '@api/routes/admin/index'
import { createExtractEvaluateRoutes } from '@api/routes/admin-event-detect-extract'
import type { Bindings } from '@api/types/bindings'
import { extractionSystem, extractionTool } from '@biccame/shared/event-detect/extraction'

const TOKEN = 'secret-token-for-test'
const BASE_URL = 'https://provider.example.invalid/gateway/'
const LOCAL_URL = 'http://localhost:15175/admin/event-detect/extract-evaluate'

const validBody = {
  model: 'claude-haiku-5-5',
  max_tokens: 4096,
  system: extractionSystem,
  messages: [{ role: 'user', content: JSON.stringify({ text: '本日からキーホルダーを配布します。' }) }],
  tools: [extractionTool],
  tool_choice: { type: 'auto' }
}

type Call = { url: string; init: RequestInit }

// DB / キュー / 通知など副作用のあるバインディングに触れたらテストを落とす。
const strictEnv = (overrides: Partial<Bindings>): object =>
  new Proxy(overrides, {
    get: (target, key) => {
      if (typeof key === 'string' && key in target) return Reflect.get(target, key)
      throw new Error(`unexpected binding access: ${String(key)}`)
    }
  })

const localEnv = (overrides: Partial<Bindings> = {}) =>
  strictEnv({ ENVIRONMENT: 'local', ANTHROPIC_BASE_URL: BASE_URL, ANTHROPIC_AUTH_TOKEN: TOKEN, ...overrides })

const post = (
  routes: ReturnType<typeof createExtractEvaluateRoutes>,
  body: unknown,
  env: object = localEnv(),
  url = LOCAL_URL
) =>
  routes.request(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    env
  )

const recordingFetcher = (respond: () => Response | Promise<Response>) => {
  const calls: Call[] = []
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return respond()
  }
  return { calls, fetcher }
}

// route.request の応答は json() の型が潰れるため、text から読み直す。
const readJson = async (response: Response): Promise<unknown> => JSON.parse(await response.text())

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

const logged: string[] = []
let errorSpy: ReturnType<typeof spyOn>
beforeEach(() => {
  logged.length = 0
  errorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '))
  })
})
afterEach(() => {
  errorSpy.mockRestore()
})

test('ローカルの正しい入力は固定プロバイダへ1回だけ送り、生の content だけを返す', async () => {
  const { calls, fetcher } = recordingFetcher(() =>
    jsonResponse({
      id: 'msg_1',
      type: 'message',
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 5 },
      content: [{ type: 'tool_use', name: 'answer', input: { events: [] } }]
    })
  )
  const response = await post(createExtractEvaluateRoutes(fetcher), validBody)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await readJson(response)).toEqual({ content: [{ type: 'tool_use', name: 'answer', input: { events: [] } }] })
  expect(calls).toHaveLength(1)
  expect(calls[0]?.url).toBe('https://provider.example.invalid/gateway/v1/messages')
  expect(calls[0]?.init.method).toBe('POST')
  expect(JSON.parse(String(calls[0]?.init.body))).toEqual(validBody)
  expect(calls[0]?.init.headers).toEqual({
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    Authorization: `Bearer ${TOKEN}`,
    'x-api-key': TOKEN
  })
  expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal)
})

test('tool_choice は auto と answer 指定のどちらも通る', async () => {
  const { calls, fetcher } = recordingFetcher(() => jsonResponse({ content: [] }))
  const routes = createExtractEvaluateRoutes(fetcher)
  expect((await post(routes, { ...validBody, tool_choice: { type: 'tool', name: 'answer' } })).status).toBe(200)
  expect((await post(routes, validBody)).status).toBe(200)
  expect(calls).toHaveLength(2)
})

test('ローカル開発環境以外・ループバック以外・http 以外は 404 でプロバイダへ送らない', async () => {
  const { calls, fetcher } = recordingFetcher(() => jsonResponse({ content: [] }))
  const routes = createExtractEvaluateRoutes(fetcher)
  const cases: Array<[string, object, string]> = [
    ['production', localEnv({ ENVIRONMENT: 'production' }), LOCAL_URL],
    ['prod', localEnv({ ENVIRONMENT: 'prod' }), LOCAL_URL],
    ['dev', localEnv({ ENVIRONMENT: 'dev' }), LOCAL_URL],
    ['unset', localEnv({ ENVIRONMENT: undefined }), LOCAL_URL],
    ['public host', localEnv(), 'http://biccame-musume.com/admin/event-detect/extract-evaluate'],
    ['staging host', localEnv(), 'http://dev.biccame-musume.com/admin/event-detect/extract-evaluate'],
    ['localhost suffix', localEnv(), 'http://localhost.evil.example/admin/event-detect/extract-evaluate'],
    ['https loopback', localEnv(), 'https://localhost:15175/admin/event-detect/extract-evaluate'],
    ['private address', localEnv(), 'http://192.168.0.10:15175/admin/event-detect/extract-evaluate']
  ]
  for (const [name, env, url] of cases) {
    const response = await post(routes, validBody, env, url)
    expect({ name, status: response.status }).toEqual({ name, status: 404 })
    expect(await readJson(response)).toEqual({ error: 'Not found' })
  }
  expect(calls).toHaveLength(0)
})

test('127.0.0.1 と [::1] のループバックも受け付ける', async () => {
  const { calls, fetcher } = recordingFetcher(() => jsonResponse({ content: [] }))
  const routes = createExtractEvaluateRoutes(fetcher)
  expect(
    (await post(routes, validBody, localEnv(), 'http://127.0.0.1:15175/admin/event-detect/extract-evaluate')).status
  ).toBe(200)
  expect(
    (await post(routes, validBody, localEnv(), 'http://[::1]:15175/admin/event-detect/extract-evaluate')).status
  ).toBe(200)
  expect(calls).toHaveLength(2)
})

test('非ローカル環境では本文が不正でも 404 で、本文の形は見せない', async () => {
  const { calls, fetcher } = recordingFetcher(() => jsonResponse({ content: [] }))
  const response = await post(createExtractEvaluateRoutes(fetcher), {}, localEnv({ ENVIRONMENT: 'prod' }))
  expect(response.status).toBe(404)
  expect(calls).toHaveLength(0)
})

test('既存の admin 認証の下に置かれ、Access JWT が無ければプロバイダへ届かない', async () => {
  const response = await admin.request(
    'http://localhost:15175/admin/event-detect/extract-evaluate',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validBody) },
    strictEnv({
      ENVIRONMENT: 'dev',
      CF_ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com',
      CF_ACCESS_AUD: 'aud',
      ANTHROPIC_BASE_URL: BASE_URL,
      ANTHROPIC_AUTH_TOKEN: TOKEN
    })
  )
  expect(response.status).toBe(401)
})

test('admin ルートにマウントされており、ローカルの不正な入力は AI を呼ばず 400 になる', async () => {
  const logSpy = spyOn(console, 'log').mockImplementation(() => {})
  try {
    const response = await admin.request(
      LOCAL_URL,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      localEnv()
    )
    expect(response.status).toBe(400)
  } finally {
    logSpy.mockRestore()
  }
})

test('不正な入力は 400 で、プロバイダへ送らない', async () => {
  const { calls, fetcher } = recordingFetcher(() => jsonResponse({ content: [] }))
  const routes = createExtractEvaluateRoutes(fetcher)
  const invalid: Array<[string, unknown]> = [
    ['empty object', {}],
    ['other model', { ...validBody, model: 'claude-opus-5-5' }],
    ['missing model', { ...validBody, model: undefined }],
    ['client base url', { ...validBody, base_url: 'https://evil.example/' }],
    ['client token', { ...validBody, api_key: 'x' }],
    ['max_tokens too large', { ...validBody, max_tokens: 4097 }],
    ['max_tokens zero', { ...validBody, max_tokens: 0 }],
    ['empty system', { ...validBody, system: '' }],
    ['system too long', { ...validBody, system: 'a'.repeat(24_001) }],
    ['two messages', { ...validBody, messages: [validBody.messages[0], validBody.messages[0]] }],
    ['assistant message', { ...validBody, messages: [{ role: 'assistant', content: 'x' }] }],
    ['no tools', { ...validBody, tools: [] }],
    ['other tool', { ...validBody, tools: [{ ...extractionTool, name: 'search' }] }],
    ['tool_choice any', { ...validBody, tool_choice: { type: 'any' } }],
    ['tool_choice other tool', { ...validBody, tool_choice: { type: 'tool', name: 'search' } }]
  ]
  for (const [name, body] of invalid) {
    const response = await post(routes, body)
    expect({ name, status: response.status }).toEqual({ name, status: 400 })
  }
  // Content-Type が JSON でない・本文が壊れている・空の場合も、検証を素通りして送信してはならない。
  const raw: Array<[string, RequestInit]> = [
    ['no content type', { method: 'POST', body: 'not json' }],
    [
      'text/plain valid json',
      { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(validBody) }
    ],
    ['json type broken body', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json' }],
    ['json type empty body', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '' }],
    ['no body', { method: 'POST' }]
  ]
  for (const [name, init] of raw) {
    const response = await routes.request(LOCAL_URL, init, localEnv())
    expect({ name, status: response.status }).toEqual({ name, status: 400 })
  }
  expect(calls).toHaveLength(0)
})

test('上限を超えるリクエストは 413 で、プロバイダへ送らない', async () => {
  const { calls, fetcher } = recordingFetcher(() => jsonResponse({ content: [] }))
  const response = await post(createExtractEvaluateRoutes(fetcher), {
    ...validBody,
    messages: [{ role: 'user', content: 'a'.repeat(100_001) }]
  })
  expect(response.status).toBe(413)
  expect(calls).toHaveLength(0)
})

test('接続先・トークンが未設定なら 502 で、送信しない', async () => {
  const { calls, fetcher } = recordingFetcher(() => jsonResponse({ content: [] }))
  const routes = createExtractEvaluateRoutes(fetcher)
  const noToken = await post(routes, validBody, localEnv({ ANTHROPIC_AUTH_TOKEN: undefined }))
  expect(noToken.status).toBe(502)
  expect(await readJson(noToken)).toEqual({ error: 'extraction_not_configured' })
  const noBase = await post(routes, validBody, localEnv({ ANTHROPIC_BASE_URL: undefined }))
  expect(noBase.status).toBe(502)
  expect(calls).toHaveLength(0)
})

test('プロバイダの HTTP エラーは 502 の種別だけを返し、リトライしない', async () => {
  const { calls, fetcher } = recordingFetcher(() =>
    jsonResponse({ error: { message: `bad ${TOKEN} ${BASE_URL}` } }, 529)
  )
  const response = await post(createExtractEvaluateRoutes(fetcher), validBody)
  expect(response.status).toBe(502)
  expect(await readJson(response)).toEqual({ error: 'extraction_http_529' })
  expect(calls).toHaveLength(1)
  expect(logged.join('\n')).not.toContain(TOKEN)
  expect(logged.join('\n')).not.toContain('provider.example.invalid')
})

test('通信例外の本文（接続先・トークン）はレスポンスにもログにも出さない', async () => {
  const { calls, fetcher } = recordingFetcher(() => {
    throw new Error(`connect failed ${BASE_URL} Bearer ${TOKEN}`)
  })
  const response = await post(createExtractEvaluateRoutes(fetcher), validBody)
  expect(response.status).toBe(502)
  const text = await response.text()
  expect(JSON.parse(text)).toEqual({ error: 'extraction_network_error' })
  expect(text).not.toContain(TOKEN)
  expect(calls).toHaveLength(1)
  expect(logged.join('\n')).not.toContain(TOKEN)
  expect(logged.join('\n')).not.toContain('provider.example.invalid')
})

test('プロバイダが時間内に応答しなければ中断して 502 を返し、リトライしない', async () => {
  const calls: Call[] = []
  const hanging = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return await new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })
  }
  const response = await post(createExtractEvaluateRoutes(hanging, 20), validBody)
  expect(response.status).toBe(502)
  expect(await readJson(response)).toEqual({ error: 'extraction_timeout' })
  expect(calls).toHaveLength(1)
})

test('プロバイダの応答が想定外の形・JSON でなければ 502 で、本文を返さない', async () => {
  const shapes: Array<() => Response> = [
    () => jsonResponse({ content: 'text' }),
    () => jsonResponse({ stop_reason: 'end_turn' }),
    () => new Response('<html>secret</html>', { status: 200 })
  ]
  for (const respond of shapes) {
    const { calls, fetcher } = recordingFetcher(respond)
    const response = await post(createExtractEvaluateRoutes(fetcher), validBody)
    expect(response.status).toBe(502)
    expect(await readJson(response)).toEqual({ error: 'extraction_invalid_response' })
    expect(calls).toHaveLength(1)
  }
})

test('評価は DB・キュー・通知・AI などのバインディングに一切触れない', async () => {
  const { fetcher } = recordingFetcher(() => jsonResponse({ content: [{ type: 'text', text: 'ok' }] }))
  // strictEnv は許可していないバインディングへのアクセスで例外を投げる。
  const response = await post(createExtractEvaluateRoutes(fetcher), validBody, localEnv())
  expect(response.status).toBe(200)
})
