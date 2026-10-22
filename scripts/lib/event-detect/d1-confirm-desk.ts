import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ClefRequestSchema, type ClefResponse } from '@biccame/shared/event-detect/clef'
import { evaluateDetection } from '@biccame/shared/event-detect/detection'
import {
  auditItemCount,
  DEFAULT_ITEM_COUNT_THRESHOLD,
  itemCountReviewReasons
} from '@biccame/shared/event-detect/extraction'
import { type PlanItem, readRecords } from './d1-confirm-plan'
import { isConcreteCharacter, isConcreteStore } from './d1-confirm-requests'
import { extractionStoreOf } from './d1-gold-candidate'
import { allFieldsMatch, compareRegistered } from './d1-gold-compare'
import { pinTopChoice } from './d1-gold-replay'
import { countByKey, type GoldEvent } from './d1-gold-schema'
import { GOAL_PIPELINE_PROFILE } from './goal-pipeline-profile'
import { GoalPipelineResultSchema } from './goal-pipeline-schema'

// 机上の入力: 現行の判定ロジック（evaluateDetection。作業ツリーの packages/shared をそのまま呼ぶ）。前回の最上位採用の結果。
export const EXPECTED_BASELINE = { registered: 37, exact: 19 } as const
export const SAVED_AUDIT_THRESHOLD = DEFAULT_ITEM_COUNT_THRESHOLD
export const ALTERNATIVE_AUDIT_THRESHOLD = 0.7

export type DeskRow = {
  caseId: string
  index: number
  matchedGold: string | null
  // 店舗・娘の最上位を 1.0 に書き換えて再評価した状態（確認の関門を掛ける前）。
  registered: boolean
  // 登録かつ対応する D1 の正解と全項目一致。登録でない、または対応づかないときは null。
  exact: boolean | null
  storeTop: string
  characterTop: string
  auditSavedReasons: string[]
  audit70Reasons: string[]
}

export type DeskInputs = {
  rows: DeskRow[]
  // 保存した件数監査の状態を、保存したしきい値で再計算した結果と突き合わせる。一致しなければ 0.7 の机上は解釈できない。
  auditParity: { checked: number; mismatched: number }
  baseline: { registered: number; exact: number; unmatchedRegistered: number }
  sourceSha256: { detection: string; detectionConditions: string; eventDetectDirectory: string }
}

const sha256File = async (path: string) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex')

// 評価ロジックの入力ファイルの指紋。未コミットの作業ツリーが測定中に変わっていないかを、報告時に確かめる。
export const sourceFingerprint = async (root: string) => {
  const directory = resolve(root, 'packages/shared/src/event-detect')
  const names = (await readdir(directory)).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts')).sort()
  const hashes = await Promise.all(names.map(async (name) => `${name}:${await sha256File(join(directory, name))}`))
  return {
    detection: await sha256File(join(directory, 'detection.ts')),
    detectionConditions: await sha256File(join(directory, 'detection-conditions.ts')),
    eventDetectDirectory: createHash('sha256').update(hashes.join('\n')).digest('hex')
  }
}

const topOf = (response: ClefResponse, key: string) => {
  const answer = response.answers[key]
  return answer?.type === 'choice' ? answer.choice : ''
}

// 保存済みの全候補を、最上位固定で再評価する。AIは呼ばない。
export const loadDeskInputs = async (
  runDirectory: string,
  golds: ReadonlyMap<string, readonly GoldEvent[]>,
  root: string
): Promise<DeskInputs> => {
  const records = await readRecords(runDirectory)
  const perCase = await Promise.all(
    records
      .filter((record) => record.completed)
      .map(async (record) => {
        const saved = GoalPipelineResultSchema.safeParse(
          JSON.parse(await readFile(join(runDirectory, 'cases', record.caseId, 'result.json'), 'utf8'))
        )
        if (!saved.success) throw new Error('Invalid saved result.json')
        const audit70 = auditItemCount(
          saved.data.extraction.events,
          saved.data.countResponse,
          ALTERNATIVE_AUDIT_THRESHOLD
        )
        const auditSaved = auditItemCount(
          saved.data.extraction.events,
          saved.data.countResponse,
          saved.data.audit.threshold
        )
        const events = golds.get(record.caseId)
        if (events === undefined) throw new Error('Missing gold events for a saved case')
        const rows = saved.data.judgements.flatMap((judgement, index): DeskRow[] => {
          const entry = record.candidates.find((candidate) => candidate.index === index)
          if (entry === undefined) throw new Error('Record candidate missing for a saved judgement')
          if (judgement.contextOnly) return []
          const request = ClefRequestSchema.safeParse({
            ...judgement.requests[0],
            questions: Object.fromEntries(judgement.requests.flatMap((part) => Object.entries(part.questions)))
          })
          if (!request.success) throw new Error('Invalid saved detection request')
          const answers = judgement.response.answers
          const store = pinTopChoice(answers.store)
          const character = pinTopChoice(answers.character)
          const response: ClefResponse = {
            answers: {
              ...answers,
              ...(store === undefined ? {} : { store }),
              ...(character === undefined ? {} : { character })
            }
          }
          const result = evaluateDetection(
            judgement.post,
            request.data,
            response,
            GOAL_PIPELINE_PROFILE.thresholds,
            extractionStoreOf(request.data.state)
          )
          const gold = events.find((event) => event.uuid === entry.matchedGold)
          return [
            {
              caseId: record.caseId,
              index,
              matchedGold: entry.matchedGold,
              registered: result.status === 'register',
              exact:
                result.status === 'register' && gold !== undefined
                  ? allFieldsMatch(compareRegistered(result.candidate, gold))
                  : null,
              storeTop: topOf(judgement.response, 'store'),
              characterTop: topOf(judgement.response, 'character'),
              auditSavedReasons: itemCountReviewReasons(auditSaved),
              audit70Reasons: itemCountReviewReasons(audit70)
            }
          ]
        })
        return {
          rows,
          parity: auditSaved.status === saved.data.audit.status && auditSaved.expected === saved.data.audit.expected
        }
      })
  )
  const rows = perCase.flatMap((entry) => entry.rows)
  const registered = rows.filter((row) => row.registered)
  return {
    rows,
    auditParity: { checked: perCase.length, mismatched: perCase.filter((entry) => !entry.parity).length },
    baseline: {
      registered: registered.length,
      exact: registered.filter((row) => row.exact === true).length,
      unmatchedRegistered: registered.filter((row) => row.matchedGold === null).length
    },
    sourceSha256: await sourceFingerprint(root)
  }
}

