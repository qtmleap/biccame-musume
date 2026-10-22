import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { planCandidate } from '../scripts/lib/event-detect/d1-confirm-plan'
import {
  ConfirmBudgetError,
  type ConfirmClientFactory,
  classifyError,
  D1_CONFIRM_CALL_LIMIT,
  D1_CONFIRM_MAX_TRIES,
  itemPaths,
  runConfirm
} from '../scripts/lib/event-detect/d1-confirm-run'
import { factOf, STATE, yesResponse } from './d1-confirm-fixtures'

const directories: string[] = []
const fresh = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'd1-confirm-run-'))
  directories.push(directory)
  return directory
}
beforeEach(() => {
  directories.length = 0
})
afterEach(async () => {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })))
})

// 候補ごとに state を変えて、送った内容から項目を特定できるようにする。
const items = [0, 1, 2].flatMap((index) =>
  planCandidate(factOf({ caseId: `d1-gold-${index}`, state: `${STATE}\n候補${index}` }))
)

type Behaviour = { fail?: (itemState: string, attempt: number) => Error | null; yes?: number }
// 実通信の代わりに、beforeCall / afterCall を実クライアントと同じ順序で呼ぶスタブ。実 AI は呼ばない。
const stubClient = (sent: string[], behaviour: Behaviour = {}): ConfirmClientFactory =>
  ((options) => ({
    run: async (request, stage) => {
      await options.beforeCall(stage, request)
      sent.push(request.state)
      const failure = behaviour.fail === undefined ? null : behaviour.fail(request.state, sent.length)
      if (failure !== null) throw failure
      const response = yesResponse(request, behaviour.yes === undefined ? 0.9 : behaviour.yes)
      await options.afterCall(stage, response)
      return response
    },
    extractionFetcher: async () => {
      throw new Error('The confirm run never calls extraction')
    }
  })) satisfies ConfirmClientFactory

const options = (directory: string, createClient: ConfirmClientFactory, extra: object = {}) => ({
  items,
  directory,
  maxCalls: 50,
  maxSeconds: 60,
  decideEndpoint: 'http://127.0.0.1:15175/api/admin/event-detect/decide',
  extractionEndpoint: 'http://127.0.0.1:15175/api/admin/event-detect/extract-evaluate',
  createClient,
  ...extra
})
const ledgerLines = async (directory: string) =>
  (await readFile(join(directory, 'live-attempts.jsonl'), 'utf8')).split('\n').filter((line) => line !== '')

test('every item is sent exactly once, ledgered before sending, and saved with its duration', async () => {
  const directory = await fresh()
  const sent: string[] = []
  const summary = await runConfirm(options(directory, stubClient(sent)))
  expect(summary.completed).toBe(items.length)
  expect(sent).toHaveLength(items.length)
  expect(summary.calls).toBe(items.length)
  expect(summary.halted).toBe(false)
  const lines = await ledgerLines(directory)
  expect(lines).toHaveLength(items.length)
  expect(JSON.parse(lines[0]).stage).toBe('confirm')
  const saved = JSON.parse(await readFile(itemPaths(directory, items[0].itemId).result, 'utf8'))
  expect(saved.durationMs).toBeGreaterThanOrEqual(0)
  expect(saved.requestSha256).toBe(items[0].requestSha256)
  // 各項目が保存した送信内容は、台帳の行と1対1。
  const names = await readdir(itemPaths(directory, items[0].itemId).root)
  expect(names).toContain('call-1.json')
  expect(names).toContain('response-1.json')
})

test('a second run sends nothing that was already saved', async () => {
  const directory = await fresh()
  await runConfirm(options(directory, stubClient([])))
  const sent: string[] = []
  const summary = await runConfirm(options(directory, stubClient(sent)))
  expect(sent).toHaveLength(0)
  expect(summary.attemptedThisRun).toBe(0)
  expect(summary.calls).toBe(items.length)
})

test('a transport failure halts the run, records the duration, and the same command resumes it', async () => {
  const directory = await fresh()
  const failing = items[2].request.state
  const first = await runConfirm(
    options(
      directory,
      stubClient([], {
        fail: (state) => (state === failing ? new Error('Evaluation endpoint returned HTTP 502; requestId=x') : null)
      }),
      {
        concurrency: 1
      }
    )
  )
  expect(first.halted).toBe(true)
  expect(first.haltReason?.startsWith('transport:')).toBe(true)
  expect(first.retryable).toBe(items.length - first.completed)
  const errorRecord = JSON.parse(
    await readFile(join(itemPaths(directory, items[2].itemId).root, 'error-1.json'), 'utf8')
  )
  expect(errorRecord.kind).toBe('transport')
  expect(errorRecord.durationMs).toBeGreaterThanOrEqual(0)
  const sent: string[] = []
  const second = await runConfirm(options(directory, stubClient(sent), { concurrency: 1 }))
  expect(second.halted).toBe(false)
  expect(second.completed).toBe(items.length)
  expect(sent).not.toContain(items[0].request.state)
})

