import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { describeAnswers } from './answer-view'
import { thresholds } from './answer-view-test-fixtures'
import {
  confirmQuestions,
  confirmTargetOf,
  createConfirmRequest,
  hasConfirmTarget,
  isConcreteCharacter
} from './association-confirm'
import { CHARACTER_STORE_CRITERIA, characterCriteria } from './association-questions'
import {
  CHARACTER_CONFIRM_KEY,
  CHARACTER_STORE,
  detectionCharacters,
  detectionStores,
  STORE_CONFIRM_KEY,
  selectedCharacterIds
} from './associations'
import type { ClefAnswer, ClefRequest } from './clef'
import { buildDetectionDraft } from './detection'
import { draftCharacterIds, resolveCharacterIds } from './detection-character'
import {
  associationAnswers,
  choice,
  choiceQuestionOf,
  choiceThresholds,
  evaluateWithStore,
  post,
  requestWithAssociations,
  response,
  uncertainAnswers
} from './detection-test-fixtures'
import { webhookPromptDefinition } from './prompt-definitions'

// v17: 娘の質問に store_character（本文でビッカメ娘に特に言及がない = 開催店舗の娘）を足した。規則は「娘が明示されていなければ、その店舗の娘」。
const V15 = 'v5-webhook-v15-concise-author'
const V16 = 'v5-webhook-v16-confirm-selection'
const V17 = 'v5-webhook-v17-store-character'
const definitionOf = (version: string) => {
  const definition = webhookPromptDefinition(version)
  if (definition === undefined) throw new Error(`Missing prompt definition: ${version}`)
  return definition
}
const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

const value = post('2026年11月3日から名刺を全員に配布します', {
  screenName: 'bic_funabashi',
  url: 'https://x.com/bic_funabashi/status/2109221721773576390'
})
const first = requestWithAssociations(value)
const base: Record<string, ClefAnswer> = {
  category: choice('limited_card', { limited_card: 0.99 }),
  condition: choice('everyone', { everyone: 0.99 }),
  quantity: choice('none', { none: 0.99 })
}
const run = (overrides: Record<string, ClefAnswer>, request: ClefRequest = first) => {
  const answers = response(request, { ...base, ...associationAnswers('funabashi', 'store_character'), ...overrides })
  return evaluateWithStore(value, request, answers)
}

describe('1段目の娘の質問文と選択肢（v17）', () => {
  const { instructions, criteria } = choiceQuestionOf(first, 'character')

  test('「店舗の娘と同一と仮定しない」注意書きを外し、言及がなければ店舗の娘として store_character を選ぶ規則を書く', () => {
    expect(instructions).not.toContain('同一と仮定しない')
    expect(instructions).not.toContain('仮定')
    expect(instructions).toContain('本文に名前のない娘を推測しない')
    expect(instructions).toContain(`開催店舗の娘が対象なので ${CHARACTER_STORE} を選んでください`)
    expect(instructions).toContain('どの娘の名前・愛称・デザインにも触れていない')
  })
  test('store_character・other・secret・multiple・none の使い分けが文面にある', () => {
    expect(instructions).toContain('multiple を選んでください')
    expect(instructions).toContain('特定の娘に紐付かないときは other')
    expect(instructions).toContain('伏せられているときは secret')
    expect(instructions).toContain('言及がないだけのときは other ではなく store_character')
    expect(instructions).toContain('ビッカメ娘の企画ではない場合は none')
  })
  test('選択肢は 51 人の後に store_character を置き、説明は定数と同じで他の説明と重ならない', () => {
    const keys = Object.keys(criteria)
    expect(keys).toHaveLength(56)
    expect(keys.slice(detectionCharacters.length)).toEqual(['store_character', 'other', 'secret', 'multiple', 'none'])
    expect(criteria.store_character).toBe(CHARACTER_STORE_CRITERIA)
    expect(criteria.store_character).toContain('ビッカメ娘に特に言及がない')
    expect(criteria.store_character).toContain('開催店舗の娘として扱う')
    expect(characterCriteria()).toEqual(criteria)
    expect(new Set(Object.values(criteria)).size).toBe(keys.length)
  })
  test('store_character は娘のカタログの id でも店舗キーでもなく、保存先の EventCharacter にもならない', () => {
    expect(detectionCharacters.some((entry) => entry.id === CHARACTER_STORE)).toBe(false)
    expect(detectionStores.some((entry) => entry.id === CHARACTER_STORE)).toBe(false)
    expect(selectedCharacterIds(CHARACTER_STORE)).toEqual([])
    expect(isConcreteCharacter(CHARACTER_STORE)).toBe(false)
  })
})

