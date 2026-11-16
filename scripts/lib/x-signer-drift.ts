/**
 * X 自身のクライアントが実際に送った x-client-transaction-id と、自前実装の出力を突き合わせる純粋ロジック。
 * ネットワークにも Playwright にも依存しない。観測値の収集は scripts/check-x-signer-drift.ts が担う。
 *
 * 照合の手順（1件ごと）:
 *   1. base64（パディング無し）を復号し、先頭バイトを乱数 r、残りを r で XOR して平文を得る。
 *   2. 平文は keyBytes + 時刻4バイト（LE）+ ハッシュ16バイト + 追加1バイト。長さが合わなければ format_mismatch。
 *   3. 先頭の keyBytes が twitter-site-verification の復号結果と違えば key_mismatch。
 *   4. 時刻を nowMs に戻し、Math.random を () => r / 256 に差し替えて generateTransactionId を呼び、文字列を比較する。
 */
import { ClientTransaction } from '@biccame/shared/x/transaction'
import { extractTwitterSiteVerification } from '@biccame/shared/x/transaction/html-extract'

// packages/shared/src/x/transaction/transaction.ts の TWITTER_EPOCH_SEC と同じ値。ずれればテストの match が落ちる。
const TWITTER_EPOCH_SEC = 1682924400
const TIME_BYTES = 4
const HASH_BYTES = 16
const ADDITIONAL_BYTES = 1
// jf.x.com 宛ては X のコードが sign('jf', 'PATCH') で計算している。
const JF_HOST = 'jf.x.com'
const JF_PATH = 'jf'
const JF_METHOD = 'PATCH'

export type ObservedRequest = { method: string; url: string; transactionId: string }

export type DriftVerdict = 'match' | 'key_mismatch' | 'format_mismatch' | 'id_mismatch'

export type DriftCheckResult = {
  method: string
  host: string
  /** 観測したリクエストの pathname。jf 宛てでも署名に使った 'jf' ではなく実際の path を持つ。 */
  path: string
  transactionId: string
  verdict: DriftVerdict
}

/** 署名材料（HTML・署名モジュール）から ClientTransaction を作れなかったことを表す。X 側の構造変更のサイン。 */
export class SignerInputsError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = 'SignerInputsError'
  }
}

export type DriftCheckInput = {
  observed: ObservedRequest[]
  homePageHtml: string
  ondemandFileText: string
}

const isJfHost = (host: string): boolean => host === JF_HOST || host.endsWith(`.${JF_HOST}`)

const decodeBase64 = (value: string): number[] | null => {
  try {
    const padded = value.padEnd(Math.ceil(value.length / 4) * 4, '=')
    return Array.from(atob(padded), (ch) => ch.charCodeAt(0))
  } catch {
    return null
  }
}

const readLittleEndian = (bytes: number[]): number =>
  bytes.reduce((acc, byte, index) => acc + byte * 2 ** (8 * index), 0)

/** Math.random を固定関数に差し替えて fn を実行する。例外が出ても必ず元に戻す。 */
const withFixedRandom = async <T>(random: number, fn: () => Promise<T>): Promise<T> => {
  const original = Math.random
  Math.random = () => random / 256
  try {
    return await fn()
  } finally {
    Math.random = original
  }
}

const checkOne = async (
  request: ObservedRequest,
  transaction: ClientTransaction,
  keyBytes: number[]
): Promise<DriftCheckResult> => {
  const parsed = URL.canParse(request.url) ? new URL(request.url) : null
  const base = {
    method: request.method,
    host: parsed ? parsed.hostname : '',
    path: parsed ? parsed.pathname : request.url,
    transactionId: request.transactionId
  }
  const raw = decodeBase64(request.transactionId)
  const expectedLength = 1 + keyBytes.length + TIME_BYTES + HASH_BYTES + ADDITIONAL_BYTES
  if (!parsed || !raw || raw.length !== expectedLength) return { ...base, verdict: 'format_mismatch' }

  const random = raw[0]
  const plain = raw.slice(1).map((byte) => byte ^ random)
  if (keyBytes.some((byte, index) => plain[index] !== byte)) return { ...base, verdict: 'key_mismatch' }

  const timeStart = keyBytes.length
  const seconds = readLittleEndian(plain.slice(timeStart, timeStart + TIME_BYTES))
  const nowMs = (seconds + TWITTER_EPOCH_SEC) * 1000
  const jf = isJfHost(base.host)
  const regenerated = await withFixedRandom(random, () =>
    transaction.generateTransactionId(jf ? JF_METHOD : request.method, jf ? JF_PATH : base.path, nowMs)
  )
  return { ...base, verdict: regenerated === request.transactionId ? 'match' : 'id_mismatch' }
}

/**
 * 観測した署名付きリクエストを1件ずつ自前実装と突き合わせる。
 * Math.random はグローバルなので、並列にせず逐次で処理する。
 * 署名材料から ClientTransaction を作れない場合は SignerInputsError を投げる。
 */
export const checkSignerDrift = async (input: DriftCheckInput): Promise<DriftCheckResult[]> => {
  const { transaction, keyBytes } = (() => {
    try {
      const key = extractTwitterSiteVerification(input.homePageHtml)
      return {
        transaction: ClientTransaction.create({
          homePageHtml: input.homePageHtml,
          ondemandFileText: input.ondemandFileText
        }),
        keyBytes: Array.from(atob(key), (ch) => ch.charCodeAt(0))
      }
    } catch (error) {
      throw new SignerInputsError(error)
    }
  })()
  const results: DriftCheckResult[] = []
  for (const request of input.observed) results.push(await checkOne(request, transaction, keyBytes))
  return results
}
