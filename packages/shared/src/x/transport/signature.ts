import { ClientTransaction, fetchTransactionInputs } from '../transaction'
import { TwitterTransportError } from './errors'

const TRANSACTION_CACHE_KEY = 'https://x-transaction-cache.local/inputs-v2'
const CACHE_TTL_SECONDS = 60 * 30

/** Cache a coherent, validated HTML/signer snapshot for 30 minutes. */
export const getCachedTransactionInputs = async (): Promise<{ homePageHtml: string; ondemandFileText: string }> => {
  const cache = await caches.open('x-transaction')
  const cached = await cache.match(TRANSACTION_CACHE_KEY)
  if (cached) {
    try {
      const inputs = await cached.json<{ homePageHtml: string; ondemandFileText: string }>()
      if (typeof inputs.homePageHtml === 'string' && typeof inputs.ondemandFileText === 'string') {
        ClientTransaction.create(inputs)
        return inputs
      }
    } catch {
      // Corrupt or obsolete cached inputs are replaced by fresh validated material.
    }
  }
  const inputs = await fetchTransactionInputs()
  ClientTransaction.create(inputs)
  await cache.put(
    TRANSACTION_CACHE_KEY,
    new Response(JSON.stringify(inputs), {
      headers: { 'cache-control': `max-age=${CACHE_TTL_SECONDS}`, 'content-type': 'application/json' }
    })
  )
  return inputs
}

/**
 * 署名材料のキャッシュを破棄する。次の取得で x.com から新しい材料を取り直す。
 * 破棄は後始末なので失敗しても呼び出し側の例外分類を変えないよう、ここでは決して throw しない。
 */
export const invalidateTransactionInputs = async (): Promise<void> => {
  try {
    const cache = await caches.open('x-transaction')
    await cache.delete(TRANSACTION_CACHE_KEY)
  } catch {
    console.warn('[Twitter] Failed to invalidate cached transaction inputs')
  }
}

/**
 * 署名付きリクエストに X が 403/404 を返した場合は、署名材料が古い可能性がある。
 * 403 にはアカウント制限など署名と無関係な理由もあるが、破棄しても次回に取り直すだけで害は無い。
 */
export const isSignatureRejection = (status: number): boolean => status === 403 || status === 404

export const getTransactionId = async (method: string, path: string): Promise<string> => {
  try {
    const inputs = await getCachedTransactionInputs()
    return await ClientTransaction.create(inputs).generateTransactionId(method, path)
  } catch {
    throw new TwitterTransportError('signature')
  }
}
