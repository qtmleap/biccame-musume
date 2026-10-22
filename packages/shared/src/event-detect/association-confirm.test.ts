import { describe, expect, test } from 'bun:test'
import {
  CHARACTER_CONFIRM_QUESTION,
  CHARACTER_TARGET_LABEL,
  characterShortName,
  confirmQuestions,
  confirmStateLines,
  confirmTargetOf,
  createConfirmRequest,
  hasConfirmTarget,
  isConfirmKey,
  isStoreCharacter,
  passesConfirm,
  STORE_CONFIRM_QUESTION,
  STORE_TARGET_LABEL,
  yesProbability
} from './association-confirm'
import { CHARACTER_CONFIRM_KEY, detectionStores, STORE_CONFIRM_KEY } from './associations'
import { type ClefAnswer, ClefRequestSchema } from './clef'
import { DETECTION_VERSION } from './detection'
import { choice, post, requestWithAssociations } from './detection-test-fixtures'
import { webhookPromptDefinition } from './prompt-definitions'

const first = requestWithAssociations(post())
const answersOf = (store: string, character: string): Record<string, ClefAnswer> => ({
  store: choice(store, { [store]: 0.8 }),
  character: choice(character, { [character]: 0.8 })
})

describe('2段目の対象は、1段目の最上位が具体的な店舗・娘のときだけ選ぶ', () => {
  test('店舗も娘も具体的なら両方を対象にする', () => {
    expect(confirmTargetOf(answersOf('abeno', 'funato'))).toEqual({ store: 'abeno', character: 'funato' })
  })
  test.each(['none', 'multiple'])('店舗が %s なら店舗は対象にせず、娘だけを対象にする', (special) => {
    expect(confirmTargetOf(answersOf(special, 'funato'))).toEqual({ character: 'funato' })
  })
  test.each(['none', 'multiple', 'other', 'secret'])('娘が %s なら娘は対象にせず、店舗だけを対象にする', (special) => {
    expect(confirmTargetOf(answersOf('abeno', special))).toEqual({ store: 'abeno' })
  })
  test('店舗の娘（最上位の娘の ID が最上位の店舗の ID と同じ）は、指定がなければ店舗の娘とみなして娘を対象にしない', () => {
    const target = confirmTargetOf(answersOf('abeno', 'abeno'))
    expect(target).toEqual({ store: 'abeno' })
    expect(hasConfirmTarget(target)).toBe(true)
    // 質問も state の娘の行も作らず、店舗の確認だけを聞く。
    expect(Object.keys(confirmQuestions(target))).toEqual([STORE_CONFIRM_KEY])
    expect(confirmStateLines(target)).toEqual([`${STORE_TARGET_LABEL}: あべのキューズモール店`])
    expect(createConfirmRequest(first, target).state).not.toContain(CHARACTER_TARGET_LABEL)
  })
  test('どの店舗でも、同じ ID の娘は店舗の娘として娘を対象にしない', () => {
    expect(detectionStores.length).toBeGreaterThan(40)
    for (const store of detectionStores) {
      expect(confirmTargetOf(answersOf(store.id, store.id))).toEqual({ store: store.id })
      expect(isStoreCharacter(store.id, store.id)).toBe(true)
    }
  })
  test('店舗と別の具体的な娘は、従来どおり娘も対象にする（別の店舗の娘も、店舗の無い娘も）', () => {
    expect(confirmTargetOf(answersOf('funabashi', 'funato'))).toEqual({ store: 'funabashi', character: 'funato' })
    expect(confirmTargetOf(answersOf('abeno', 'akiba'))).toEqual({ store: 'abeno', character: 'akiba' })
    expect(isStoreCharacter('abeno', 'akiba')).toBe(false)
    expect(isStoreCharacter('funabashi', 'funato')).toBe(false)
  })
  test('店舗が none・multiple なら店舗の娘とは言えないので、娘が具体的なら（店舗の ID と同じ名前でも）娘を対象にする', () => {
    for (const special of ['none', 'multiple']) {
      expect(confirmTargetOf(answersOf(special, 'abeno'))).toEqual({ character: 'abeno' })
      expect(isStoreCharacter(special, 'abeno')).toBe(false)
    }
  })
  test('店舗の娘と見なせるのは、店舗も娘も具体的で同じ ID のときだけ', () => {
    expect(isStoreCharacter(undefined, undefined)).toBe(false)
    expect(isStoreCharacter('abeno', undefined)).toBe(false)
    expect(isStoreCharacter(undefined, 'abeno')).toBe(false)
    // 同じ文字列でも、カタログに無い id や none・multiple・other・secret は店舗の娘ではない。
    for (const special of ['none', 'multiple', 'other', 'secret', 'nowhere']) {
      expect(isStoreCharacter(special, special)).toBe(false)
    }
    expect(confirmTargetOf(answersOf('none', 'none'))).toEqual({})
    expect(confirmTargetOf(answersOf('multiple', 'multiple'))).toEqual({})
  })
  test('どちらも具体的でなければ対象は無く、質問も作らない', () => {
    const target = confirmTargetOf(answersOf('none', 'other'))
    expect(target).toEqual({})
    expect(hasConfirmTarget(target)).toBe(false)
    expect(confirmQuestions(target)).toEqual({})
    expect(() => createConfirmRequest(first, target)).toThrow('at least one target')
  })
  test('回答が無い・choice でない・カタログに無い id は対象にしない', () => {
    expect(confirmTargetOf({})).toEqual({})
    expect(confirmTargetOf({ store: { type: 'noul', noul: 0.9 }, character: { type: 'noul', noul: 0.9 } })).toEqual({})
    expect(confirmTargetOf(answersOf('nowhere', 'nobody'))).toEqual({})
  })
  test('確率の下限は見ず、最上位だけで選ぶ（下限は1段目の採用が決める）', () => {
    const low: Record<string, ClefAnswer> = {
      store: choice('abeno', { abeno: 0.05, akiba: 0.04 }),
      character: choice('funato', { funato: 0.05, akiba: 0.04 })
    }
    expect(confirmTargetOf(low)).toEqual({ store: 'abeno', character: 'funato' })
    // 店舗の娘かどうかも最上位だけで決める（確率が低くても、最上位が同じ ID なら娘は聞かない）。
    const lowSame: Record<string, ClefAnswer> = {
      store: choice('abeno', { abeno: 0.05, akiba: 0.04 }),
      character: choice('abeno', { abeno: 0.05, akiba: 0.04 })
    }
    expect(confirmTargetOf(lowSame)).toEqual({ store: 'abeno' })
  })
})

