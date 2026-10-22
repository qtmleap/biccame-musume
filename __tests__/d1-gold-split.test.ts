import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  D1_GOLD_CALL_LIMIT,
  D1_GOLD_SPLIT_CALL_LIMIT,
  openD1GoldLedger
} from '../scripts/lib/event-detect/d1-gold-ledger'
import { type D1GoldClientFactory, runGoldCohort } from '../scripts/lib/event-detect/d1-gold-run'
import { sha256Hex } from '../scripts/lib/event-detect/d1-gold-schema'
import {
  buildSplit,
  loadExtraStartPlan,
  loadSidelinedCases,
  loadSplit,
  parseSplitNames,
  planExtraStartPost,
  prepareExtraStartDirectory,
  resolveSplitCases
} from '../scripts/lib/event-detect/d1-gold-split'
import { answerAll, goldCase, stubExtractionBody, stubModule } from './d1-gold-fixtures'

const directories: string[] = []
const fresh = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'd1-gold-split-'))
  directories.push(directory)
  return directory
}
beforeEach(() => {
  directories.length = 0
})
afterEach(async () => {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })))
})

const main = Array.from({ length: 10 }, (_, index) => goldCase(index + 1))
const extra = [goldCase(101), goldCase(102)]
const devIds = main.slice(0, 4).map((sample) => sample.caseId)
const input = { main, extra, devCaseIds: devIds, devSelectionSha256: 'dev-hash', casesSha256: 'cases-hash' }

test('dev and test are disjoint, cover every main post, and the extra group stays apart', () => {
  const split = buildSplit(input)
  expect(split.dev.caseIds).toEqual(devIds)
  expect(split.test.posts).toBe(6)
  expect(split.dev.posts + split.test.posts).toBe(main.length)
  expect(split.dev.caseIds.filter((id) => split.test.caseIds.includes(id))).toEqual([])
  expect(split.extra['extra-post-after-start'].caseIds).toEqual(extra.map((sample) => sample.caseId))
  expect([...split.dev.caseIds, ...split.test.caseIds].some((id) => extra.some((sample) => sample.caseId === id))).toBe(
    false
  )
  expect(split.test.events).toBe(6)
})

test('the test order is fixed by the seed, not by input order', () => {
  const forward = buildSplit(input)
  const reversed = buildSplit({ ...input, main: [...main].reverse() })
  expect(reversed.test.caseIds).toEqual(forward.test.caseIds)
  expect(reversed.splitSha256).toBe(forward.splitSha256)
  expect(buildSplit({ ...input, seed: 'another-seed' }).test.caseIds).not.toEqual(forward.test.caseIds)
})

test('a dev case outside main, a duplicated dev case and an overlapping extra post are refused', () => {
  expect(() => buildSplit({ ...input, devCaseIds: [...devIds, 'd1-gold-missing'] })).toThrow('missing')
  expect(() => buildSplit({ ...input, devCaseIds: [devIds[0], devIds[0]] })).toThrow('Duplicated')
  expect(() => buildSplit({ ...input, extra: [main[0]] })).toThrow('overlaps')
  expect(() => buildSplit({ ...input, extra: [{ ...goldCase(103), postId: main[0].postId }] })).toThrow('overlaps')
  expect(() => buildSplit({ ...input, extra: [goldCase(101), goldCase(101)] })).toThrow('Duplicated')
})

test('a saved split is verified against its own hash and the cases file hash', async () => {
  const directory = await fresh()
  const path = join(directory, 'split.json')
  const split = buildSplit(input)
  await writeFile(path, JSON.stringify(split))
  expect((await loadSplit(path, 'cases-hash')).splitSha256).toBe(split.splitSha256)
  await expect(loadSplit(path, 'other-cases-hash')).rejects.toThrow('cases.json changed')
  // 投稿の入れ替えは、ハッシュが合わなくなって検出される。
  const tampered = { ...split, test: { ...split.test, caseIds: [...split.test.caseIds].reverse() } }
  await writeFile(path, JSON.stringify(tampered))
  await expect(loadSplit(path, 'cases-hash')).rejects.toThrow('hash mismatch')
})

