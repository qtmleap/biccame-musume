import { describe, expect, test } from 'bun:test'
import {
  answerQuestionKeys,
  describeItemCountAudit,
  ITEM_COUNT_QUESTION_KEY,
  uncheckedItemCountRow
} from './answer-view'
import { type ItemCountAudit, ItemCountAuditSchema, itemCountReviewReasons } from './extraction'

// 保存された件数の監査（extraction_json.itemCountAudit）から、回答表の行と同じ形（質問・回答・確率・しきい値・判定）の行を作る。
const auditOf = (overrides: Partial<ItemCountAudit>): ItemCountAudit => {
  const parsed = ItemCountAuditSchema.safeParse({
    version: 'distribution-items-v2',
    expected: 2,
    probability: 0.95,
    threshold: 0.9,
    extracted: 2,
    candidates: 2,
    status: 'matched',
    ...overrides
  })
  if (!parsed.success) throw new Error('Invalid item count audit fixture')
  return parsed.data
}

describe('件数の監査を回答表の行にする', () => {
  test('一致（matched）は「N種類」と確率・保存したしきい値を出し、確定で、理由は持たない', () => {
    const row = describeItemCountAudit(auditOf({}))
    expect(row).toEqual({
      key: ITEM_COUNT_QUESTION_KEY,
      label: '配布物の種類数',
      answer: '2種類',
      probability: 0.95,
      threshold: 0.9,
      confirmed: true,
      alternatives: []
    })
    expect(Object.hasOwn(row, 'reason')).toBe(false)
  })

  test('確率がしきい値未満（low_confidence）は未確定で、理由を添える', () => {
    const row = describeItemCountAudit(auditOf({ status: 'low_confidence', probability: 0.62, expected: 1 }))
    expect(row).toMatchObject({
      answer: '1種類',
      probability: 0.62,
      threshold: 0.9,
      confirmed: false,
      reason: '確率がしきい値未満'
    })
  })

  test('件数不一致（mismatch）は抽出した種類数を理由に出す', () => {
    const row = describeItemCountAudit(auditOf({ status: 'mismatch', expected: 2, extracted: 3, candidates: 3 }))
    expect(row).toMatchObject({ answer: '2種類', confirmed: false, reason: '抽出3種類と不一致' })
  })

  test('件数を確定できない（unknown）は回答が「未確定」で、確率が無ければ null のまま未確定', () => {
    const row = describeItemCountAudit(auditOf({ status: 'unknown', expected: null, probability: null }))
    expect(row).toMatchObject({
      answer: '未確定',
      probability: null,
      threshold: 0.9,
      confirmed: false,
      reason: '種類数を確定できない'
    })
  })

  test('21種類以上（overflow）は回答が「未確定」で、上限超過を理由に出す', () => {
    const row = describeItemCountAudit(auditOf({ status: 'overflow', expected: null, probability: 0.97 }))
    expect(row).toMatchObject({
      answer: '未確定',
      probability: 0.97,
      confirmed: false,
      reason: '21種類以上（上限超過）'
    })
  })

  test('0種類も「0種類」と出す（未確定ではない）', () => {
    expect(describeItemCountAudit(auditOf({ expected: 0, extracted: 0, candidates: 0 })).answer).toBe('0種類')
  })

  test('しきい値は判定時に保存した値で、現在の設定には左右されない', () => {
    for (const threshold of [0.7, 0.9, 1]) {
      expect(describeItemCountAudit(auditOf({ threshold })).threshold).toBe(threshold)
    }
  })

  test('確定は itemCountReviewReasons（保留理由）と一致する: 全ての状態で「理由なし」⇔ 確定', () => {
    for (const status of ItemCountAuditSchema.shape.status.options) {
      const audit = auditOf({ status })
      expect(describeItemCountAudit(audit).confirmed, status).toBe(itemCountReviewReasons(audit).length === 0)
    }
  })

  test('次点は持たない', () => {
    for (const status of ItemCountAuditSchema.shape.status.options) {
      expect(describeItemCountAudit(auditOf({ status })).alternatives, status).toEqual([])
    }
  })
})

describe('件数の監査を保存していないジョブ（旧保存値・未チェック）の行', () => {
  test('回答は「未チェック」で、確率・しきい値・判定は持たない', () => {
    expect(uncheckedItemCountRow()).toMatchObject({
      key: ITEM_COUNT_QUESTION_KEY,
      label: '配布物の種類数',
      answer: '未チェック',
      probability: null,
      threshold: null,
      confirmed: null,
      alternatives: []
    })
    expect(uncheckedItemCountRow().reason).toContain('再判定')
  })
})

describe('回答表の質問キーとの関係', () => {
  test('件数の判定行のキーは、回答表の質問（項目別のしきい値と対応する一覧）に含めない', () => {
    expect(answerQuestionKeys()).not.toContain(ITEM_COUNT_QUESTION_KEY)
  })
})
