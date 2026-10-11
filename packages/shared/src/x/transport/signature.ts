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

export const getTransactionId = async (method: string, path: string): Promise<string> => {
  try {
    const inputs = await getCachedTransactionInputs()
    return await ClientTransaction.create(inputs).generateTransactionId(method, path)
  } catch {
    throw new TwitterTransportError('signature')
  }
}