test('names resolve to the saved order, and a missing case in the pool is refused', () => {
  const split = buildSplit(input)
  const pool = [...main, ...extra]
  const both = resolveSplitCases(split, ['test', 'extra-post-after-start'], pool)
  expect(both.map((sample) => sample.caseId)).toEqual([
    ...split.test.caseIds,
    ...split.extra['extra-post-after-start'].caseIds
  ])
  expect(() => resolveSplitCases(split, ['test'], main.slice(0, 3))).toThrow('missing')
  expect(() => resolveSplitCases(split, ['test', 'test'], pool)).toThrow('Duplicated')
  expect(parseSplitNames('test,extra-post-after-start')).toEqual(['test', 'extra-post-after-start'])
  expect(() => parseSplitNames('test,holdout')).toThrow('Invalid --split')
})

test('sidelined cases are read in the main format, and an unreadable row fails loudly', async () => {
  const directory = await fresh()
  const path = join(directory, 'cases.json')
  await writeFile(path, JSON.stringify({ schemaVersion: 1, main, sidelined: { post_after_start: extra, retweet: [] } }))
  expect((await loadSidelinedCases(path, 'post_after_start')).map((sample) => sample.caseId)).toEqual(
    extra.map((sample) => sample.caseId)
  )
  await expect(loadSidelinedCases(path, 'unknown_bucket')).rejects.toThrow('Unknown sidelined bucket')
  await writeFile(path, JSON.stringify({ schemaVersion: 1, main, sidelined: { post_after_start: [{ caseId: 'x' }] } }))
  await expect(loadSidelinedCases(path, 'post_after_start')).rejects.toThrow('Invalid sidelined case')
})

test('only the split ceiling raises the ledger limit; the default ceiling still rejects above 450', async () => {
  const directory = await fresh()
  await expect(openD1GoldLedger(directory, D1_GOLD_SPLIT_CALL_LIMIT)).rejects.toThrow('Invalid D1 gold call limit')
  await expect(openD1GoldLedger(directory, D1_GOLD_SPLIT_CALL_LIMIT + 1, D1_GOLD_SPLIT_CALL_LIMIT)).rejects.toThrow(
    'Invalid D1 gold call limit'
  )
  await expect(openD1GoldLedger(directory, 10, 1000)).rejects.toThrow('Invalid D1 gold call ceiling')
  const ledger = await openD1GoldLedger(directory, D1_GOLD_SPLIT_CALL_LIMIT, D1_GOLD_SPLIT_CALL_LIMIT)
  expect(ledger.limit).toBe(900)
  expect(D1_GOLD_CALL_LIMIT).toBe(450)
  await ledger.close()
})

const stubClient = (): D1GoldClientFactory =>
  ((options) => ({
    run: async (request, stage) => {
      await options.beforeCall(stage, request)
      const response = answerAll(request)
      await options.afterCall(stage, response)
      return response
    },
    extractionFetcher: async (_url, init) => {
      await options.beforeCall('extract', JSON.parse(String(init.body)))
      const body = stubExtractionBody(1)
      await options.afterCall('extract', body)
      return Response.json(body)
    }
  })) satisfies D1GoldClientFactory

test('a run with the split ceiling accepts a 900 call limit and stops at the limit it was given', async () => {
  const directory = await fresh()
  const cases = [goldCase(1), goldCase(2), goldCase(3)]
  const summary = await runGoldCohort({
    module: stubModule(),
    cases,
    directory,
    maxCalls: D1_GOLD_SPLIT_CALL_LIMIT,
    callCeiling: D1_GOLD_SPLIT_CALL_LIMIT,
    maxSeconds: 60,
    decideEndpoint: 'http://127.0.0.1:15175/api/admin/event-detect/decide',
    extractionEndpoint: 'http://127.0.0.1:15175/api/admin/event-detect/extract-evaluate',
    createClient: stubClient()
  })
  expect(summary.callLimit).toBe(900)
  expect(summary.completed).toBe(3)
  // 既定の天井のままでは、450 を超える上限は受け付けない。
  await expect(
    runGoldCohort({
      module: stubModule(),
      cases,
      directory: await fresh(),
      maxCalls: D1_GOLD_SPLIT_CALL_LIMIT,
      maxSeconds: 60,
      decideEndpoint: 'http://127.0.0.1:15175/api/admin/event-detect/decide',
      extractionEndpoint: 'http://127.0.0.1:15175/api/admin/event-detect/extract-evaluate',
      createClient: stubClient()
    })
  ).rejects.toThrow('Invalid D1 gold call limit')
})