export type Confirmation = { storeYes: number | null; characterYesA: number | null; characterYesB: number | null }
export type AuditMode = 'none' | 'saved-0.9' | 'alt-0.7'
export type UnmeasuredPolicy = 'hold' | 'pass'

// T の結果から、確認対象が choice の最上位と同じ項目の「はい」だけを取り出す（候補ごと）。違う項目は未測定（null）。
export const confirmationsFor = (
  items: readonly PlanItem[],
  yes: (item: PlanItem, key: string) => number | null,
  keys: { store: string; a: string; b: string }
) =>
  new Map<string, Confirmation>(
    items
      .filter((item) => item.kind === 'T')
      .map((item) => [
        `${item.caseId}#${item.index}`,
        {
          storeYes: item.storeIsChoiceTop === true ? yes(item, keys.store) : null,
          characterYesA: item.characterIsChoiceTop === true ? yes(item, keys.a) : null,
          characterYesB: item.characterIsChoiceTop === true ? yes(item, keys.b) : null
        }
      ])
  )

const auditHolds = (row: DeskRow, audit: AuditMode) =>
  audit === 'saved-0.9' ? row.auditSavedReasons.length > 0 : audit === 'alt-0.7' ? row.audit70Reasons.length > 0 : false

export type GateOutcome = {
  registered: number
  exact: number
  wrong: number
  unmatched: number
  unmeasured: number
}

// 「choice の最上位 かつ 確認の『はい』>= X」に置き換えた場合の登録数。最上位が other・secret などの特別値の項目は関門を掛けない。
export const gateOutcome = (
  rows: readonly DeskRow[],
  confirmations: ReadonlyMap<string, Confirmation>,
  options: { threshold: number; policy: UnmeasuredPolicy; audit: AuditMode; characterQuestion: 'a' | 'b' }
): GateOutcome => {
  const base = rows.filter((row) => row.registered && !auditHolds(row, options.audit))
  const verdicts = base.map((row) => {
    const confirmation = confirmations.get(`${row.caseId}#${row.index}`)
    const needsStore = isConcreteStore(row.storeTop)
    const needsCharacter = isConcreteCharacter(row.characterTop)
    const storeYes = confirmation === undefined ? null : confirmation.storeYes
    const characterYes =
      confirmation === undefined
        ? null
        : options.characterQuestion === 'a'
          ? confirmation.characterYesA
          : confirmation.characterYesB
    const measured = (!needsStore || storeYes !== null) && (!needsCharacter || characterYes !== null)
    const passes =
      (!needsStore || (storeYes !== null && storeYes >= options.threshold)) &&
      (!needsCharacter || (characterYes !== null && characterYes >= options.threshold))
    const admitted = measured ? passes : options.policy === 'pass'
    return { row, measured, admitted }
  })
  const kept = verdicts.filter((verdict) => verdict.admitted)
  return {
    registered: kept.length,
    exact: kept.filter((verdict) => verdict.row.exact === true).length,
    wrong: kept.filter((verdict) => verdict.row.exact === false).length,
    unmatched: kept.filter((verdict) => verdict.row.matchedGold === null).length,
    unmeasured: verdicts.filter((verdict) => !verdict.measured).length
  }
}

// 机上の「未測定」の内訳。登録に進む候補のうち、T の結果が使えないもの。
export const unmeasuredBreakdown = (rows: readonly DeskRow[], confirmations: ReadonlyMap<string, Confirmation>) => {
  const base = rows.filter((row) => row.registered)
  const status = (row: DeskRow) => {
    if (row.matchedGold === null) return 'no D1 match (no gold, so no T)'
    const confirmation = confirmations.get(`${row.caseId}#${row.index}`)
    if (confirmation === undefined) return 'no T item'
    if (isConcreteStore(row.storeTop) && confirmation.storeYes === null) return 'store T target differs from choice top'
    if (isConcreteCharacter(row.characterTop) && confirmation.characterYesA === null)
      return 'character T target differs from choice top'
    return 'measured'
  }
  return countByKey(base, status)
}
