import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { D1_GOLD_CALL_LIMIT, openD1GoldLedger } from '../scripts/lib/event-detect/d1-gold-ledger'
import { casePaths, type D1GoldClientFactory, runGoldCohort } from '../scripts/lib/event-detect/d1-gold-run'
import { goalHash } from '../scripts/lib/event-detect/goal-pipeline-module'
import { answerAll, goldCase, SENTINEL, stubExtractionBody, stubModule } from './d1-gold-fixtures'

const directories: string[] = []
const fresh = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'd1-gold-run-'))
  directories.push(directory)
  return directory
}
beforeEach(() => {
  directories.length = 0
})
afterEach(async () => {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })))
})

type Behaviour = { failOn?: (caseText: string, stage: string, count: number) => Error | null }
// 実通信の代わりに、beforeCall/afterCall を実クライアントと同じ順序で呼ぶスタブ。
const stubClient = (log: string[], behaviour: Behaviour = {}): D1GoldClientFactory =>
  ((options) => {
    const count = { n: 0 }
    return {
      run: async (request, stage) => {
        count.n += 1
        await options.beforeCall(stage, request)
        const failure = behaviour.failOn === undefined ? null : behaviour.failOn(request.state, stage, count.n)
        if (failure !== null) throw failure
        const response = answerAll(request)
        await options.afterCall(stage, response)
        log.push(`${stage}:${request.state.slice(0, 20)}`)
        return response
      },
      extractionFetcher: async (_url, init) => {
        await options.beforeCall('extract', JSON.parse(String(init.body)))
        const body = stubExtractionBody(1)
        await options.afterCall('extract', body)
        log.push('extract')
        return Response.json(body)
      }
    }
  }) satisfies D1GoldClientFactory

const options = (directory: string, cases: ReturnType<typeof goldCase>[], extra: object = {}) => ({
  module: stubModule(),
  cases,
  directory,
  maxCalls: 50,
  maxSeconds: 60,
  decideEndpoint: 'http://127.0.0.1:15175/api/admin/event-detect/decide',
  extractionEndpoint: 'http://127.0.0.1:15175/api/admin/event-detect/extract-evaluate',
  ...extra
})

test('model input never contains gold strings, and the saved input file is the public post only', async () => {
  const directory = await fresh()
  const sample = goldCase(1)
  const tainted = { ...sample, events: [{ ...sample.events[0], title: SENTINEL, stores: ['honten'] }] }
  const log: string[] = []
  await runGoldCohort(options(directory, [tainted], { createClient: stubClient(log) }))
  const root = casePaths(directory, tainted.caseId).root
  const files = await readdir(root)
  for (const name of files.filter((file) => file.startsWith('call-') || file === 'input.json'))
    expect(await readFile(join(root, name), 'utf8')).not.toContain(SENTINEL)
  const input = JSON.parse(await readFile(join(root, 'input.json'), 'utf8'))
  expect(input).toEqual(tainted.post)
  expect(input).not.toHaveProperty('events')
})

test('a completed run saves per-post artifacts, one ledger line per call and the exact call count', async () => {
  const directory = await fresh()
  const cases = [goldCase(1), goldCase(2)]
  const summary = await runGoldCohort(options(directory, cases, { createClient: stubClient([]) }))
  expect(summary.completed).toBe(2)
  expect(summary.halted).toBe(false)
  const ledger = (await readFile(join(directory, 'live-attempts.jsonl'), 'utf8')).trim().split('\n')
  expect(ledger).toHaveLength(summary.calls)
  expect(summary.calls).toBeGreaterThanOrEqual(6)
  const stored = JSON.parse(await readFile(casePaths(directory, cases[0].caseId).result, 'utf8'))
  expect(stored.calls).toBeGreaterThanOrEqual(3)
})

test('a transport failure halts the whole run, and resuming does not resend saved posts', async () => {
  const directory = await fresh()
  const cases = [goldCase(1), goldCase(2), goldCase(3), goldCase(4)]
  const fail = { on: true }
  const log: string[] = []
  const flaky = stubClient(log, {
    failOn: (text, stage) =>
      fail.on && stage === 'count' && text.includes('3') ? new Error('Evaluation endpoint returned HTTP 502') : null
  })
  const first = await runGoldCohort(options(directory, cases, { createClient: flaky, concurrency: 1 }))
  expect(first.halted).toBe(true)
  expect(first.haltReason).toContain('HTTP 502')
  expect(first.completed).toBeLessThan(4)
  const callsAfterFirst = first.calls
  fail.on = false
  const second = await runGoldCohort(options(directory, cases, { createClient: stubClient(log), concurrency: 1 }))
  expect(second.completed).toBe(4)
  // 保存済みの投稿は再送されない。台帳には新しい呼び出しだけが足される。
  expect(second.calls - callsAfterFirst).toBeLessThan(callsAfterFirst + 4 * 4)
  const ledger = (await readFile(join(directory, 'live-attempts.jsonl'), 'utf8')).trim().split('\n')
  expect(ledger).toHaveLength(second.calls)
  const finished = first.completed
  const resumedPosts = second.completed - finished
  expect(resumedPosts).toBe(4 - finished)
})

