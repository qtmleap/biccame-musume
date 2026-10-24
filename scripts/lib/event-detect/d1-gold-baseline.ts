import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildDetectionDraft, evaluateDetection } from '@biccame/shared/event-detect/detection'
import {
  auditItemCount,
  DEFAULT_ITEM_COUNT_THRESHOLD,
  itemCountReviewReasons
} from '@biccame/shared/event-detect/extraction'
import { EXPECTED_BASELINE, sourceFingerprint } from './d1-confirm-desk'
import {
  formatSplitReport,
  formatSummary,
  type SplitReport,
  type SplitSummary,
  SplitSummarySchema
} from './d1-gold-baseline-report'
import { buildCaseRecord } from './d1-gold-records'
import { canonicalJson, checkReplayParity, replayDecision } from './d1-gold-replay'
import { readCaseStates } from './d1-gold-run'
import type { GoldCase } from './d1-gold-schema'
import { countByKey } from './d1-gold-schema'
import { type PostError, scoreRecords } from './d1-gold-score'
import { type AuditReasons, rowsOf, SETTINGS, settingMetrics } from './d1-gold-settings'
import { resolveSplitCases, SPLIT_NAMES, type SplitFile, type SplitName } from './d1-gold-split'
import type { GoalPipelineModule } from './goal-pipeline-module'
import type { GoalPipelineResult } from './goal-pipeline-schema'

// 採点の 70% 側の件数監査（設定 (d)）。保存した抽出と件数の回答から現行ソースで再計算する。
export const ALTERNATIVE_AUDIT_THRESHOLD = 0.7

export const SPLIT_LABELS: Readonly<Record<SplitName, string>> = {
  dev: '開発用 (規則を決めるのに使った 100 投稿。検証には使えない)',
  test: '検証用 (まだ AI に通していなかった投稿)',
  'extra-post-after-start': '別枠: 投稿日が D1 の開始日より後 (主指標に混ぜない)'
}

// 凍結版の評価関数を、現行ソースの評価関数・下書きに差し替えた判定モジュール。保存した応答はそのまま使う。
export const withCurrentSource = (module: GoalPipelineModule): GoalPipelineModule => ({
  ...module,
  evaluateDetection,
  buildDetectionDraft
})

// 保存した下書きは凍結版が作ったもの。最上位予測の項目別の一致は、現行ソースで作り直した下書きで見る。
const withCurrentDrafts = (result: GoalPipelineResult): GoalPipelineResult => ({
  ...result,
  judgements: result.judgements.map((judgement) => ({
    ...judgement,
    draft: { ...buildDetectionDraft(judgement.post, judgement.response.answers) }
  }))
})

const auditOf = (result: GoalPipelineResult, threshold: number) =>
  auditItemCount(result.extraction.events, result.countResponse, threshold)

export type ScoreSplitOptions = {
  module: GoalPipelineModule
  split: SplitFile
  pool: readonly GoldCase[]
  name: SplitName
  runDirectory: string
  outDirectory: string
  root: string
}

