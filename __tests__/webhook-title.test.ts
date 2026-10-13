import { expect, spyOn, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import {
  generateEventTitle,
  TITLE_MODEL,
  TITLE_TIMEOUT_MS,
  type TitleFetcher,
  toolTitle
} from '@api/services/webhook-title'
import type { Bindings } from '@api/types/bindings'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

// タイトル生成（webhook-title.ts）のうち、processWebhookJob を通さずに確かめられるもの。
// 実通信はしない: 通信は titleFetcher のモック、D1 は Miniflare のローカル。

const toolUse = (input: unknown) =>
  Response.json({
    content: [
      { type: 'text', text: '題を付けます。' },
      { type: 'tool_use', id: 'toolu_test', name: 'answer', input }
    ]
  })

test('定数: モデルは claude-haiku-5-5、タイムアウトは 20 秒', () => {
  expect(TITLE_MODEL).toBe('claude-haiku-5-5')
  expect(TITLE_TIMEOUT_MS).toBe(20_000)
})

test('toolTitle reads the first tool_use input as { title } and ignores text parts', () => {
  expect(toolTitle({ content: [{ type: 'tool_use', input: { title: 'ハロウィン名刺' } }] })).toBe('ハロウィン名刺')
  expect(
    toolTitle({
      content: [
        { type: 'text', text: '題は「アキバたん名刺」です' },
        { type: 'tool_use', input: { title: '夏名刺' } },
        { type: 'tool_use', input: { title: '新年名刺' } }
      ]
    })
  ).toBe('夏名刺')
  // tool_use が無い・形が違うときは undefined（テキストの題は拾わない）
  expect(toolTitle({ content: [{ type: 'text', text: '{"title": "ハロウィン名刺"}' }] })).toBeUndefined()
  expect(toolTitle({ content: [] })).toBeUndefined()
  expect(toolTitle({ content: [{ type: 'tool_use', input: { title: 3 } }] })).toBeUndefined()
  expect(toolTitle({ content: [{ type: 'tool_use', input: { title: '' } }] })).toBeUndefined()
  expect(toolTitle({ content: [{ type: 'tool_use', input: null }] })).toBeUndefined()
  expect(toolTitle({ content: [{ type: 'tool_use' }] })).toBeUndefined()
  expect(toolTitle({})).toBeUndefined()
  expect(toolTitle(null)).toBeUndefined()
  expect(toolTitle('text')).toBeUndefined()
})

const harness = async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-title-service-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  const environment = await mf.getBindings<Bindings>()
  const requests: { url: string; init: RequestInit }[] = []
  const behaviour: { reply: (init: RequestInit) => Response | Promise<Response> } = {
    reply: () => toolUse({ title: 'ハロウィン名刺' })
  }
  const fetcher: TitleFetcher = async (url, init) => {
    requests.push({ url, init })
    return behaviour.reply(init)
  }
  const env = Object.assign(environment, {
    ANTHROPIC_BASE_URL: 'https://anthropic.example.test',
    ANTHROPIC_AUTH_TOKEN: 'test-token-not-a-secret'
  })
  const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const name of migrations)
    await env.DB.exec(
      (await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' ')
    )
  return { env, fetcher, requests, behaviour, dispose: () => mf.dispose() }
}

const input = {
  category: 'limited_card' as const,
  startDay: '2026-10-19',
  stores: ['akiba' as const],
  body: '10月19日より限定名刺を配布します'
}

