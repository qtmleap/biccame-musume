import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { DETECTION_VERSION } from './detection'
import { post, requestWithAssociations } from './detection-test-fixtures'
import type { DetectPost } from './post'
import { webhookPromptDefinition, webhookPromptDefinitions } from './prompt-definitions'
import { promptVersionLabel } from './prompt-version-label'

// v19: 配布物（category）の選択肢に gift_card を足した版（質問文は v18 から変えていない）。生成済みの版定義（手で編集しない。
// scripts/generate-webhook-prompt-definitions.ts が作る）は追加分だけで、既存の版は 1 文字も変わらない。
const V18 = 'v5-webhook-v18-store-confirm-default'
const V19 = 'v5-webhook-v19-gift-card-category'
// v19 を足す前に保存されていた 20 件の版定義（v2〜v18 と抽出用）の内容のハッシュ。版定義は追記のみで、先頭 20 件は変えない。
const FIRST_20_DEFINITIONS_SHA256 = '36022f58c988c98d2cb1c9dcb10903eabe51424ae3023e67a99dee68c0430936'
const V19_DEFINITION_SHA256 = '6b51cc8b8218c7b40804d9bc13bb02071745c00b4e31d7b475ad42d69c03c9fb'
const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

const definitionOf = (version: string) => {
  const definition = webhookPromptDefinition(version)
  if (definition === undefined) throw new Error(`Missing prompt definition: ${version}`)
  return definition
}
const questionOf = (version: string, key: string) => {
  const question = definitionOf(version).questions.find((entry) => entry.key === key)
  if (question === undefined) throw new Error(`Missing ${key} question in ${version}`)
  return question
}
const withItem = (item: string, text: string): DetectPost =>
  post(text, { extractionContext: { kind: 'item', item, evidence: [text], originalText: text } })

describe('版: 現行は v19', () => {
  test('DETECTION_VERSION は v19 で、画面の表示名は v19', () => {
    expect(DETECTION_VERSION).toBe(V19)
    expect(promptVersionLabel(DETECTION_VERSION)).toBe('v19')
  })

  test('生成済みの版定義に v19 があり、末尾に 1 件だけ足されている（既存の 20 件は内容も並びも不変）', () => {
    expect(webhookPromptDefinitions).toHaveLength(21)
    expect(webhookPromptDefinitions.at(-1)?.questionVersion).toBe(V19)
    expect(sha256(webhookPromptDefinitions.slice(0, 20))).toBe(FIRST_20_DEFINITIONS_SHA256)
    expect(webhookPromptDefinitions.filter((entry) => entry.questionVersion === V19)).toHaveLength(1)
    expect(sha256(definitionOf(V19))).toBe(V19_DEFINITION_SHA256)
  })
})

describe('v19 の定義は v18 との差が category の選択肢（dynamic 化）と dynamicCriteria の追記だけ', () => {
  const v18 = definitionOf(V18)
  const v19 = definitionOf(V19)

  test('質問の並びとキーは v18 と同じで、違うのは category の質問だけ（origin と stateTemplate も同一）', () => {
    expect(v19.questions.map((question) => question.key)).toEqual(v18.questions.map((question) => question.key))
    const differing = v19.questions.filter((question, index) => sha256(question) !== sha256(v18.questions[index]))
    expect(differing.map((question) => question.key)).toEqual(['category'])
    expect(v19.origin).toBe(v18.origin)
    expect(v19.stateTemplate).toBe(v18.stateTemplate)
  })

  test('category の質問は、違うのは選択肢（criteria）だけ。型と質問文は v18 と一字も違わない', () => {
    const before = questionOf(V18, 'category')
    const after = questionOf(V19, 'category')
    expect(after.type).toBe(before.type)
    expect(after.instructions).toBe(before.instructions)
    expect(after.criteria).not.toEqual(before.criteria)
    // 質問文は v18 の文のまま（ギフトカードの1文を言い換えていない）。
    expect(after.instructions).toContain('ギフトカードと明記された対象物はotherであり、販売品でもnoneにしません。')
  })

  test('category の選択肢は dynamic（投稿ごとに変わる）になり、gift_card の出る条件と other の説明の違いを説明している', () => {
    const { criteria } = questionOf(V19, 'category')
    expect(Object.keys(criteria)).toEqual(['dynamic'])
    expect(criteria.dynamic).toContain('gift_card')
    expect(criteria.dynamic).toContain('物品の名前')
    expect(criteria.dynamic).toContain('ギフトカードを外した版')
  })

  test('定義全体の説明に category の選択肢が投稿ごとに決まることが足され、v18 の説明はそのまま前置きされる', () => {
    expect(v19.dynamicCriteria.startsWith(v18.dynamicCriteria)).toBe(true)
    expect(v19.dynamicCriteria.slice(v18.dynamicCriteria.length)).toContain('配布物（category）')
    expect(v19.dynamicCriteria.slice(v18.dynamicCriteria.length)).toContain('質問文は全投稿で同じ')
  })

  test('v18 の category は固定の選択肢のまま（保存済みの定義は変えない）', () => {
    const { criteria } = questionOf(V18, 'category')
    expect(Object.keys(criteria)).toEqual(['limited_card', 'regular_card', 'ackey', 'acsta', 'other', 'none'])
    expect(criteria.other).toContain('ギフトカード')
  })
})

describe('v19 の定義は実際に送る質問と一致する', () => {
  const cases: [string, DetectPost][] = [
    ['gift_card を出す投稿', withItem('4店舗特典ギフトカード', '名刺とギフトカードを配布します')],
    ['gift_card を出さない投稿（物品名が別の物）', withItem('限定名刺', 'ギフトカードの入金で限定名刺を配布します')],
    ['抽出文脈なし', post('ギフトカードを配布します')]
  ]

  test.each(cases)('%s: 全ての質問の型と質問文が定義と同一で、固定の選択肢は定義と同一', (_label, value) => {
    const request = requestWithAssociations(value)
    for (const [key, question] of Object.entries(request.questions)) {
      const defined = questionOf(V19, key)
      expect(defined.type, key).toBe(question.type)
      expect(defined.instructions, key).toBe(question.instructions)
      const dynamic = Object.keys(defined.criteria).length === 1 && Object.hasOwn(defined.criteria, 'dynamic')
      if (question.type !== 'choice' || dynamic) continue
      // 固定の選択肢は版定義と一字も違わない（部分集合ではなく、定義に載る説明と同じ）。
      for (const [option, label] of Object.entries(question.criteria))
        expect(defined.criteria[option], `${key}.${option}`).toBe(label)
    }
  })
})
