import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scoreSplit, withCurrentSource, writeSummary } from '../scripts/lib/event-detect/d1-gold-baseline'
import { casePaths } from '../scripts/lib/event-detect/d1-gold-run'
import { type GoldCase, goldModelPost } from '../scripts/lib/event-detect/d1-gold-schema'
import { holdByAudit } from '../scripts/lib/event-detect/d1-gold-settings'
import { buildSplit } from '../scripts/lib/event-detect/d1-gold-split'
import { goalHash } from '../scripts/lib/event-detect/goal-pipeline-module'
import type { GoalPipelineResult } from '../scripts/lib/event-detect/goal-pipeline-schema'
import { goldCase, goldEvent } from './d1-gold-fixtures'
import { judgementWith, realModule } from './d1-gold-judgement'

const directories: string[] = []
const fresh = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'd1-gold-baseline-'))
  directories.push(directory)
  return directory
}
beforeEach(() => {
  directories.length = 0
})
afterEach(async () => {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })))
})

const gold = (index: number) =>
  goldEvent({
    uuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    stores: ['yuurakuchou'],
    startDateJst: '2026-03-16',
    endDateJst: '2026-03-31',
    conditions: [
      { type: 'purchase', purchaseAmount: 1000 },
      { type: 'first_come', quantity: 100 }
    ]
  })

// 件数の回答の確率で、保存した監査（90%）と、70% で再計算した監査の結果が変わる。
const resultFor = (
  sample: GoldCase,
  judgement: ReturnType<typeof judgementWith>,
  countProbability: number,
  auditStatus: 'matched' | 'low_confidence'
): GoalPipelineResult => ({
  version: 'stub-version',
  extractionVersion: 'stub-extraction',
  inputHash: goalHash(goldModelPost(sample)),
  post: sample.post,
  extraction: { events: [{ item: judgement.item, stores: ['yuurakuchou'], characterIds: [], evidence: ['x'] }] },
  audit: {
    version: 'distribution-items-v2',
    expected: 1,
    probability: countProbability,
    threshold: 0.9,
    extracted: 1,
    candidates: 1,
    status: auditStatus
  },
  countRequest: judgement.requests[0],
  countResponse: {
    answers: {
      distribution_item_count: {
        type: 'choice',
        choice: '1',
        probabilities: { '0': 1 - countProbability, '1': countProbability }
      }
    }
  },
  judgements: [judgement],
  stopped: false,
  stopReasons: [],
  calls: 3
})

const save = async (directory: string, sample: GoldCase, result: GoalPipelineResult | null) => {
  const paths = casePaths(directory, sample.caseId)
  await mkdir(paths.root, { recursive: true })
  if (result !== null) await writeFile(paths.result, JSON.stringify(result))
}

const setup = async () => {
  const run = await fresh()
  const out = await fresh()
  // 1: 店舗・娘が90%以上、件数の回答も90%以上 / 2: 件数の回答が80% / 3: 店舗・娘が40%（店舗の下限 70% 未満） / 4: 通信エラーで未完
  const samples = [1, 2, 3, 4].map((index) => goldCase(index, { events: [gold(index)] }))
  const sure = judgementWith({ store: ['yuurakuchou', 0.95], character: ['yuurakuchou', 0.95] })
  const unsure = judgementWith({ store: ['yuurakuchou', 0.4], character: ['yuurakuchou', 0.4] })
  await save(run, samples[0], resultFor(samples[0], sure, 0.95, 'matched'))
  await save(run, samples[1], resultFor(samples[1], sure, 0.8, 'low_confidence'))
  await save(run, samples[2], resultFor(samples[2], unsure, 0.95, 'matched'))
  await save(run, samples[3], null)
  const split = buildSplit({
    main: samples,
    extra: [],
    devCaseIds: [],
    devSelectionSha256: 'dev',
    casesSha256: 'cases'
  })
  return { run, out, samples, split }
}

test('the audit hold only turns a registration into a held candidate and leaves other states alone', () => {
  const register = { status: 'register' as const, reasons: [], fields: null }
  const held = { status: 'held' as const, reasons: ['store_unconfirmed'], fields: null }
  expect(holdByAudit(register, ['distribution_item_count_mismatch'])).toEqual({
    status: 'held',
    reasons: ['distribution_item_count_mismatch'],
    fields: null
  })
  expect(holdByAudit(register, [])).toBe(register)
  expect(holdByAudit(held, ['distribution_item_count_mismatch'])).toBe(held)
})