describe('版定義: v17 は娘の質問だけが v16 と違い、v15・v16 の定義は変わらない', () => {
  const v15 = definitionOf(V15)
  const v16 = definitionOf(V16)
  const v17 = definitionOf(V17)

  test('v17 の質問は v16 と並びも店舗の質問も確認の2問も同じで、娘の質問だけが違う', () => {
    expect(v17.questions.map((question) => question.key)).toEqual(v16.questions.map((question) => question.key))
    const differing = v17.questions.filter((question, index) => sha256(question) !== sha256(v16.questions[index]))
    expect(differing.map((question) => question.key)).toEqual(['character'])
    for (const key of ['store', STORE_CONFIRM_KEY, CHARACTER_CONFIRM_KEY])
      expect(v17.questions.find((question) => question.key === key)).toEqual(
        v16.questions.find((question) => question.key === key)
      )
    expect(v17.stateTemplate).toBe(v16.stateTemplate)
    expect(v17.dynamicCriteria).toBe(v16.dynamicCriteria)
    expect(v17.origin).toBe(v16.origin)
  })
  test('v17 の娘の質問は v16 の選択肢に store_character を足したもので、文言は現行コードの質問と一致する', () => {
    const before = v16.questions.find((question) => question.key === 'character')
    const after = v17.questions.find((question) => question.key === 'character')
    if (before === undefined || after === undefined) throw new Error('Missing character question')
    expect(Object.keys(after.criteria).filter((key) => key !== CHARACTER_STORE)).toEqual(Object.keys(before.criteria))
    expect({ ...after.criteria, [CHARACTER_STORE]: undefined }).toEqual({
      ...before.criteria,
      [CHARACTER_STORE]: undefined
    })
    expect(before.instructions).toContain('開催店舗・投稿者の娘と同一と仮定しないでください')
    const actual = choiceQuestionOf(first, 'character')
    expect(after.instructions).toBe(actual.instructions)
    expect(after.criteria).toEqual(actual.criteria)
  })
  test('v15・v16 の保存済みの定義は 1 文字も変わっていない（現行のソースは前の版の質問を作れないので、内容のハッシュで守る）', () => {
    expect(sha256(v15)).toBe('4dea483fb9bb0eec2b07087ce6ba616846baefd0c33932fbb1cd4f24a7ed765a')
    expect(sha256(v16)).toBe('76b9605b4a919a8b56aa096525792ec940f5fb460f599666ad7644f7b735f2b9')
  })
})

describe('store_character の採用（resolveCharacterIds の単体）', () => {
  const input = { stores: ['funabashi'], choice: undefined, top: undefined, confirmLow: false }

  test('確率が下限以上の store_character は、採用した店舗の娘', () => {
    expect(resolveCharacterIds({ ...input, choice: CHARACTER_STORE, top: CHARACTER_STORE })).toEqual(['funabashi'])
  })
  test('確率が下限に届かなくても最上位が store_character なら、採用した店舗の娘', () => {
    expect(resolveCharacterIds({ ...input, top: CHARACTER_STORE })).toEqual(['funabashi'])
  })
  test('店舗が採用されない、または店舗の ID が EventCharacter として無効なら、空（保留）', () => {
    for (const stores of [[], ['invented']]) {
      expect(resolveCharacterIds({ ...input, stores, choice: CHARACTER_STORE, top: CHARACTER_STORE })).toEqual([])
      expect(resolveCharacterIds({ ...input, stores, top: CHARACTER_STORE })).toEqual([])
    }
  })
  test('multiple・none は従来どおり空、other・secret は従来どおりその値', () => {
    for (const top of ['multiple', 'none']) {
      expect(resolveCharacterIds({ ...input, choice: top, top })).toEqual([])
      expect(resolveCharacterIds({ ...input, top })).toEqual([])
    }
    for (const top of ['other', 'secret']) expect(resolveCharacterIds({ ...input, choice: top, top })).toEqual([top])
  })
})

