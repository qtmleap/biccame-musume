export type TwitterTransportFailureKind =
  | 'missing_credentials'
  | 'signature'
  | 'rate_limit'
  | 'rejected'
  | 'delivery_unknown'
  | 'network'
  | 'unexpected_response'

const TRANSPORT_FAILURE_MESSAGES: Record<TwitterTransportFailureKind, string> = {
  missing_credentials: 'X Cookie configuration is missing',
  signature: 'X signature acquisition or KEY_BYTE validation failed',
  rate_limit: 'X rate limit reached',
  rejected: 'X request was rejected',
  delivery_unknown: 'X post delivery could not be confirmed; do not automatically resend',
  network: 'X read request failed',
  unexpected_response: 'X read response format could not be verified'
}

/** API本文・認証情報・内部例外を持ち込まないtransport失敗分類。 */
export class TwitterTransportError extends Error {
  constructor(
    readonly kind: TwitterTransportFailureKind,
    readonly status?: number
  ) {
    super(`${TRANSPORT_FAILURE_MESSAGES[kind]}${status === undefined ? '' : ` (HTTP ${status})`}`)
    this.name = 'TwitterTransportError'
  }
}
