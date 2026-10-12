import { expect, test } from 'bun:test'
import { readWebhookBody, verifyWebhookSignature, WEBHOOK_BODY_LIMIT } from '@api/services/webhook-signature'

const encoder = new TextEncoder()
const sign = async (body: Uint8Array, timestamp: number, secret = 'test-only-secret') => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign'
  ])
  const prefix = encoder.encode(`${timestamp}.`)
  const message = new Uint8Array(prefix.length + body.length)
  message.set(prefix)
  message.set(body, prefix.length)
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))
  return `t=${timestamp},v1=${Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

test('webhook signature authenticates exact Unicode bytes', async () => {
  const body = encoder.encode('{"body":"名刺を配布します✨"}')
  const header = await sign(body, 1000)
  expect(await verifyWebhookSignature(body, header, 'test-only-secret', 1000)).toBe(true)
  expect(
    await verifyWebhookSignature(encoder.encode('{ "body":"名刺を配布します✨"}'), header, 'test-only-secret', 1000)
  ).toBe(false)
  expect(await verifyWebhookSignature(body, header, 'other-secret', 1000)).toBe(false)
})
test('webhook timestamp rejects past and future replay outside five minutes', async () => {
  const body = encoder.encode('{}')
  const header = await sign(body, 1000)
  expect(await verifyWebhookSignature(body, header, 'test-only-secret', 1300)).toBe(true)
  expect(await verifyWebhookSignature(body, header, 'test-only-secret', 1301)).toBe(false)
  expect(await verifyWebhookSignature(body, header, 'test-only-secret', 699)).toBe(false)
})
test('webhook malformed and oversized signature headers fail closed', async () => {
  const body = encoder.encode('{}')
  const header = await sign(body, 1000)
  for (const invalid of [
    null,
    '',
    `${header},t=1000`,
    `${header},${header.split(',')[1]}`,
    `${header},v0=abc`,
    't=1000,v1=abc',
    'x'.repeat(1025)
  ]) {
    expect(await verifyWebhookSignature(body, invalid, 'test-only-secret', 1000)).toBe(false)
  }
  for (const secret of ['', '   ']) {
    expect(await verifyWebhookSignature(body, header, secret, 1000)).toBe(false)
  }
})
test('webhook read enforces body size independent of content-length', async () => {
  const tooLarge = new Request('https://example.test', { method: 'POST', body: new Uint8Array(WEBHOOK_BODY_LIMIT + 1) })
  expect(await readWebhookBody(tooLarge)).toBeNull()
  const accepted = new Uint8Array(WEBHOOK_BODY_LIMIT)
  expect(await readWebhookBody(new Request('https://example.test', { method: 'POST', body: accepted }))).toEqual(
    accepted
  )
  expect(
    await readWebhookBody(
      new Request('https://example.test', {
        method: 'POST',
        headers: { 'content-length': String(WEBHOOK_BODY_LIMIT + 1) },
        body: '{}'
      })
    )
  ).toBeNull()
})
