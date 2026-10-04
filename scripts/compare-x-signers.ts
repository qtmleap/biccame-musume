import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ClientTransaction } from '@biccame/shared/x/transaction'

// 旧モジュールは事前に読込済みの0.1.0を渡す。公開縮小fixtureと固定時刻/乱数だけを使う。
const legacyPath = process.argv.find((argument) => argument.startsWith('--legacy-module='))?.slice(16)
if (!legacyPath) throw new Error('Pass the inspected legacy signer module with --legacy-module=')
const legacy = await import(resolve(legacyPath))
const root = resolve(import.meta.dirname, '..')
const now = 1_700_000_000_000
const fixtures = [
  { html: 'x-home.html', script: 'ondemand.s.js' },
  { html: 'x-web-home.html', script: 'x-web-sign.js' }
]
const originalRandom = Math.random
const golden: { html: string; script: string; method: string; path: string; nowMs: number; random: number; transactionId: string }[] = []
try {
  Math.random = () => 0.5
  for (const fixture of fixtures) {
    const html = readFileSync(resolve(root, '__tests__/x-transaction/fixtures', fixture.html), 'utf8')
    const script = readFileSync(resolve(root, '__tests__/x-transaction/fixtures', fixture.script), 'utf8')
    const oldSigner = new legacy.Transaction(html, script)
    const newSigner = ClientTransaction.create({ homePageHtml: html, ondemandFileText: script })
    for (const [method, path] of [
      ['GET', '/i/api/graphql/rkp6b4vtR9u7v3naGoOzUQ/SearchTimeline'],
      ['POST', '/i/api/graphql/oB-5XsHNAbjvARJEc8CZFw/CreateTweet']
    ]) {
      const before: string = await oldSigner.generateTransactionId(method, path, Math.floor((now - 1_682_924_400_000) / 1000))
      const after = await newSigner.generateTransactionId(method, path, now)
      assert.equal(after, before)
      golden.push({ ...fixture, method, path, nowMs: now, random: 0.5, transactionId: before })
    }
  }
} finally { Math.random = originalRandom }
if (process.argv.includes('--write-golden')) {
  writeFileSync(resolve(root, '__tests__/x-transaction/fixtures/signer-compatibility.json'), `${JSON.stringify(golden, null, 2)}\n`, { flag: 'wx' })
}
console.log(`Signer comparison passed: ${golden.length} deterministic cases match legacy 0.1.0 byte for byte`)