test('the four settings separate the audit gate and the top-one adoption, and an unfinished post stays in the denominator', async () => {
  const { run, out, samples, split } = await setup()
  const report = await scoreSplit({
    module: realModule(),
    split,
    pool: samples,
    name: 'test',
    runDirectory: run,
    outDirectory: out,
    root: process.cwd()
  })
  const byId = Object.fromEntries(report.settings.map((setting) => [setting.id, setting]))
  // 候補は終了日を持たない（D1 の正解には 2026-03-31 がある）。R1（announce-time）では一致、strict では不一致になる。
  // 以下の全項目一致は R1（主指標）で見て、strict は最後にまとめて確かめる。
  // (a) 90% の監査では、件数の回答が80%の投稿と、店舗・娘が40%の候補は登録に進まない。
  expect(byId.a).toMatchObject({ registered: 1, announceTime: { exact: 1 } })
  expect(byId.a.heldReasons).toMatchObject({ distribution_item_count_low_confidence: 1, store_unconfirmed: 1 })
  // (b) 監査を外すと、件数の回答が80%の投稿も登録に進む。店舗・娘が40%の候補は残る。
  expect(byId.b).toMatchObject({ registered: 2, announceTime: { exact: 2 } })
  // (c) 最上位採用で、店舗・娘が40%の候補も登録に進む。
  expect(byId.c).toMatchObject({ registered: 3, announceTime: { exact: 3 } })
  // (d) 70% の監査なら、件数の回答が80%の投稿は通る。
  expect(byId.d).toMatchObject({ registered: 3, announceTime: { exact: 3 } })
  // 分母: 全投稿 4 件・正解 4 件（通信エラーで未完の投稿を含む）。
  expect(report.sample).toMatchObject({ posts: 4, completedPosts: 3, incompletePosts: 1, goldEvents: 4, candidates: 3 })
  expect(byId.c.announceTime.exactRegistrationRate).toEqual({ n: 3, d: 4, rate: 0.75 })
  expect(byId.c.announceTime.precision).toEqual({ n: 3, d: 3, rate: 1 })
  // strict（参考）は、終了日が食い違うので全項目一致が 0 件になる。登録の可否は同じ。
  expect(byId.c).toMatchObject({ exact: 0, wrongByField: { endDate: 3 } })
  expect(byId.c.precision).toEqual({ n: 0, d: 3, rate: 0 })
  expect(byId.c.announceTime.wrongByField).toEqual({})
  expect(byId.c.registeredFieldMatch).toMatchObject({
    endDate: { n: 0, d: 3 },
    endDateAnnounceTime: { n: 3, d: 3 }
  })
  expect(report.integrity.auditParity).toEqual({ checked: 3, mismatched: 0 })
  expect(report.integrity.frozenReplayParity.ok).toBe(true)
  expect(report.integrity.matchParity).toEqual({ checked: 4, mismatched: 0 })
  expect(report.integrity.calibration).toBeNull()
})