describe('2段目の request', () => {
  test('店舗と娘の両方なら1リクエストにまとめ、キーは store_confirm・character_confirm の noul', () => {
    const request = createConfirmRequest(first, { store: 'abeno', character: 'funato' })
    expect(Object.keys(request.questions)).toEqual([STORE_CONFIRM_KEY, CHARACTER_CONFIRM_KEY])
    expect(request.questions[STORE_CONFIRM_KEY]).toEqual(STORE_CONFIRM_QUESTION)
    expect(request.questions[CHARACTER_CONFIRM_KEY]).toEqual(CHARACTER_CONFIRM_QUESTION)
    expect(Object.values(request.questions).every((question) => question.type === 'noul')).toBe(true)
    expect(ClefRequestSchema.safeParse(request).success).toBe(true)
  })
  test('店舗だけ・娘だけなら、その質問だけを作る', () => {
    expect(Object.keys(createConfirmRequest(first, { store: 'abeno' }).questions)).toEqual([STORE_CONFIRM_KEY])
    expect(Object.keys(createConfirmRequest(first, { character: 'funato' }).questions)).toEqual([CHARACTER_CONFIRM_KEY])
  })
  test('state は1段目の state の末尾に、選ばれた名前の行を足す。モデルは1段目と同じ', () => {
    const flash = requestWithAssociations(post(), 'clef-flash')
    const request = createConfirmRequest(flash, { store: 'yuurakuchou', character: 'funato' })
    expect(request.model).toBe('clef-flash')
    expect(request.state.startsWith(`${flash.state}\n`)).toBe(true)
    const lines = request.state.split('\n')
    expect(lines.at(-2)).toBe(`${STORE_TARGET_LABEL}: 有楽町店`)
    expect(lines.at(-1)).toBe(`${CHARACTER_TARGET_LABEL}: ${characterShortName('funato')}`)
    // 「ビックカメラ」も括弧の ID も付けない。
    const added = lines.slice(-2).join('\n')
    expect(added).not.toContain('ビックカメラ')
    expect(added).not.toMatch(/[（(][a-z0-9]+[）)]/)
  })
  test('店舗だけの対象には店舗の行だけ、娘だけの対象には娘の行だけを足す', () => {
    expect(confirmStateLines({ store: 'akiba' })).toEqual([`${STORE_TARGET_LABEL}: AKIBA店`])
    expect(confirmStateLines({ character: 'funato' })).toEqual([
      `${CHARACTER_TARGET_LABEL}: ${characterShortName('funato')}`
    ])
    expect(confirmStateLines({})).toEqual([])
  })
  test('質問文に投稿ごとの値（店舗名・娘の名前・id）を入れない', () => {
    const a = createConfirmRequest(first, { store: 'abeno', character: 'funato' })
    const b = createConfirmRequest(requestWithAssociations(post('別の投稿')), { store: 'akiba', character: 'nanba' })
    expect(b.questions).toEqual(a.questions)
    const text = JSON.stringify(a.questions)
    for (const value of ['abeno', 'funato', 'akiba', 'あべの', 'ふなとーたん']) expect(text).not.toContain(value)
    expect(STORE_CONFIRM_QUESTION.instructions).toContain(STORE_TARGET_LABEL)
    expect(CHARACTER_CONFIRM_QUESTION.instructions).toContain(CHARACTER_TARGET_LABEL)
  })
  test('娘の質問は、開催店舗・投稿者の娘と同一と仮定しない注意書きを含む（1段目の娘の質問と同じ趣旨）', () => {
    expect(CHARACTER_CONFIRM_QUESTION.instructions).toContain('同一と仮定しないでください')
    expect(CHARACTER_CONFIRM_QUESTION.instructions).toContain('本文に名前のない娘を推測しないでください')
  })
  test('知らない娘の id は例外にする', () => {
    expect(() => characterShortName('nowhere')).toThrow('Unknown character id')
  })
})