test('generateEventTitle: success, timeout, network and HTTP errors, and an unreadable D1 are all { ok: false } without throwing or retrying', async () => {
  const h = await harness()
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const title = (options: { timeoutMs?: number } = {}) =>
      generateEventTitle(h.env, input, { fetcher: h.fetcher, ...options })
    // 成功（D1 は空。空の手本で生成する）。AbortSignal のタイムアウトがリクエストに付く
    expect(await title()).toEqual({ ok: true, title: 'ハロウィン名刺' })
    expect(h.requests).toHaveLength(1)
    expect(h.requests[0].init.signal).toBeInstanceOf(AbortSignal)
    // 時間切れ: 応答が返らないとき、上限（ここでは短くする）で中断して失敗に倒す。再試行はしない
    h.behaviour.reply = (init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
    const before = h.requests.length
    const started = performance.now()
    expect(await title({ timeoutMs: 30 })).toEqual({ ok: false, reason: 'timeout' })
    expect(performance.now() - started).toBeLessThan(5000)
    expect(h.requests).toHaveLength(before + 1)
    // HTTP エラー（429・5xx・4xx）と通信エラー（非同期・同期）
    for (const status of [429, 500, 503, 400, 401]) {
      h.behaviour.reply = () => new Response('{}', { status })
      expect(await title(), String(status)).toEqual({ ok: false, reason: `http_${status}` })
    }
    h.behaviour.reply = () => Promise.reject(new TypeError('synthetic network failure'))
    expect(await title()).toEqual({ ok: false, reason: 'network_error' })
    h.behaviour.reply = () => {
      throw new Error('synthetic sync failure')
    }
    expect(await title()).toEqual({ ok: false, reason: 'network_error' })
    // 手本を D1 から取れない → 手本なしにはせず、通信せずに失敗扱い
    h.behaviour.reply = () => toolUse({ title: 'ハロウィン名刺' })
    const beforeD1 = h.requests.length
    const unreadable: D1Database = Object.create(h.env.DB, {
      prepare: {
        value: () => {
          throw new Error('synthetic D1 failure')
        }
      }
    })
    expect(await generateEventTitle({ ...h.env, DB: unreadable }, input, { fetcher: h.fetcher })).toEqual({
      ok: false,
      reason: 'examples_unavailable'
    })
    expect(h.requests).toHaveLength(beforeD1)
    // 警告は英語で、理由の種類だけ（本文・題・エラー本文・トークン・URL は出さない）
    const logged = warn.mock.calls.map((call) => String(call[0])).join('\n')
    expect(logged).toContain('[webhook-title] falling back to the default title: timeout')
    expect(logged).toContain('http_429')
    for (const secret of ['synthetic', '限定名刺を配布', 'test-token-not-a-secret', 'anthropic.example.test'])
      expect(logged, secret).not.toContain(secret)
  } finally {
    warn.mockRestore()
    await h.dispose()
  }
}, 60000)

test('generateEventTitle sends nothing and reports not configured when the endpoint or token is missing', async () => {
  const h = await harness()
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    for (const secrets of [
      { ANTHROPIC_BASE_URL: undefined, ANTHROPIC_AUTH_TOKEN: undefined },
      { ANTHROPIC_BASE_URL: undefined },
      { ANTHROPIC_AUTH_TOKEN: undefined },
      { ANTHROPIC_BASE_URL: '' },
      { ANTHROPIC_AUTH_TOKEN: '' }
    ]) {
      expect(await generateEventTitle({ ...h.env, ...secrets }, input, { fetcher: h.fetcher })).toEqual({
        ok: false,
        reason: 'not_configured'
      })
    }
    expect(h.requests).toHaveLength(0)
    expect(warn.mock.calls.every((call) => call[0] === 'Title generation is not configured')).toBe(true)
  } finally {
    warn.mockRestore()
    await h.dispose()
  }
}, 60000)

test('generateEventTitle strips trailing slashes from the base URL', async () => {
  const h = await harness()
  try {
    await generateEventTitle({ ...h.env, ANTHROPIC_BASE_URL: 'https://anthropic.example.test///' }, input, {
      fetcher: h.fetcher
    })
    expect(h.requests.map((request) => request.url)).toEqual(['https://anthropic.example.test/v1/messages'])
  } finally {
    await h.dispose()
  }
}, 60000)

test('generateEventTitle rejects a title that already names a different kind of D1 event', async () => {
  const h = await harness()
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const now = '2026-10-01 00:00:00'
    await h.env.DB.prepare(
      'INSERT INTO events (id,category,title,start_date,is_verified,is_preliminary,created_at,updated_at) VALUES (?,?,?,?,1,0,?,?)'
    )
      .bind(crypto.randomUUID(), 'other', '缶バッジくじ', now, now, now)
      .run()
    h.behaviour.reply = () => toolUse({ title: '缶バッジくじ' })
    // 同じ題は D1 では other。限定名刺に付けた題は別物なので採用しない（acsta は other と同じ種別）
    expect(await generateEventTitle(h.env, input, { fetcher: h.fetcher })).toEqual({
      ok: false,
      reason: 'rejected_category'
    })
    expect(await generateEventTitle(h.env, { ...input, category: 'other' }, { fetcher: h.fetcher })).toEqual({
      ok: true,
      title: '缶バッジくじ'
    })
    expect(await generateEventTitle(h.env, { ...input, category: 'acsta' }, { fetcher: h.fetcher })).toEqual({
      ok: true,
      title: '缶バッジくじ'
    })
  } finally {
    warn.mockRestore()
    await h.dispose()
  }
}, 60000)
