import { allFieldsMatch, type EndDateMode, FIELD_NAMES, type FieldMatches, failedFields } from './d1-gold-compare'
import type { CandidateRecord, CaseRecord, Outcome } from './d1-gold-records'
import { countByKey } from './d1-gold-schema'
import { type Rate, rate } from './d1-gold-score'

// 件数の監査で保留にする: 登録に進む候補だけを held にし、理由を足す（本番と同じ重ね方）。
export const holdByAudit = (outcome: Outcome, reasons: readonly string[]): Outcome =>
  outcome.status === 'register' && reasons.length > 0
    ? { status: 'held', reasons: [...reasons], fields: null }
    : outcome

// 候補1件と、その投稿の件数監査の保留理由（しきい値 90% と 70%。現行ソースで保存した抽出から再計算したもの）。
export type SettingRow = { candidate: CandidateRecord; audit90: readonly string[]; audit70: readonly string[] }

export type Setting = {
  id: 'a' | 'b' | 'c' | 'd'
  label: string
  pick: (row: SettingRow) => Outcome
}

// 固定した4つの設定。店舗・娘の「最上位採用」は、保存応答の最上位の確率を 1.0 にして現行ソースで再評価した結果。
export const SETTINGS: readonly Setting[] = [
  {
    id: 'a',
    label: '現行の本番設定 (店舗・娘 90%、件数の監査 90%)',
    pick: (row) => holdByAudit(row.candidate.current, row.audit90)
  },
  { id: 'b', label: '(a) から件数の監査を外す', pick: (row) => row.candidate.current },
  { id: 'c', label: '店舗・娘を最上位採用、件数の監査なし', pick: (row) => row.candidate.topOne },
  { id: 'd', label: '(c) + 件数の監査 70%', pick: (row) => holdByAudit(row.candidate.topOne, row.audit70) }
]

export type AuditReasons = { audit90: readonly string[]; audit70: readonly string[] }

// 完了しなかった投稿には候補が無いので、監査の理由が無くても行は作られない。
export const rowsOf = (records: readonly CaseRecord[], auditByCase: ReadonlyMap<string, AuditReasons>) =>
  records.flatMap((record) => {
    const audit = auditByCase.get(record.caseId)
    if (audit === undefined && record.candidates.length > 0)
      throw new Error('Missing audit reasons for a completed post')
    return record.candidates.map(
      (candidate): SettingRow => ({
        candidate,
        audit90: audit === undefined ? [] : audit.audit90,
        audit70: audit === undefined ? [] : audit.audit70
      })
    )
  })

const count = <T>(rows: readonly T[], predicate: (row: T) => boolean) => rows.filter(predicate).length
// endDateAnnounceTime は終了日を announce-time（R1）で比べた列。endDate は strict のまま。
const COMPARED = [...FIELD_NAMES, 'character', 'endDateAnnounceTime'] as const
const matchOf = (fields: FieldMatches, name: (typeof COMPARED)[number]) => fields[name]

// 1つの設定の登録の質。登録に進んだ候補のうち、D1 の正解に対応づかないものは不正解に数える（文脈候補も同じ）。
// 最上位の数字（exact・precision など）は strict（終了日の完全一致）のまま。announceTime が R1（主指標）。
// 登録の可否・終了日以外の項目の比較は 2 通りで同じで、終了日の一致だけが違う。
export const settingMetrics = (setting: Setting, rows: readonly SettingRow[], posts: number, goldEvents: number) => {
  const picked = rows.map((row) => ({ row, outcome: setting.pick(row) }))
  const registered = picked.filter(({ outcome }) => outcome.status === 'register')
  const withGold = registered.filter(({ outcome }) => outcome.fields !== null)
  const registeredReal = registered.filter(({ row }) => !row.candidate.contextOnly)
  const held = picked.filter(({ outcome }) => outcome.status === 'held')
  const qualityOf = (mode: EndDateMode) => {
    const exact = withGold.filter(({ outcome }) => outcome.fields !== null && allFieldsMatch(outcome.fields, mode))
    const exactReal = exact.filter(({ row }) => !row.candidate.contextOnly)
    return {
      exact: exact.length,
      exactRealOnly: exactReal.length,
      wrongMatched: withGold.length - exact.length,
      // 登録の精度 = 全項目一致の登録 / 登録に進んだ候補（対応づかない登録は不正解）。
      precision: rate(exact.length, registered.length),
      // 文脈候補を除き、抽出が作った候補だけで数えた精度（机上の確認と同じ範囲）。
      precisionRealOnly: rate(exactReal.length, registeredReal.length),
      // 全項目一致の登録率 = 全項目一致の登録 / D1 の正解イベント。
      exactRegistrationRate: rate(exact.length, goldEvents),
      wrongByField: countByKey(
        withGold.flatMap(({ outcome }) => (outcome.fields === null ? [] : failedFields(outcome.fields, mode))),
        (name) => name
      )
    }
  }
  const strict = qualityOf('strict')
  const fieldRate = (name: (typeof COMPARED)[number]): Rate => {
    const compared = withGold.flatMap(({ outcome }) => {
      const value = outcome.fields === null ? null : matchOf(outcome.fields, name)
      return value === null ? [] : [value]
    })
    return rate(
      count(compared, (value) => value),
      compared.length
    )
  }
  return {
    id: setting.id,
    label: setting.label,
    sample: {
      posts,
      goldEvents,
      candidates: rows.length,
      contextOnlyCandidates: count(rows, (row) => row.candidate.contextOnly)
    },
    statusCounts: countByKey(picked, ({ outcome }) => outcome.status),
    registered: registered.length,
    // 机上の基準（文脈候補を除く）との突き合わせに使う。strict の数字。
    registeredRealOnly: registeredReal.length,
    exactRealOnly: strict.exactRealOnly,
    registeredContextOnly: registered.length - registeredReal.length,
    exact: strict.exact,
    wrongMatched: strict.wrongMatched,
    wrongUnmatched: registered.length - withGold.length,
    precision: strict.precision,
    precisionRealOnly: strict.precisionRealOnly,
    exactRegistrationRate: strict.exactRegistrationRate,
    // 終了日を announce-time（R1）で比べた数字。D1 の終了日は終了後に確定した値なので、こちらを主指標にする。
    announceTime: qualityOf('announce-time'),
    postsWithRegister: rate(new Set(registered.map(({ row }) => row.candidate.caseId)).size, posts),
    registeredFieldMatch: Object.fromEntries(COMPARED.map((name) => [name, fieldRate(name)])),
    wrongByField: strict.wrongByField,
    held: held.length,
    heldReasons: countByKey(
      held.flatMap(({ outcome }) => outcome.reasons),
      (reason) => reason
    ),
    heldFirstReason: countByKey(
      held.filter(({ outcome }) => outcome.reasons.length > 0),
      ({ outcome }) => outcome.reasons[0]
    )
  }
}
export type SettingMetrics = ReturnType<typeof settingMetrics>