// 追加の別枠（start 投稿）。同じ投稿が既存の測定にあるものは、投稿 ID で除く。
const startCase = (sample: ReturnType<typeof goldCase>, flags: string[] = []) => ({
  ...sample,
  caseId: `d1-gold-start-${sample.postId}`,
  bucket: 'extra-start-post',
  flags
})
const splitFile = buildSplit(input)
// main の先頭4件が開発用、残りが検証用。
const heldBy = { dev: main[0], test: main[9], extra: extra[0] }
const fresh3 = [goldCase(201), goldCase(202), goldCase(203)]
const flagged = ['also-in-cases-json']
const startCases = () => [
  startCase(fresh3[0]),
  startCase(heldBy.dev, flagged),
  startCase(fresh3[1]),
  startCase(heldBy.test, flagged),
  startCase(heldBy.extra, flagged),
  startCase(fresh3[2])
]

test('start posts already held by dev, test or the extra group are left out by post id, in the input order', () => {
  const plan = planExtraStartPost(splitFile, startCases())
  expect(plan.cases.map((sample) => sample.postId)).toEqual(fresh3.map((sample) => sample.postId))
  expect(plan.excluded.map((item) => item.group)).toEqual(['dev', 'test', 'extra-post-after-start'])
  expect(plan.excluded.map((item) => item.postId)).toEqual([heldBy.dev.postId, heldBy.test.postId, heldBy.extra.postId])
  expect(plan.caseIds).toEqual(plan.cases.map((sample) => sample.caseId))
})

test('a start post that is held but not flagged, or flagged but not held, stops the plan', () => {
  const [one, two, three, four, five, six] = startCases()
  expect(() => planExtraStartPost(splitFile, [one, { ...two, flags: [] }, three, four, five, six])).toThrow('disagree')
  expect(() => planExtraStartPost(splitFile, [{ ...one, flags: flagged }, two, three, four, five, six])).toThrow(
    'disagree'
  )
})

test('a reused case id, a duplicated start case and an empty plan are refused', () => {
  expect(() => planExtraStartPost(splitFile, [{ ...startCase(goldCase(201)), caseId: main[0].caseId }])).toThrow(
    'reuses'
  )
  expect(() => planExtraStartPost(splitFile, [startCase(goldCase(201)), startCase(goldCase(201))])).toThrow(
    'Duplicated'
  )
  expect(() => planExtraStartPost(splitFile, [startCase(main[0], flagged)])).toThrow('No extra start post')
})

test('the start group is not a split name, so scoring that walks the split names never sees it', () => {
  expect(() => parseSplitNames('extra-start-post')).toThrow('Invalid --split')
})

test('the plan is read from verified files, and its directory is written once and checked on resume', async () => {
  const directory = await fresh()
  const splitPath = join(directory, 'split.json')
  const extraPath = join(directory, 'cases-extra-start-post.json')
  const body = JSON.stringify({ schemaVersion: 1, main: startCases(), sidelined: {} })
  await writeFile(splitPath, JSON.stringify(splitFile))
  await writeFile(extraPath, body)
  const plan = await loadExtraStartPlan({ splitPath, casesSha256: 'cases-hash', extraPath })
  expect(plan.inputSha256).toBe(sha256Hex(body))
  expect(plan.split.splitSha256).toBe(splitFile.splitSha256)
  await expect(loadExtraStartPlan({ splitPath, casesSha256: 'other', extraPath })).rejects.toThrow('cases.json changed')

  const output = join(directory, 'run')
  await mkdir(output)
  await prepareExtraStartDirectory(output, plan, 300)
  const selection = JSON.parse(await readFile(join(output, 'selection.json'), 'utf8'))
  expect(selection.inputSha256).toBe(plan.inputSha256)
  expect(selection.selection.caseIds).toEqual(plan.caseIds)
  expect(selection.split.excluded).toHaveLength(3)
  expect(Object.keys(JSON.parse(await readFile(join(output, 'gold.json'), 'utf8')).cases)).toEqual(plan.caseIds)
  expect(await readFile(join(output, 'README.md'), 'utf8')).toContain('limit 300')
  expect((await stat(join(output, 'selection.json'))).mode & 0o777).toBe(0o600)
  // 再開: 同じ計画なら通り、ファイルは書き換えない。入力や投稿の並びが変わっていれば止まる。
  await prepareExtraStartDirectory(output, plan, 300)
  expect(JSON.parse(await readFile(join(output, 'selection.json'), 'utf8'))).toEqual(selection)
  await expect(prepareExtraStartDirectory(output, { ...plan, inputSha256: 'changed' }, 300)).rejects.toThrow('changed')
  await expect(prepareExtraStartDirectory(output, { ...plan, caseIdsSha256: 'changed' }, 300)).rejects.toThrow(
    'differs'
  )
})