// 1つの分割を採点する。AI は呼ばない。測定の出力先は読むだけで、結果は outDirectory/<name>/ に書く。
export const scoreSplit = async (options: ScoreSplitOptions) => {
  const frozen = options.module
  const current = withCurrentSource(frozen)
  const cases = resolveSplitCases(options.split, [options.name], options.pool)
  const states = await readCaseStates(options.runDirectory, cases, frozen)
  const stateOf = (caseId: string) => {
    const state = states.get(caseId)
    if (state === undefined) throw new Error('Missing case state')
    return state
  }
  const results = cases.map((sample) => stateOf(sample.caseId).result)
  const records = cases.map((sample, index) => {
    const result = results[index]
    return buildCaseRecord(current, sample, result === null ? null : withCurrentDrafts(result))
  })
  // 下書きを作り直しても、正解との対応づけ（店舗・物品名・開始日・種類で決まる）が変わらないことを確かめる。
  const savedDraftRecords = cases.map((sample, index) => buildCaseRecord(current, sample, results[index]))
  const matchMismatched = records.filter(
    (record, index) =>
      JSON.stringify(record.candidates.map((candidate) => candidate.matchedGold)) !==
      JSON.stringify(savedDraftRecords[index].candidates.map((candidate) => candidate.matchedGold))
  )
  const errors: PostError[] = cases.flatMap((sample) => {
    const state = stateOf(sample.caseId)
    return state.errors.length === 0
      ? []
      : [
          {
            caseId: sample.caseId,
            kinds: state.errors.map((error) => error.kind),
            messages: state.errors.map((error) => error.message),
            calls: state.errors.reduce((sum, error) => sum + error.calls, 0)
          }
        ]
  })
  const score = scoreRecords(cases, records, errors)

  const completed = cases.flatMap((sample, index) => {
    const result = results[index]
    return result === null ? [] : [{ caseId: sample.caseId, result }]
  })
  const audits = completed.map(({ caseId, result }) => ({
    caseId,
    saved: result.audit,
    at90: auditOf(result, DEFAULT_ITEM_COUNT_THRESHOLD),
    at70: auditOf(result, ALTERNATIVE_AUDIT_THRESHOLD)
  }))
  const auditByCase = new Map<string, AuditReasons>(
    audits.map((audit) => [
      audit.caseId,
      { audit90: itemCountReviewReasons(audit.at90), audit70: itemCountReviewReasons(audit.at70) }
    ])
  )
  const auditMismatched = audits.filter(
    (audit) =>
      audit.at90.status !== audit.saved.status ||
      audit.at90.expected !== audit.saved.expected ||
      audit.at90.threshold !== audit.saved.threshold
  )
  // 最初の抽出が不一致なら本番は抽出をやり直す。保存した結果は不一致でなかった投稿だけ、70% で不一致になるかを数える。
  const audit70Reextract = audits.filter(
    (audit) => audit.saved.status !== 'mismatch' && audit.at70.status === 'mismatch'
  )

  const judgements = completed.flatMap(({ result }) => result.judgements)
  const frozenParity = checkReplayParity(frozen, judgements)
  const delta = judgements.flatMap((judgement) =>
    (['saved', 'top-one'] as const).flatMap((mode) => {
      const before = replayDecision(frozen, judgement, mode)
      const after = replayDecision(current, judgement, mode)
      return canonicalJson(before.raw) === canonicalJson(after.raw)
        ? []
        : [{ mode, transition: `${before.status}->${after.status}` }]
    })
  )
  const rows = rowsOf(records, auditByCase)
  const settings = SETTINGS.map((setting) => settingMetrics(setting, rows, records.length, score.sample.goldEvents))
  const topOne = settings.find((setting) => setting.id === 'c')
  if (topOne === undefined) throw new Error('Missing setting c')
  const report: SplitReport = {
    name: options.name,
    label: SPLIT_LABELS[options.name],
    runDirectory: options.runDirectory,
    sample: {
      posts: score.sample.posts,
      completedPosts: score.sample.completedPosts,
      incompletePosts: score.sample.incompletePosts,
      errorPosts: errors.length,
      // 結果もエラー記録も呼び出しの痕跡も無い投稿。出力先の取り違えや、測定が途中で止まったときに増える。
      notAttemptedPosts: cases.filter((sample) => {
        const state = stateOf(sample.caseId)
        return state.result === null && state.errors.length === 0 && state.sequence === 0
      }).length,
      goldEvents: score.sample.goldEvents,
      candidates: score.sample.candidates,
      realCandidates: score.sample.realCandidates,
      contextOnlyCandidates: score.capture.contextOnlyCandidates,
      calls: score.sample.calls,
      auditStatus: score.sample.auditStatus
    },
    capture: score.capture.allGoldEvents,
    captureDetail: score.capture,
    argmaxFields: score.predicted,
    settings,
    errors: score.errors,
    integrity: {
      frozenReplayParity: frozenParity,
      auditParity: { checked: audits.length, mismatched: auditMismatched.length },
      evaluatorDelta: {
        checked: judgements.length,
        savedChanged: delta.filter((item) => item.mode === 'saved').length,
        topOneChanged: delta.filter((item) => item.mode === 'top-one').length,
        savedTransitions: countByKey(
          delta.filter((item) => item.mode === 'saved'),
          (item) => item.transition
        )
      },
      matchParity: { checked: records.length, mismatched: matchMismatched.length },
      audit70ReextractNotSimulated: audit70Reextract.length,
      sourceSha256: await sourceFingerprint(options.root),
      // 机上の基準は開発用の測定でだけ定義されている。ここで合わなければ再評価が壊れている。
      calibration:
        options.name === 'dev'
          ? {
              expected: EXPECTED_BASELINE,
              actual: { registered: topOne.registeredRealOnly, exact: topOne.exactRealOnly }
            }
          : null
    }
  }
  const directory = join(options.outDirectory, options.name)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  await writeFile(join(directory, 'records.json'), `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 })
  await writeFile(join(directory, 'report.txt'), `${formatSplitReport(report)}\n`, { mode: 0o600 })
  return report
}

// 保存済みの分割ごとの報告を読み、横断の表を書く。
export const writeSummary = async (outDirectory: string) => {
  const found = await Promise.all(
    SPLIT_NAMES.map(async (name) => {
      const file = Bun.file(join(outDirectory, name, 'report.json'))
      if (!(await file.exists())) return []
      const parsed = SplitSummarySchema.safeParse(
        JSON.parse(await readFile(join(outDirectory, name, 'report.json'), 'utf8'))
      )
      if (!parsed.success) throw new Error('Invalid split report')
      return [parsed.data]
    })
  )
  const summaries: SplitSummary[] = found.flat()
  const text = formatSummary(summaries)
  await writeFile(join(outDirectory, 'summary.txt'), `${text}\n`, { mode: 0o600 })
  return text
}
