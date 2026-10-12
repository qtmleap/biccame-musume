import { expect, spyOn, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import webhookRoutes from '@api/routes/webhook-x'
import dayjs from 'dayjs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

const secret = 'local-test-signing-secret'
const sign = async (body: string) => {
  const timestamp = dayjs().unix()
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign'
  ])
  const hash = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)))
  return `t=${timestamp},v1=${Array.from(hash, (value) => value.toString(16).padStart(2, '0')).join('')}`
}
const tweetId = ((BigInt(dayjs().valueOf() - 60_000) - 1288834974657n) << 22n).toString()
const payload = (text: string, id = tweetId) =>
  JSON.stringify({
    body: text,
    tag: `tweet-${id}`,
    registration_ids: ['must-not-be-stored'],
    data: { body: text, type: 'tweet', tag: `tweet-${id}`, uri: `/bic_akiba/status/${id}` }
  })

test('webhook uses the single public path and limits the CSRF exemption to its POST requests', async () => {
  const entrypoint = await readFile('workers/web/src/index.ts', 'utf8')
  expect(entrypoint).toContain("app.route('/api/webhook', webhookX)")
  expect(entrypoint).toContain("if (c.req.method === 'POST' && c.req.path === '/api/webhook') return next()")
  expect(entrypoint).toContain('return csrfProtection(c, next)')
  expect(entrypoint).not.toContain('/api/webhooks/x')
})

test('webhook validates signature before parsing or touching persistence', async () => {
  const body = '{broken JSON'
  const response = await webhookRoutes.request(
    '/',
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'Webhook-Signature': 't=1,v1=bad' }, body },
    { WEBHOOK_SECRET_KEY: secret }
  )
  expect(response.status).toBe(401)
  const missing = await webhookRoutes.request(
    '/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    },
    {}
  )
  expect(missing.status).toBe(503)
  for (const value of ['', '   ']) {
    const empty = await webhookRoutes.request('/', { method: 'POST', body }, { WEBHOOK_SECRET_KEY: value })
    expect(empty.status).toBe(503)
  }
  const invalid = await webhookRoutes.request(
    '/',
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'Webhook-Signature': await sign(body) }, body },
    { WEBHOOK_SECRET_KEY: secret }
  )
  expect(invalid.status).toBe(400)
})

test('webhook rejects the obsolete signature header instead of accepting an alias', async () => {
  const body = '{broken JSON'
  const response = await webhookRoutes.request(
    '/',
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': await sign(body) }, body },
    { WEBHOOK_SECRET_KEY: secret }
  )
  expect(response.status).toBe(401)
})

test('webhook body read failures return a retryable response without disclosing internal details', async () => {
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => controller.error(new Error('synthetic-private-read-error'))
  })
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const response = await webhookRoutes.request(
      new Request('https://example.invalid/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      }),
      undefined,
      { WEBHOOK_SECRET_KEY: secret }
    )
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const responseBody: unknown = await response.json()
    expect(responseBody).toEqual({ message: 'Webhook temporarily unavailable' })
    expect(error.mock.calls).toEqual([['[webhook-x] failed to accept delivery']])
  } finally {
    error.mockRestore()
  }
})

test('webhook oversized bodies are rejected before signature verification or persistence', async () => {
  const response = await webhookRoutes.request(
    '/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: new Uint8Array(64 * 1024 + 1)
    },
    { WEBHOOK_SECRET_KEY: secret }
  )
  expect(response.status).toBe(413)
  const responseBody: unknown = await response.json()
  expect(responseBody).toEqual({ message: 'Payload too large' })
})

test('keyword rejection persists only normalized post and does not need AI or a queue', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-route-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const DB = await mf.getD1Database('DB')
    const directories = (await readdir('prisma/migrations', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const directory of directories)
      await DB.exec(
        (await readFile(`prisma/migrations/${directory}/migration.sql`, 'utf8'))
          .replace(/^--.*$/gm, '')
          .replace(/\n/g, ' ')
      )
    const body = payload('本日もご来店ありがとうございます')
    const response = await webhookRoutes.request(
      '/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Webhook-Signature': await sign(body) },
        body
      },
      { WEBHOOK_SECRET_KEY: secret, DB }
    )
    expect(response.status).toBe(200)
    const row = await DB.prepare('SELECT post_json,status,notification_status FROM webhook_event_jobs').first<{
      post_json: string
      status: string
      notification_status: string
    }>()
    expect(row?.status).toBe('ignored')
    expect(row?.notification_status).toBe('skipped')
    expect(row?.post_json).not.toContain('registration_ids')
    expect(row?.post_json).not.toContain('must-not-be-stored')
    const candidateId = (BigInt(tweetId) + 1n).toString()
    const candidateBody = payload('本日より限定名刺を先着で配布します', candidateId)
    const candidateSignature = await sign(candidateBody)
    const queued: string[] = []
    const environment = {
      WEBHOOK_SECRET_KEY: secret,
      DB,
      EVENT_DETECTION_QUEUE: {
        send: async (message: { postId: string }) => {
          queued.push(message.postId)
        }
      }
    }
    const deliveries = await Promise.all(
      [0, 1].map(() =>
        webhookRoutes.request(
          '/',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Webhook-Signature': candidateSignature },
            body: candidateBody
          },
          environment
        )
      )
    )
    expect(deliveries.map((delivery) => delivery.status)).toEqual([202, 202])
    expect(
      await DB.prepare('SELECT count(*) AS total FROM webhook_event_jobs WHERE post_id=?')
        .bind(candidateId)
        .first<number>('total')
    ).toBe(1)
    expect(queued).toEqual([candidateId, candidateId])
    const failureId = (BigInt(tweetId) + 2n).toString()
    const failureBody = payload('本日より限定名刺を先着で配布します', failureId)
    const failureSignature = await sign(failureBody)
    const failure = await webhookRoutes.request(
      '/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Webhook-Signature': failureSignature },
        body: failureBody
      },
      {
        WEBHOOK_SECRET_KEY: secret,
        DB,
        EVENT_DETECTION_QUEUE: {
          send: async () => {
            throw new Error('synthetic-upstream-detail')
          }
        }
      }
    )
    expect(failure.status).toBe(503)
    expect(await failure.text()).not.toContain('synthetic-upstream-detail')
    const retry = await webhookRoutes.request(
      '/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Webhook-Signature': failureSignature },
        body: failureBody
      },
      environment
    )
    expect(retry.status).toBe(202)
  } finally {
    await mf.dispose()
  }
}, 60000)
