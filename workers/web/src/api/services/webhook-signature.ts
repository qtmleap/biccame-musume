import dayjs from 'dayjs'

export const WEBHOOK_BODY_LIMIT = 64 * 1024
const encoder = new TextEncoder()

/** 生の本文を署名検証まで変換せず、サイズ上限を読み取り中にも適用する。 */
export const readWebhookBody = async (request: Request): Promise<Uint8Array | null> => {
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > WEBHOOK_BODY_LIMIT)) return null
  if (request.body === null) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  const read = async (size: number): Promise<Uint8Array | null> => {
    const chunk = await reader.read()
    if (chunk.done) {
      const body = new Uint8Array(size)
      chunks.reduce((offset, value) => {
        body.set(value, offset)
        return offset + value.length
      }, 0)
      return body
    }
    if (size + chunk.value.length > WEBHOOK_BODY_LIMIT) {
      await reader.cancel()
      return null
    }
    chunks.push(chunk.value)
    return read(size + chunk.value.length)
  }
  try {
    return await read(0)
  } finally {
    reader.releaseLock()
  }
}

export const verifyWebhookSignature = async (
  body: Uint8Array,
  header: string | null,
  secret: string,
  now = dayjs().unix()
): Promise<boolean> => {
  if (header === null || header.length > 1024 || !secret.trim()) return false
  const match = /^t=(\d{1,12}),\s*v1=([a-fA-F0-9]{64})$/.exec(header)
  if (match === null) return false
  const [, timestamp, signature] = match
  if (Math.abs(now - Number(timestamp)) > 300) return false
  const prefix = encoder.encode(`${timestamp}.`)
  const signed = new Uint8Array(prefix.length + body.length)
  signed.set(prefix)
  signed.set(body, prefix.length)
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'verify'
  ])
  const bytes = Uint8Array.from({ length: 32 }, (_, index) =>
    Number.parseInt(signature.slice(index * 2, index * 2 + 2), 16)
  )
  return await crypto.subtle.verify('HMAC', key, bytes, signed)
}
