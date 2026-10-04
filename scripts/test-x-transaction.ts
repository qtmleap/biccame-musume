/**
 * Smoke test for workers/app/src/lib/x-transaction.
 * Fetches the X home page and current signer module and generates a sample
 * x-client-transaction-id. Exits non-zero on any error.
 */
import { ClientTransaction, fetchHomePageHtml, fetchOnDemandFileText } from '@biccame/shared/x/transaction'

const homePageHtml = await fetchHomePageHtml()
console.log(`home page html: ${homePageHtml.length} bytes`)

const ondemandFileText = await fetchOnDemandFileText(homePageHtml)
console.log(`signer module: ${ondemandFileText.length} bytes`)

const tx = ClientTransaction.create({ homePageHtml, ondemandFileText })
const id1 = await tx.generateTransactionId('POST', '/i/api/graphql/oB-5XsHNAbjvARJEc8CZFw/CreateTweet')
const id2 = await tx.generateTransactionId('POST', '/i/api/graphql/oB-5XsHNAbjvARJEc8CZFw/CreateTweet')

console.log(`x-client-transaction-id #1: ${id1}`)
console.log(`x-client-transaction-id #2: ${id2}`)
console.log(`length: ${id1.length}, distinct=${id1 !== id2}`)