test('a post that failed three times with transport errors is recorded as an error and not retried a fourth time', async () => {
  const directory = await fresh()
  const cases = [goldCase(1)]
  const always = stubClient([], { failOn: (_text, stage) => (stage === 'count' ? new Error('network down') : null) })
  const runs = [
    await runGoldCohort(options(directory, cases, { createClient: always })),
    await runGoldCohort(options(directory, cases, { createClient: always })),
    await runGoldCohort(options(directory, cases, { createClient: always })),
    await runGoldCohort(options(directory, cases, { createClient: always }))
  ]
  expect(runs.map((run) => run.halted)).toEqual([true, true, true, false])
  expect(runs[3].attemptedThisRun).toBe(0)
  expect(runs[3].failed).toBe(1)
  expect(runs[3].retryable).toBe(0)
})

test('a validation failure is recorded, not retried and does not halt the run', async () => {
  const directory = await fresh()
  const cases = [goldCase(1), goldCase(2)]
  const client = stubClient([], {
    failOn: (text, stage) =>
      stage === 'count' && text.includes('1') ? new Error('Incomplete pipeline response') : null
  })
  const summary = await runGoldCohort(options(directory, cases, { createClient: client, concurrency: 1 }))
  expect(summary.halted).toBe(false)
  expect(summary.completed).toBe(1)
  expect(summary.failed).toBe(1)
})

test('the call budget stops the run before an over-limit send and keeps the ledger at the limit', async () => {
  const directory = await fresh()
  const cases = [goldCase(1), goldCase(2), goldCase(3)]
  const summary = await runGoldCohort(
    options(directory, cases, { createClient: stubClient([]), maxCalls: 7, concurrency: 1 })
  )
  expect(summary.halted).toBe(true)
  expect(summary.calls).toBe(7)
  const ledger = (await readFile(join(directory, 'live-attempts.jsonl'), 'utf8')).trim().split('\n')
  expect(ledger).toHaveLength(7)
  expect(JSON.parse(ledger[0])).toMatchObject({ sequence: 1, stage: expect.any(String), inputHash: expect.any(String) })
})

test('the ledger takes an exclusive lock and rejects a second process, a bad limit and a corrupt file', async () => {
  const directory = await fresh()
  const first = await openD1GoldLedger(directory, 10)
  await expect(openD1GoldLedger(directory, 10)).rejects.toThrow()
  await first.reserve({ stage: 'count', caseId: 'a', inputHash: goalHash('x'), moduleSha256: 'm' })
  expect(first.used()).toBe(1)
  await first.close()
  const resumed = await openD1GoldLedger(directory, 10)
  expect(resumed.used()).toBe(1)
  await resumed.close()
  await expect(openD1GoldLedger(directory, D1_GOLD_CALL_LIMIT + 1)).rejects.toThrow('Invalid D1 gold call limit')
  await expect(openD1GoldLedger(directory, 0)).rejects.toThrow()
  await Bun.write(join(directory, 'live-attempts.jsonl'), '{"sequence":2}\n')
  await expect(openD1GoldLedger(directory, 10)).rejects.toThrow()
})

test('a changed cohort is refused on resume', async () => {
  const directory = await fresh()
  await runGoldCohort(options(directory, [goldCase(1)], { createClient: stubClient([]) }))
  await expect(
    runGoldCohort(options(directory, [goldCase(1), goldCase(2)], { createClient: stubClient([]) }))
  ).rejects.toThrow('D1 gold cohort changed')
})

test('two concurrent reservations keep ledger lines in sequence order and a resume accepts them', async () => {
  const directory = await fresh()
  const ledger = await openD1GoldLedger(directory, 20)
  const attempt = (n: number) => ({ stage: 'count', caseId: `c${n}`, inputHash: goalHash(n), moduleSha256: 'm' })
  await Promise.all(Array.from({ length: 12 }, (_, index) => ledger.reserve(attempt(index))))
  await ledger.close()
  const rows = (await readFile(join(directory, 'live-attempts.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  expect(rows.map((row) => row.sequence)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1))
  const resumed = await openD1GoldLedger(directory, 20)
  expect(resumed.used()).toBe(12)
  await resumed.close()
})
