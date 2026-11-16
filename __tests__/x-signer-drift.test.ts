import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { ClientTransaction } from '@biccame/shared/x/transaction'
import { extractTwitterSiteVerification } from '@biccame/shared/x/transaction/html-extract'
import { checkSignerDrift, type ObservedRequest, SignerInputsError } from '../scripts/lib/x-signer-drift'

const homePageHtml = readFileSync(`${import.meta.dir}/x-transaction/fixtures/x-home.html`, 'utf8')
const ondemandFileText = readFileSync(`${import.meta.dir}/x-transaction/fixtures/ondemand.s.js`, 'utf8')
const transaction = ClientTransaction.create({ homePageHtml, ondemandFileText })
const NOW_MS = 1_700_000_000_000

const observe = async (method: string, url: string, signedMethod = method, signedPath = new URL(url).pathname) => ({
  method,
  url,
  transactionId: await transaction.generateTransactionId(signedMethod, signedPath, NOW_MS)
})

/** base64 を復号し、index 番目のバイトを xor して再エンコードする（パディング無し）。 */
const tamper = (transactionId: string, index: number, xor: number): string => {
  const bytes = Array.from(atob(transactionId.padEnd(Math.ceil(transactionId.length / 4) * 4, '=')), (ch) =>
    ch.charCodeAt(0)
  )
  const changed = bytes.map((byte, i) => (i === index ? byte ^ xor : byte))
  return btoa(String.fromCharCode(...changed)).replace(/=+$/, '')
}

const run = (observed: ObservedRequest[]) => checkSignerDrift({ observed, homePageHtml, ondemandFileText })

describe('checkSignerDrift', () => {
  test('ID produced by our own implementation matches', async () => {
    const observed = [
      await observe('GET', 'https://api.x.com/1.1/hashflags.json'),
      await observe('POST', 'https://api.x.com/1.1/flow/viewer.json')
    ]
    const results = await run(observed)
    expect(results.map((result) => result.verdict)).toEqual(['match', 'match'])
    expect(results[0]).toMatchObject({ method: 'GET', host: 'api.x.com', path: '/1.1/hashflags.json' })
  })

  test('query string is not part of the signed path', async () => {
    const observed = [await observe('GET', 'https://api.x.com/1.1/hashflags.json?x=1', 'GET', '/1.1/hashflags.json')]
    expect((await run(observed))[0].verdict).toBe('match')
  })

  test('jf.x.com and its subdomains are recomputed as PATCH jf', async () => {
    const observed = [
      await observe('POST', 'https://jf.x.com/onboarding/task', 'PATCH', 'jf'),
      await observe('GET', 'https://a.jf.x.com/onboarding/task', 'PATCH', 'jf')
    ]
    const results = await run(observed)
    expect(results.map((result) => result.verdict)).toEqual(['match', 'match'])
    // 報告には実際の path を残す
    expect(results[0].path).toBe('/onboarding/task')
  })

  test('a host that only ends with jf.x.com is not treated as jf', async () => {
    const observed = [await observe('POST', 'https://notjf.x.com/onboarding/task', 'PATCH', 'jf')]
    expect((await run(observed))[0].verdict).toBe('id_mismatch')
  })

  test('a changed hash byte is an id_mismatch', async () => {
    const original = await observe('GET', 'https://api.x.com/1.1/hashflags.json')
    // 先頭の乱数 + 鍵 + 時刻 4 バイトの次はハッシュ。先頭ハッシュバイトを1バイト変える。
    const keyLength = Array.from(atob(extractTwitterSiteVerification(homePageHtml))).length
    const results = await run([{ ...original, transactionId: tamper(original.transactionId, 1 + keyLength + 4, 0x01) }])
    expect(results[0].verdict).toBe('id_mismatch')
  })

  test('a changed key byte is a key_mismatch', async () => {
    const original = await observe('GET', 'https://api.x.com/1.1/hashflags.json')
    const results = await run([{ ...original, transactionId: tamper(original.transactionId, 1, 0x01) }])
    expect(results[0].verdict).toBe('key_mismatch')
  })

  test('wrong length, invalid base64 and an invalid URL are format_mismatch', async () => {
    const original = await observe('GET', 'https://api.x.com/1.1/hashflags.json')
    const results = await run([
      { ...original, transactionId: original.transactionId.slice(0, -8) },
      { ...original, transactionId: '!!!not base64!!!' },
      { ...original, transactionId: '' },
      { ...original, url: 'not a url' }
    ])
    expect(results.map((result) => result.verdict)).toEqual([
      'format_mismatch',
      'format_mismatch',
      'format_mismatch',
      'format_mismatch'
    ])
  })

  test('Math.random is restored after a normal run', async () => {
    const before = Math.random
    await run([await observe('GET', 'https://api.x.com/1.1/hashflags.json')])
    expect(Math.random).toBe(before)
  })

  test('Math.random is restored even when generateTransactionId throws', async () => {
    const before = Math.random
    const original = await observe('GET', 'https://api.x.com/1.1/hashflags.json')
    const failure = new Error('synthetic failure')
    const unpatched = ClientTransaction.prototype.generateTransactionId
    ClientTransaction.prototype.generateTransactionId = async () => {
      throw failure
    }
    try {
      await expect(run([original])).rejects.toBe(failure)
    } finally {
      ClientTransaction.prototype.generateTransactionId = unpatched
    }
    expect(Math.random).toBe(before)
  })

  test('unusable signer inputs raise SignerInputsError', async () => {
    const observed = [await observe('GET', 'https://api.x.com/1.1/hashflags.json')]
    await expect(
      checkSignerDrift({ observed, homePageHtml, ondemandFileText: 'unknown signer' })
    ).rejects.toBeInstanceOf(SignerInputsError)
    await expect(
      checkSignerDrift({ observed, homePageHtml: '<html></html>', ondemandFileText })
    ).rejects.toBeInstanceOf(SignerInputsError)
  })
})
