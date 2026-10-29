import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  CHARACTER_CONFIRM_QUESTION,
  createConfirmRequest,
  STORE_CONFIRM_QUESTION,
  STORE_TARGET_LABEL
} from './association-confirm'
import { CHARACTER_CONFIRM_KEY, STORE_CONFIRM_KEY } from './associations'
import { DETECTION_VERSION } from './detection'
import { post, requestWithAssociations } from './detection-test-fixtures'
import { webhookPromptDefinition } from './prompt-definitions'
import { promptVersionLabel } from './prompt-version-label'

// v18: 2段目の店舗の確認（store_confirm）の質問だけを直した版。本文（と引用元）に別の店舗での開催・配布が明示されていなければ、
// 確認対象が投稿者の店舗のとき「はい」と答える。1段目の質問と、2段目の娘の確認（character_confirm）の質問は v17 と同一。
const V15 = 'v5-webhook-v15-concise-author'
const V16 = 'v5-webhook-v16-confirm-selection'
const V17 = 'v5-webhook-v17-store-character'
const V18 = 'v5-webhook-v18-store-confirm-default'
// v16・v17 の保存済みの定義にある店舗の確認の質問（「明らかな場合のみ」で控えめすぎた文言）。保存済みの定義は変えられない。
const V17_STORE_CONFIRM_INSTRUCTIONS =
  'state の『確認対象の開催店舗』は、この企画の対象物（配布物・記念限定販売品）を実際に入手できる開催・配布店舗ですか？ 対象キャラクターの所属店舗と開催店舗は別です。投稿者の店舗は、文脈上そこで配布すると明らかな場合のみ「はい」としてください。'
// 娘の確認の質問は v16 から変わっていない。
const CHARACTER_CONFIRM_INSTRUCTIONS =
  'state の『確認対象のビッカメ娘』は、この企画の対象物に描かれる、または対象物そのものの対象のビッカメ娘ですか？ 開催店舗・投稿者の娘と同一と仮定しないでください。本文に名前のない娘を推測しないでください。'

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
const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

describe('2段目の店舗の確認の質問文（v18）', () => {
  const { instructions } = STORE_CONFIRM_QUESTION

  test('本文に別の店舗の明示がなければ、確認対象が投稿者の店舗のとき「はい」とする趣旨が書かれている', () => {
    expect(instructions).toContain(
      '本文（と引用元）に別の店舗で開催・配布すると明示されていなければ、この企画の開催店舗は投稿者の店舗です'
    )
    expect(instructions).toContain(
      '確認対象が投稿者の店舗で、別の店舗での開催・配布が明示されていないときは「はい」としてください'
    )
    // 「投稿者の店舗」が state のどの行かを示す。
    expect(instructions).toContain('投稿者の店舗は、state の「投稿者: @… / 〇〇店」の行の店舗です')
    // v17 までの控えめな条件は残っていない。
    expect(instructions).not.toContain('明らかな場合のみ')
  })
  test('確認対象が別の店舗のときは、本文でその店舗での開催・配布が示されているときだけ「はい」とする趣旨が書かれている', () => {
    expect(instructions).toContain(
      '確認対象が投稿者の店舗ではない別の店舗のときは、本文にその店舗での開催・配布が示されているときだけ「はい」としてください'
    )
  })
  test('「対象キャラクターの所属店舗と開催店舗は別です」の注意書きが残り、確認対象の行のラベルを指している', () => {
    expect(instructions).toContain('対象キャラクターの所属店舗と開催店舗は別です')
    expect(instructions).toContain(`state の『${STORE_TARGET_LABEL}』`)
    expect(STORE_CONFIRM_QUESTION.type).toBe('noul')
  })
  test('instructions は 2000 字以内で、投稿ごとの値（店舗名・id）を含まない', () => {
    expect(instructions.length).toBeLessThanOrEqual(2000)
    const request = createConfirmRequest(requestWithAssociations(post()), { store: 'abeno', character: 'funato' })
    expect(request.questions[STORE_CONFIRM_KEY]).toEqual(STORE_CONFIRM_QUESTION)
    for (const value of ['abeno', 'あべの', 'bic_abeno']) expect(instructions).not.toContain(value)
  })
  test('娘の確認の質問は v16 から 1 文字も変わっていない', () => {
    expect(CHARACTER_CONFIRM_QUESTION).toEqual({ type: 'noul', instructions: CHARACTER_CONFIRM_INSTRUCTIONS })
  })
})

