import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ClientTransaction } from '../../src/lib/x-transaction/transaction'

const fixtureDir = resolve(import.meta.dir, 'fixtures')
const homePageHtml = readFileSync(resolve(fixtureDir, 'x-home.html'), 'utf-8')
const ondemandFileText = readFileSync(resolve(fixtureDir, 'ondemand.s.js'), 'utf-8')

const decodeBase64Length = (s: string): number => {
  // pad to multiple of 4 since the lib strips trailing '='
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  return atob(padded).length
}

afterEach(() => {
  mock.restore()
})

describe('ClientTransaction', () => {
  test('create() succeeds against live-captured fixtures', () => {
    const tx = ClientTransaction.create({ homePageHtml, ondemandFileText })
    expect(tx).toBeInstanceOf(ClientTransaction)
  })

  test('generateTransactionId returns a 94-char base64 token', async () => {
    const tx = ClientTransaction.create({ homePageHtml, ondemandFileText })
    const id = await tx.generateTransactionId('POST', '/i/api/graphql/queryId/CreateTweet')
    expect(id.length).toBe(94)
    // 70-byte payload before base64 (1 + keyBytes + 4 + 16 + 1 = 1 + 32 + 21 = 54... actually variable)
    // verify it decodes without error and isn't empty
    expect(decodeBase64Length(id)).toBeGreaterThan(20)
  })

  test('two consecutive calls produce different ids (random byte differs)', async () => {
    const tx = ClientTransaction.create({ homePageHtml, ondemandFileText })
    const a = await tx.generateTransactionId('POST', '/some/path')
    const b = await tx.generateTransactionId('POST', '/some/path')
    expect(a).not.toBe(b)
  })

  test('with stubbed Math.random + fixed time, output is deterministic', async () => {
    spyOn(Math, 'random').mockReturnValue(0.5)
    const tx = ClientTransaction.create({ homePageHtml, ondemandFileText })
    const a = await tx.generateTransactionId('POST', '/i/api/graphql/queryId/CreateTweet', 1_700_000_000_000)
    const b = await tx.generateTransactionId('POST', '/i/api/graphql/queryId/CreateTweet', 1_700_000_000_000)
    expect(a).toBe(b)
  })

  test('different paths produce different transaction ids', async () => {
    spyOn(Math, 'random').mockReturnValue(0.5)
    const tx = ClientTransaction.create({ homePageHtml, ondemandFileText })
    const a = await tx.generateTransactionId('POST', '/i/api/graphql/A/CreateTweet', 1_700_000_000_000)
    const b = await tx.generateTransactionId('POST', '/i/api/graphql/B/CreateTweet', 1_700_000_000_000)
    expect(a).not.toBe(b)
  })

  test('different methods produce different transaction ids', async () => {
    spyOn(Math, 'random').mockReturnValue(0.5)
    const tx = ClientTransaction.create({ homePageHtml, ondemandFileText })
    const post = await tx.generateTransactionId('POST', '/api/x', 1_700_000_000_000)
    const get = await tx.generateTransactionId('GET', '/api/x', 1_700_000_000_000)
    expect(post).not.toBe(get)
  })
})
