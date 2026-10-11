import { dayjs } from './dayjs'

export type TimelineFailureKind =
  | 'configuration'
  | 'signature'
  | 'timeline'
  | 'analysis'
  | 'discord_rejected'
  | 'rate_limited'
  | 'delivery_unknown'

export class TimelineFailure extends Error {
  constructor(
    readonly kind: TimelineFailureKind,
    readonly status?: number,
    readonly retryAfterMs?: number,
    readonly transient?: boolean
  ) {
    super(`Bot timeline failure: ${kind}`)
    this.name = 'TimelineFailure'
  }
}

const ownValue = (value: object, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (descriptor && !Object.hasOwn(descriptor, 'value')) throw new Error('Opaque transport error descriptor')
  return descriptor?.value
}
const socketCodes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ConnectionClosed',
  'ConnectionRefused',
  'FailedToOpenSocket',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET'
])
export const isTransientTransportError = (error: unknown): boolean => {
  try {
    if (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) return true
    if (!(error instanceof Error)) return false
    const code = ownValue(error, 'code')
    const cause = ownValue(error, 'cause')
    const causeCode = cause && typeof cause === 'object' ? ownValue(cause, 'code') : undefined
    const codes = [code, causeCode].filter((value): value is string => typeof value === 'string')
    if (codes.length) return codes.every((value) => socketCodes.has(value))
    const message = ownValue(error, 'message')
    if (
      error instanceof TypeError &&
      typeof message === 'string' &&
      /^(fetch failed|Failed to fetch|Network request failed|Load failed)$/i.test(message)
    )
      return true
  } catch {
    /* Unknown errors and getters are not evidence of a transient transport failure. */
  }
  return false
}

export const retryAfterMilliseconds = (
  headers: Pick<Headers, 'get'>,
  now = Date.now(),
  includeRateReset = true
): number | undefined => {
  try {
    const retryAfter = headers.get('retry-after')
    const reset = includeRateReset ? headers.get('x-rate-limit-reset') : null
    const waits: number[] = []
    if (typeof retryAfter === 'string') {
      if (/^\d+$/.test(retryAfter) && Number.isSafeInteger(Number(retryAfter)) && Number(retryAfter) > 0)
        waits.push(Number(retryAfter) * 1000)
      else if (/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(retryAfter)) {
        const date = dayjs(retryAfter).toDate()
        if (date.toUTCString() === retryAfter && date.getTime() > now) waits.push(date.getTime() - now)
      }
    }
    if (typeof reset === 'string' && /^\d+$/.test(reset) && Number.isSafeInteger(Number(reset))) {
      const remaining = Number(reset) * 1000 - now
      if (remaining > 0) waits.push(remaining)
    }
    return waits.length ? Math.min(86400000, Math.max(...waits) + 1000) : undefined
  } catch {
    return undefined
  }
}