test('a registration with no matching gold event is counted as wrong, and a context-only one is split out', async () => {
  const run = await fresh()
  const out = await fresh()
  const sample = goldCase(1, { events: [goldEvent({ title: '特製ノート', stores: ['honten'] })] })
  // 物品名も抽出段階の店舗も正解と合わない候補が2件あり（唯一の候補にならない）、最上位採用で登録に進む。
  const pin: { store: [string, number]; character: [string, number] } = {
    store: ['yuurakuchou', 0.5],
    character: ['yuurakuchou', 0.5]
  }
  const stray = judgementWith(pin, 'yuurakuchou', 'アクスタ')
  const other = judgementWith(pin, 'yuurakuchou', 'ステッカー')
  const context = { ...judgementWith(pin, 'yuurakuchou', '文脈'), contextOnly: true }
  const result = { ...resultFor(sample, stray, 0.95, 'matched'), judgements: [stray, other, context] }
  await save(run, sample, result)
  const split = buildSplit({
    main: [sample],
    extra: [],
    devCaseIds: [],
    devSelectionSha256: 'dev',
    casesSha256: 'cases'
  })
  const report = await scoreSplit({
    module: realModule(),
    split,
    pool: [sample],
    name: 'test',
    runDirectory: run,
    outDirectory: out,
    root: process.cwd()
  })
  const c = report.settings.find((setting) => setting.id === 'c')
  expect(c).toMatchObject({ registered: 3, exact: 0, wrongUnmatched: 3, registeredContextOnly: 1 })
  expect(c?.precision).toEqual({ n: 0, d: 3, rate: 0 })
  expect(c?.precisionRealOnly).toEqual({ n: 0, d: 2, rate: 0 })
  expect(c?.exactRegistrationRate).toEqual({ n: 0, d: 1, rate: 0 })
  expect(report.sample.contextOnlyCandidates).toBe(1)
  expect(report.captureDetail.unmatchedCandidates).toBe(2)
})

test('posts with no trace in the run directory are reported as not attempted instead of being dropped silently', async () => {
  const { out, samples, split } = await setup()
  // 取り違えた出力先 (空のディレクトリ) で採点すると、全投稿が未着手として見える。
  const report = await scoreSplit({
    module: realModule(),
    split,
    pool: samples,
    name: 'test',
    runDirectory: await fresh(),
    outDirectory: out,
    root: process.cwd()
  })
  expect(report.sample).toMatchObject({ posts: 4, completedPosts: 0, incompletePosts: 4, notAttemptedPosts: 4 })
  expect(report.settings.every((setting) => setting.registered === 0)).toBe(true)
  const { run, samples: same, split: sameSplit } = await setup()
  const real = await scoreSplit({
    module: realModule(),
    split: sameSplit,
    pool: same,
    name: 'test',
    runDirectory: run,
    outDirectory: out,
    root: process.cwd()
  })
  // 通信エラーで未完になった投稿には呼び出しの痕跡が無くても、結果が無い投稿は未着手に数える (完了3 + 未着手1)。
  expect(real.sample).toMatchObject({ completedPosts: 3, incompletePosts: 1, notAttemptedPosts: 1 })
})

test('a changed saved audit is reported as a parity mismatch instead of being trusted', async () => {
  const { run, out, samples, split } = await setup()
  const paths = casePaths(run, samples[0].caseId)
  const saved = JSON.parse(await readFile(paths.result, 'utf8'))
  await writeFile(paths.result, JSON.stringify({ ...saved, audit: { ...saved.audit, status: 'mismatch' } }))
  const report = await scoreSplit({
    module: realModule(),
    split,
    pool: samples,
    name: 'test',
    runDirectory: run,
    outDirectory: out,
    root: process.cwd()
  })
  expect(report.integrity.auditParity).toEqual({ checked: 3, mismatched: 1 })
})

test('reports and the cross-split summary are written under the output directory only', async () => {
  const { run, out, samples, split } = await setup()
  await scoreSplit({
    module: realModule(),
    split,
    pool: samples,
    name: 'test',
    runDirectory: run,
    outDirectory: out,
    root: process.cwd()
  })
  const text = await writeSummary(out)
  expect(text).toContain('| test | (c)')
  expect(text).toContain('dev は規則を決めるのに使った開発用')
  expect(await readFile(join(out, 'summary.txt'), 'utf8')).toContain('全項目一致の登録率')
  expect(await readFile(join(out, 'test', 'report.txt'), 'utf8')).toContain('## 整合')
  // 測定の出力先には何も足されない。
  expect(await Bun.file(join(run, 'summary.txt')).exists()).toBe(false)
  expect(await Bun.file(join(run, 'report.json')).exists()).toBe(false)
})

test('the current-source module swaps only the evaluator and the draft builder', () => {
  const frozen = realModule()
  const current = withCurrentSource({ ...frozen, evaluateDetection: () => ({ status: 'held' }) })
  expect(current.sha256).toBe(frozen.sha256)
  expect(current.DETECTION_VERSION).toBe(frozen.DETECTION_VERSION)
  expect(current.evaluateDetection).toBe(frozen.evaluateDetection)
})