describe('確認の「はい」の確率と関門', () => {
  const request = createConfirmRequest(first, { store: 'abeno', character: 'funato' })
  const yes = (store: number, character: number): Record<string, ClefAnswer> => ({
    [STORE_CONFIRM_KEY]: { type: 'noul', noul: store },
    [CHARACTER_CONFIRM_KEY]: { type: 'noul', noul: character }
  })
  test('yesProbability は noul の回答だけを読む', () => {
    expect(yesProbability(yes(0.93, 0.5), STORE_CONFIRM_KEY)).toBe(0.93)
    expect(yesProbability(yes(0.93, 0.5), CHARACTER_CONFIRM_KEY)).toBe(0.5)
    expect(yesProbability({}, STORE_CONFIRM_KEY)).toBeNull()
    expect(yesProbability({ x: choice('a', { a: 1 }) }, 'x')).toBeNull()
  })
  test('下限以上で通り、未満・欠落・noul 以外は通さない', () => {
    expect(passesConfirm(request, yes(0.7, 0.7), STORE_CONFIRM_KEY, 0.7)).toBe(true)
    expect(passesConfirm(request, yes(0.6999, 0.7), STORE_CONFIRM_KEY, 0.7)).toBe(false)
    expect(passesConfirm(request, {}, STORE_CONFIRM_KEY, 0.7)).toBe(false)
    expect(passesConfirm(request, { [STORE_CONFIRM_KEY]: choice('a', { a: 1 }) }, STORE_CONFIRM_KEY, 0.7)).toBe(false)
  })
  test('request に確認の質問が無ければ関門を掛けず通す（v15 以前の保存データ・対象にならなかった項目）', () => {
    expect(passesConfirm(first, {}, STORE_CONFIRM_KEY, 0.7)).toBe(true)
    expect(passesConfirm(first, yes(0.01, 0.01), CHARACTER_CONFIRM_KEY, 0.7)).toBe(true)
    const storeOnly = createConfirmRequest(first, { store: 'abeno' })
    expect(passesConfirm(storeOnly, yes(0.9, 0.01), CHARACTER_CONFIRM_KEY, 0.7)).toBe(true)
  })
  test('isConfirmKey は確認の2キーだけを指す', () => {
    expect(isConfirmKey(STORE_CONFIRM_KEY)).toBe(true)
    expect(isConfirmKey(CHARACTER_CONFIRM_KEY)).toBe(true)
    for (const key of ['store', 'character', 'is_event', 'character_confirm_a']) expect(isConfirmKey(key)).toBe(false)
  })
})

describe('v16 の版定義', () => {
  const definitionOf = (version: string) => {
    const definition = webhookPromptDefinition(version)
    if (definition === undefined) throw new Error(`Missing prompt definition: ${version}`)
    return definition
  }
  const v15 = definitionOf('v5-webhook-v15-concise-author')
  const v16 = definitionOf(DETECTION_VERSION)

  test('1段目の質問は v15 と同一で、末尾に確認の2問だけが足される', () => {
    expect(v16.questionVersion).toBe('v5-webhook-v16-confirm-selection')
    expect(v16.questions.slice(0, v15.questions.length)).toEqual(v15.questions)
    expect(v16.questions.slice(v15.questions.length).map((question) => question.key)).toEqual([
      STORE_CONFIRM_KEY,
      CHARACTER_CONFIRM_KEY
    ])
  })
  test('確認の質問の文言と型は、実際に送る質問と完全に一致する', () => {
    const request = createConfirmRequest(first, { store: 'abeno', character: 'funato' })
    for (const [key, question] of Object.entries(request.questions)) {
      const defined = v16.questions.find((entry) => entry.key === key)
      expect(defined?.type).toBe(question.type)
      expect(defined?.instructions).toBe(question.instructions)
      expect(defined?.criteria).toEqual({})
    }
  })
  test('定義の説明は、店舗の娘には娘の確認を聞かないことを書いている（質問文は変わらない）', () => {
    expect(v16.dynamicCriteria).toContain('character_confirm は送られません')
    expect(v16.stateTemplate).toContain('店舗の娘（最上位の店舗と同じ ID）ではないときだけ娘の行と質問が作られる')
    expect(v15.dynamicCriteria).not.toContain('店舗の娘')
    expect(v15.stateTemplate).not.toContain('店舗の娘')
  })
  test('state のひな形は v15 の末尾に確認の行の説明を足しただけ', () => {
    expect(v16.stateTemplate.startsWith(`${v15.stateTemplate}\n`)).toBe(true)
    expect(v16.stateTemplate.slice(v15.stateTemplate.length)).toContain('確認対象の開催店舗')
    expect(v16.origin).toBe(v15.origin)
  })
})