describe('版: 現行は v18 で、v15〜v17 の保存済みの定義は変わらない', () => {
  const v17 = definitionOf(V17)
  const v18 = definitionOf(V18)

  test('DETECTION_VERSION は v18 で、画面の表示名は v18', () => {
    expect(DETECTION_VERSION).toBe(V18)
    expect(promptVersionLabel(DETECTION_VERSION)).toBe('v18')
  })
  test('v18 の質問は v17 と並びも 1 段目も娘の確認も同じで、店舗の確認だけが違う', () => {
    expect(v18.questions.map((question) => question.key)).toEqual(v17.questions.map((question) => question.key))
    const differing = v18.questions.filter((question, index) => sha256(question) !== sha256(v17.questions[index]))
    expect(differing.map((question) => question.key)).toEqual([STORE_CONFIRM_KEY])
    expect(v18.stateTemplate).toBe(v17.stateTemplate)
    expect(v18.dynamicCriteria).toBe(v17.dynamicCriteria)
    expect(v18.origin).toBe(v17.origin)
  })
  test('v18 の確認の質問は、実際に送る質問と文言・型・選択肢まで完全に一致する', () => {
    const request = createConfirmRequest(requestWithAssociations(post()), { store: 'abeno', character: 'funato' })
    expect(Object.keys(request.questions)).toEqual([STORE_CONFIRM_KEY, CHARACTER_CONFIRM_KEY])
    for (const [key, question] of Object.entries(request.questions)) {
      const defined = questionOf(V18, key)
      expect(defined.type).toBe(question.type)
      expect(defined.instructions).toBe(question.instructions)
      expect(defined.criteria).toEqual({})
    }
  })
  test('v16・v17 の定義の店舗の確認は v17 までの旧文言のまま、娘の確認は現行と同一', () => {
    for (const version of [V16, V17]) {
      expect(questionOf(version, STORE_CONFIRM_KEY).instructions).toBe(V17_STORE_CONFIRM_INSTRUCTIONS)
      expect(questionOf(version, STORE_CONFIRM_KEY).instructions).not.toBe(STORE_CONFIRM_QUESTION.instructions)
      expect(questionOf(version, CHARACTER_CONFIRM_KEY).instructions).toBe(CHARACTER_CONFIRM_QUESTION.instructions)
    }
  })
  test('v15〜v17 の保存済みの定義は 1 文字も変わっておらず、v18 の定義も固定される（内容のハッシュ）', () => {
    expect(sha256(definitionOf(V15))).toBe('4dea483fb9bb0eec2b07087ce6ba616846baefd0c33932fbb1cd4f24a7ed765a')
    expect(sha256(definitionOf(V16))).toBe('76b9605b4a919a8b56aa096525792ec940f5fb460f599666ad7644f7b735f2b9')
    expect(sha256(v17)).toBe('9599e3c0136842750ad73c52a7a5b63c1a5f195a1ea662e0db4b179c672bd319')
    expect(sha256(v18)).toBe('0ea84734adc7258e2d7138777dc9aee146ce5cec06e64f29d4c6c2d0ef916763')
  })
  test('現行の 1 段目の質問は、v17 の保存済みの定義と文言・型・固定の選択肢まで同一（1 段目は変えていない）', () => {
    const first = requestWithAssociations(post())
    const keys = Object.keys(first.questions)
    expect(keys).toContain('store')
    expect(keys).toContain('character')
    for (const [key, question] of Object.entries(first.questions)) {
      const before = questionOf(V17, key)
      expect(question.type).toBe(before.type)
      expect(question.instructions).toBe(before.instructions)
      const dynamic = Object.keys(before.criteria).length === 1 && Object.hasOwn(before.criteria, 'dynamic')
      if (question.type !== 'choice' || dynamic) continue
      // 版定義の選択肢は全サンプル投稿の和集合。1 投稿の request に出る選択肢は、その部分集合で説明も同じ。
      for (const [option, label] of Object.entries(question.criteria))
        expect(before.criteria[option], `${key}.${option}`).toBe(label)
      // 店舗と娘の選択肢は版ごとに固定で、全投稿で同じ（部分集合ではなく完全一致）。
      if (key === 'store' || key === 'character') expect(question.criteria).toEqual(before.criteria)
    }
  })
})