test('a non-transport error halts the run and the item is never retried', async () => {
  const directory = await fresh()
  const first = await runConfirm(
    options(
      directory,
      stubClient([], {
        fail: (state) =>
          state === items[1].request.state ? new Error('Evaluation endpoint returned HTTP 400; requestId=x') : null
      }),
      {
        concurrency: 1
      }
    )
  )
  expect(first.halted).toBe(true)
  expect(first.haltReason?.startsWith('validation:')).toBe(true)
  expect(first.failed).toBe(1)
  const sent: string[] = []
  await runConfirm(options(directory, stubClient(sent), { concurrency: 1 }))
  expect(sent).not.toContain(items[1].request.state)
})

test('an item that failed three times blocks any sending on startup', async () => {
  const directory = await fresh()
  const failEverything = stubClient([], { fail: () => new Error('Evaluation endpoint returned HTTP 502; requestId=x') })
  const runs = Array.from({ length: D1_CONFIRM_MAX_TRIES }, () => 0)
  for (const _ of runs) await runConfirm(options(directory, failEverything, { concurrency: 1 }))
  const sent: string[] = []
  const summary = await runConfirm(options(directory, stubClient(sent), { concurrency: 1 }))
  expect(sent).toHaveLength(0)
  expect(summary.halted).toBe(true)
  expect(summary.haltReason).toContain('already failed 3 times')
})

test('an interrupted attempt counts as one failure', async () => {
  const directory = await fresh()
  await runConfirm(options(directory, stubClient([]), { only: new Set([items[0].itemId]) }))
  const paths = itemPaths(directory, items[1].itemId)
  await runConfirm(options(directory, stubClient([]), { only: new Set<string>() }))
  await writeFile(paths.inflight, JSON.stringify({ startedAt: '2026-10-22T10:00:00.000Z' }))
  const sent: string[] = []
  await runConfirm(options(directory, stubClient(sent), { concurrency: 1 }))
  const error = JSON.parse(await readFile(join(paths.root, 'error-1.json'), 'utf8'))
  expect(error.kind).toBe('interrupted')
  expect(sent).toContain(items[1].request.state)
})

test('the call budget is enforced and stops the run as a budget halt', async () => {
  const directory = await fresh()
  const summary = await runConfirm(options(directory, stubClient([]), { maxCalls: 2, concurrency: 1 }))
  expect(summary.calls).toBe(2)
  expect(summary.halted).toBe(true)
  expect(summary.haltReason?.startsWith('budget:')).toBe(true)
  expect(await ledgerLines(directory)).toHaveLength(2)
})

test('the pilot scope sends only the selected items', async () => {
  const directory = await fresh()
  const sent: string[] = []
  const summary = await runConfirm(
    options(directory, stubClient(sent), { only: new Set([items[0].itemId, items[1].itemId]) })
  )
  expect(sent).toHaveLength(2)
  expect(summary.scope).toBe(2)
  expect(summary.completed).toBe(2)
})

test('a changed plan, an oversized limit and a stale lock all refuse to send', async () => {
  const directory = await fresh()
  await runConfirm(options(directory, stubClient([]), { only: new Set<string>() }))
  await expect(runConfirm({ ...options(directory, stubClient([])), items: items.slice(1) })).rejects.toThrow(
    'Confirm plan changed'
  )
  await expect(runConfirm(options(directory, stubClient([]), { maxCalls: D1_CONFIRM_CALL_LIMIT + 1 }))).rejects.toThrow(
    'Invalid confirm call limit'
  )
  await expect(runConfirm(options(directory, stubClient([]), { concurrency: 3 }))).rejects.toThrow(
    'Invalid confirm concurrency'
  )
  // 古いロックは消さずに止まる。
  await writeFile(join(directory, '.run.lock'), '{"pid":1}')
  const sent: string[] = []
  await expect(runConfirm(options(directory, stubClient(sent)))).rejects.toThrow()
  expect(sent).toHaveLength(0)
  expect(await Bun.file(join(directory, '.run.lock')).exists()).toBe(true)
})

test('classifyError separates resumable transport failures from everything else', () => {
  expect(classifyError(new Error('Evaluation endpoint returned HTTP 502; requestId=x'))).toBe('transport')
  expect(classifyError(new Error('Evaluation endpoint returned HTTP 429; requestId=x'))).toBe('transport')
  expect(classifyError(new Error('Evaluation transport failure: {"kind":"deadline"}'))).toBe('transport')
  expect(classifyError(new Error('Invalid evaluation JSON response; requestId=x'))).toBe('transport')
  expect(classifyError(new Error('Evaluation endpoint returned HTTP 400; requestId=x'))).toBe('validation')
  expect(classifyError(new Error('Invalid Clef evaluation response'))).toBe('validation')
  expect(classifyError(new ConfirmBudgetError('Confirm call budget exhausted'))).toBe('budget')
})