describe('store_character の判定（evaluateDetection）', () => {
  test('店舗が採用されていれば、店舗の娘で登録する（確率 0.9 でも 0.1 でも）', () => {
    for (const probability of [0.9, 0.1]) {
      const result = run({ character: choice(CHARACTER_STORE, { [CHARACTER_STORE]: probability, funato: 0.05 }) })
      if (result.status !== 'register') throw new Error(`Expected registration: ${result.reasons.join(',')}`)
      expect(result.candidate.characterIds, String(probability)).toEqual(['funabashi'])
      expect(result.reasons).toEqual([])
    }
  })
  test('最上位が store_character なら、2 段目で娘の確認は聞かれず（具体的な娘ではない）、店舗の確認が通れば店舗の娘で登録する', () => {
    // 店舗は 60%（70% 未満）なので確認を聞く。娘は store_character なので、確率に関わらず確認の対象にならない。
    const answers = uncertainAnswers('funabashi', CHARACTER_STORE)
    const asked = createConfirmRequest(first, confirmTargetOf(answers, choiceThresholds()))
    const request = { ...first, questions: { ...first.questions, ...asked.questions } }
    expect(Object.keys(asked.questions)).toEqual([STORE_CONFIRM_KEY])
    const result = run({ ...answers, [STORE_CONFIRM_KEY]: { type: 'noul', noul: 0.99 } }, request)
    if (result.status !== 'register') throw new Error(`Expected registration: ${result.reasons.join(',')}`)
    expect(result.candidate.characterIds).toEqual(['funabashi'])
  })
  test('店舗が採用されない（none・multiple・確率不足）ときは、store_character でも保留', () => {
    for (const store of [choice('none', { none: 0.99 }), choice('multiple', { multiple: 0.99 })]) {
      const result = run({ store })
      expect(result).toMatchObject({ status: 'held', reasons: ['store_unconfirmed', 'character_unconfirmed'] })
      expect(result).not.toHaveProperty('candidate')
    }
    // 70% 未満で確認の質問が無い（旧版の保存データ）店舗は採用されない。
    const weak = run({ store: choice('funabashi', { funabashi: 0.25, none: 0.2 }) })
    expect(weak).toMatchObject({ status: 'held', reasons: ['store_unconfirmed', 'character_unconfirmed'] })
  })
  test('店舗の確認が下限未満で店舗が採用されないときも、store_character は店舗の娘にならず保留', () => {
    const asked = createConfirmRequest(first, { store: 'funabashi' })
    const request = { ...first, questions: { ...first.questions, ...asked.questions } }
    const result = run(
      { store: choice('funabashi', { funabashi: 0.6 }), [STORE_CONFIRM_KEY]: { type: 'noul', noul: 0.4 } },
      request
    )
    expect(result).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed', 'store_confirm_low', 'character_unconfirmed']
    })
  })
  test('multiple・none は従来どおり保留、other は従来どおり other で登録する', () => {
    for (const top of ['multiple', 'none'])
      expect(run(associationAnswers('funabashi', top))).toMatchObject({
        status: 'held',
        reasons: ['character_unconfirmed']
      })
    const result = run(associationAnswers('funabashi', 'other'))
    if (result.status !== 'register') throw new Error(`Expected registration: ${result.reasons.join(',')}`)
    expect(result.candidate.characterIds).toEqual(['other'])
  })
})

