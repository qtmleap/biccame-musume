import { expect, spyOn, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ClientTransaction } from '@biccame/shared/x/transaction'
import { z } from 'zod'

const fixtureRoot = resolve(import.meta.dirname, 'fixtures')
const parsed = z
  .array(
    z.strictObject({
      html: z.enum(['x-home.html', 'x-web-home.html']),
      script: z.enum(['ondemand.s.js', 'x-web-sign.js']),
      method: z.enum(['GET', 'POST']),
      path: z.string().nonempty(),
      nowMs: z.number().int(),
      random: z.number().min(0).max(1),
      transactionId: z.string().nonempty()
    })
  )
  .length(4)
  .safeParse(JSON.parse(readFileSync(resolve(fixtureRoot, 'signer-compatibility.json'), 'utf8')))
if (!parsed.success) throw new Error('Invalid public signer compatibility fixture')

// legacy @qtmleap/x-transaction@0.1.0と実測比較した固定値。認証情報は含まない。
test.each(parsed.data)('shared signer preserves legacy bytes for $html $method $path', async (fixture) => {
  const random = spyOn(Math, 'random').mockReturnValue(fixture.random)
  try {
    const transaction = ClientTransaction.create({
      homePageHtml: readFileSync(resolve(fixtureRoot, fixture.html), 'utf8'),
      ondemandFileText: readFileSync(resolve(fixtureRoot, fixture.script), 'utf8')
    })
    expect(await transaction.generateTransactionId(fixture.method, fixture.path, fixture.nowMs)).toBe(
      fixture.transactionId
    )
  } finally {
    random.mockRestore()
  }
})
