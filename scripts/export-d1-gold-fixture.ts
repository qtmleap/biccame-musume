import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import { extractionStoreOf } from './lib/event-detect/d1-gold-candidate'
import {
  type CandidateOutcome,
  evaluateFixtureCases,
  evaluateSources,
  sourceOfFixture,
  sourceOfSaved,
  summarize
} from './lib/event-detect/d1-gold-fixture-eval'
import {
  compactAnswer,
  compactAnswers,
  FIXTURE_DIRECTORY,
  FIXTURE_FILE,
  FIXTURE_FORMAT_VERSION,
  type FixtureBody,
  type FixtureCase,
  type FixtureSplit,
  serializeFixture,
  withHash
} from './lib/event-detect/d1-gold-fixture-schema'
import { canonicalJson } from './lib/event-detect/d1-gold-replay'
import { readCaseStates } from './lib/event-detect/d1-gold-run'
import { loadGoldCases } from './lib/event-detect/d1-gold-schema'
import { loadSplit, resolveSplitCases } from './lib/event-detect/d1-gold-split'
import { loadGoalPipelineModule } from './lib/event-detect/goal-pipeline-module'
import { GOAL_PIPELINE_PROFILE } from './lib/event-detect/goal-pipeline-profile'

// 保存した実 AI の応答（.wrangler/benchmarks/d1-gold/）から、コミットできる小さな Golden のフィクスチャを作る。実 AI は呼ばない。
// 元データは読むだけで書き換えない。判定の版（DETECTION_VERSION）が変わって質問が変わったら、この手順は使えない:
// 新しい版で測定し直した保存応答（run-v15-100 / run-v15-test に相当）を用意してから実行する。
const ROOT = '.wrangler/benchmarks/d1-gold'
const MODULE = '.wrangler/benchmarks/goal-pipeline/candidate-v15-choice.mjs'
const RUN_DIRECTORIES: Readonly<Record<FixtureSplit, string>> = {
  dev: `${ROOT}/run-v15-100`,
  test: `${ROOT}/run-v15-test`
}
const SPLITS = ['dev', 'test'] as const

const loaded = await loadGoldCases(resolve(`${ROOT}/cases.json`))
const split = await loadSplit(resolve(`${ROOT}/split.json`), loaded.sha256)
const frozen = await loadGoalPipelineModule(resolve(MODULE))
if (frozen.DETECTION_VERSION !== DETECTION_VERSION)
  throw new Error('The saved responses were made with another detection version; measure again before exporting')

const profile = GOAL_PIPELINE_PROFILE.thresholds
// 設定ごとの判定が保存した元の結果とフィクスチャで同じになることを確かめる。店舗は本番設定のまま・下限の両方、件数の監査も含む。
const SETTINGS = [
  { name: 'saved-store-0.9', thresholds: profile, pinTop: false },
  {
    name: 'saved-store-0.3',
    thresholds: { ...profile, fieldThresholds: { ...profile.fieldThresholds, store: 0.3 } },
    pinTop: false
  },
  { name: 'top-one', thresholds: profile, pinTop: true }
] as const
const AUDIT_THRESHOLDS = [0.9, 0.7] as const

const caseOf = async (name: FixtureSplit) => {
  const cases = resolveSplitCases(split, [name], loaded.cases)
  const states = await readCaseStates(resolve(RUN_DIRECTORIES[name]), cases, frozen)
  return cases.map((sample) => {
    const state = states.get(sample.caseId)
    if (state === undefined) throw new Error('Missing case state')
    return { sample, result: state.result }
  })
}