describe('2段目の確認の対象（confirmTargetOf）', () => {
  test('store_character は具体的な娘ではないので、娘の確認の対象にならない（店舗だけ聞く。店舗が 70% 未満のとき）', () => {
    const target = confirmTargetOf(uncertainAnswers('funabashi', CHARACTER_STORE), choiceThresholds())
    expect(target).toEqual({ store: 'funabashi' })
    expect(Object.keys(confirmQuestions(target))).toEqual([STORE_CONFIRM_KEY])
  })
  test('店舗が none・multiple で娘が store_character なら、聞く対象が無い', () => {
    for (const store of ['none', 'multiple'])
      expect(hasConfirmTarget(confirmTargetOf(uncertainAnswers(store, CHARACTER_STORE), choiceThresholds()))).toBe(
        false
      )
  })
  test('具体的な娘は、70% 未満なら対象になり、70% 以上なら対象にならない', () => {
    expect(confirmTargetOf(uncertainAnswers('funabashi', 'funato'), choiceThresholds())).toEqual({
      store: 'funabashi',
      character: 'funato'
    })
    expect(confirmTargetOf(associationAnswers('funabashi', 'funato'), choiceThresholds())).toEqual({})
  })
})

describe('保留ジョブの下書き（buildDetectionDraft）', () => {
  const draftOf = (store: string, character: string) =>
    buildDetectionDraft(value, { ...base, ...associationAnswers(store, character) })

  test('最上位が store_character なら、下書きの店舗の娘にする', () => {
    expect(draftOf('funabashi', CHARACTER_STORE)).toMatchObject({ stores: ['funabashi'], characterIds: ['funabashi'] })
  })
  test('下書きに店舗が無い（none・multiple）なら、娘は空のまま', () => {
    for (const store of ['none', 'multiple']) expect(draftOf(store, CHARACTER_STORE).characterIds).toEqual([])
  })
  test('他の最上位は従来どおり（具体的な娘・other・secret はそのまま、multiple・none は空）', () => {
    expect(draftOf('funabashi', 'funato').characterIds).toEqual(['funato'])
    expect(draftOf('funabashi', 'other').characterIds).toEqual(['other'])
    expect(draftOf('funabashi', 'secret').characterIds).toEqual(['secret'])
    expect(draftOf('funabashi', 'multiple').characterIds).toEqual([])
    expect(draftOf('funabashi', 'none').characterIds).toEqual([])
  })
  test('draftCharacterIds の単体', () => {
    expect(draftCharacterIds(CHARACTER_STORE, ['funabashi'])).toEqual(['funabashi'])
    expect(draftCharacterIds(CHARACTER_STORE, [])).toEqual([])
    expect(draftCharacterIds(CHARACTER_STORE, ['invented'])).toEqual([])
    expect(draftCharacterIds(undefined, ['funabashi'])).toEqual([])
    expect(draftCharacterIds('funato', ['funabashi'])).toEqual(['funato'])
  })
})

describe('回答表（describeAnswers）', () => {
  test('store_character は質問の選択肢の長い説明ではなく、短い固定ラベル「店舗の娘」で出る（最上位にも次点にも）', () => {
    const answers: Record<string, ClefAnswer> = {
      character: choice(CHARACTER_STORE, { [CHARACTER_STORE]: 0.6, funato: 0.3, other: 0.05 })
    }
    const [row] = describeAnswers(answers, thresholds)
    expect(row).toMatchObject({ key: 'character', answer: '店舗の娘', probability: 0.6 })
    const second = describeAnswers(
      { character: choice('funato', { funato: 0.6, [CHARACTER_STORE]: 0.3 }) },
      thresholds
    )[0]
    expect(second.alternatives[0]).toEqual({ answer: '店舗の娘', probability: 0.3 })
  })
})