const toFixtureCase = (name: FixtureSplit, entry: Awaited<ReturnType<typeof caseOf>>[number]): FixtureCase => {
  const { sample, result } = entry
  if (result === null)
    return {
      caseId: sample.caseId,
      split: name,
      originalText: sample.post.text,
      golds: sample.events,
      completed: false,
      items: [],
      count: null,
      candidates: []
    }
  return {
    caseId: sample.caseId,
    split: name,
    originalText: sample.post.text,
    golds: sample.events,
    completed: true,
    items: result.extraction.events.map((event) => event.item),
    count: compactAnswer(result.countResponse.answers.distribution_item_count),
    candidates: result.judgements.map((judgement) => {
      const { extractionContext, ...post } = judgement.post
      return {
        item: judgement.item,
        contextOnly: judgement.contextOnly,
        storeKey: extractionStoreOf(judgement.requests[0].state),
        post:
          extractionContext === undefined
            ? post
            : (() => {
                const { originalText: _original, ...kept } = extractionContext
                return { ...post, extractionContext: kept }
              })(),
        answers: compactAnswers(judgement.response.answers)
      }
    })
  }
}

const entries = await Promise.all(SPLITS.map(async (name) => ({ name, rows: await caseOf(name) })))
const cases = entries.flatMap(({ name, rows }) => rows.map((row) => toFixtureCase(name, row)))
const body: FixtureBody = {
  formatVersion: FIXTURE_FORMAT_VERSION,
  detectionVersion: DETECTION_VERSION,
  source: { casesSha256: loaded.sha256, splitSha256: split.splitSha256 },
  cases
}
const file = withHash(body)

// 元の結果の元の投稿の本文を、フィクスチャが保っていること（originalText を案件で 1 回に畳んでも情報を失わない）。
const originalTextLost = entries.flatMap(({ rows }) =>
  rows.flatMap(({ result }) =>
    result === null
      ? []
      : result.judgements.filter(
          (judgement) =>
            judgement.post.extractionContext !== undefined &&
            judgement.post.extractionContext.originalText !== result.post.text
        )
  )
)
if (originalTextLost.length > 0) throw new Error('A candidate has its own original text; the fixture cannot fold it')

// 切り詰めたフィクスチャでも、保存した元の結果と同じ判定になることを全設定・全候補で確かめる。違えば書かない。
const comparable = (outcomes: readonly CandidateOutcome[]) => outcomes.map((outcome) => canonicalJson({ ...outcome }))
const mismatches = entries.flatMap(({ name, rows }) =>
  SETTINGS.flatMap((setting) =>
    rows.flatMap(({ sample, result }, index) => {
      if (result === null) return []
      const fromSaved = evaluateSources(sample.caseId, sample.events, result.judgements.map(sourceOfSaved), setting)
      const fixtureCase = cases.filter((item) => item.split === name)[index]
      const fromFixture = evaluateSources(
        sample.caseId,
        sample.events,
        fixtureCase.candidates.map((candidate) => sourceOfFixture(fixtureCase, candidate)),
        setting
      )
      return canonicalJson(comparable(fromSaved)) === canonicalJson(comparable(fromFixture))
        ? []
        : [{ setting: setting.name, caseId: sample.caseId }]
    })
  )
)
if (mismatches.length > 0) {
  console.log(JSON.stringify(mismatches.slice(0, 5), null, 2))
  throw new Error(`The compact fixture decides differently from the saved responses on ${mismatches.length} cases`)
}

const text = serializeFixture(file)
await mkdir(resolve(FIXTURE_DIRECTORY), { recursive: true })
await writeFile(resolve(FIXTURE_FILE), text)

const report = SPLITS.flatMap((name) =>
  AUDIT_THRESHOLDS.flatMap((audit) =>
    SETTINGS.map((setting) => ({
      split: name,
      audit,
      setting: setting.name,
      ...summarize(
        evaluateFixtureCases(
          cases.filter((item) => item.split === name),
          setting,
          audit
        ),
        'production'
      )
    }))
  )
)
console.log(
  JSON.stringify(
    {
      file: FIXTURE_FILE,
      bytes: new TextEncoder().encode(text).length,
      cases: cases.length,
      candidates: cases.reduce((sum, item) => sum + item.candidates.length, 0),
      contentSha256: file.contentSha256,
      detectionVersion: file.detectionVersion,
      comparedSettings: SETTINGS.length,
      mismatches: 0,
      report
    },
    null,
    2
  )
)
