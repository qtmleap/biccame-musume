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
  isConfident,
  isConfirmedYes,
  isConfirmKey,
  STORE_CONFIRM_QUESTION,
  STORE_TARGET_LABEL,
  topProbability,
  wasConfirmAsked,
  yesProbability
} from './association-confirm'
import { CHARACTER_CONFIRM_KEY, CHARACTER_STORE, detectionStores, STORE_CONFIRM_KEY } from './associations'
import { type ClefAnswer, ClefRequestSchema } from './clef'
import { choice, choiceThresholds, post, requestWithAssociations } from './detection-test-fixtures'
import { webhookPromptDefinition } from './prompt-definitions'

const first = requestWithAssociations(post())
// 最上位の確率は 60%（70% 未満）。確認の対象になるかを調べるテストなので、確認を聞く側を既定にする。70% 以上は probability で指定する。
const answersOf = (store: string, character: string, probability = 0.6): Record<string, ClefAnswer> => ({
  store: choice(store, { [store]: probability }),
  character: choice(character, { [character]: probability })
})
const targetOf = (answers: Record<string, ClefAnswer>) => confirmTargetOf(answers, choiceThresholds())

describe('2段目の対象は、1段目の最上位が具体的な店舗・娘のときだけ選ぶ', () => {
  test('店舗も娘も具体的なら両方を対象にする', () => {
    expect(targetOf(answersOf('abeno', 'funato'))).toEqual({ store: 'abeno', character: 'funato' })
  })
  test.each(['none', 'multiple'])('店舗が %s なら店舗は対象にせず、娘だけを対象にする', (special) => {
    expect(targetOf(answersOf(special, 'funato'))).toEqual({ character: 'funato' })
  })
  test.each(['none', 'multiple', 'other', 'secret'])('娘が %s なら娘は対象にせず、店舗だけを対象にする', (special) => {
    expect(targetOf(answersOf('abeno', special))).toEqual({ store: 'abeno' })
  })
  test('店舗の娘（最上位の娘の ID が最上位の店舗の ID と同じ）も、具体的な娘なので店舗と娘の両方を対象にする（二回チェック）', () => {
    const target = targetOf(answersOf('abeno', 'abeno'))
    expect(target).toEqual({ store: 'abeno', character: 'abeno' })
    expect(hasConfirmTarget(target)).toBe(true)
    // 店舗の確認と娘の確認の両方の質問を作り、state の末尾に 2 つの対象の行を足す。
    expect(Object.keys(confirmQuestions(target))).toEqual([STORE_CONFIRM_KEY, CHARACTER_CONFIRM_KEY])
    expect(confirmStateLines(target)).toEqual([
      `${STORE_TARGET_LABEL}: あべのキューズモール店`,
      `${CHARACTER_TARGET_LABEL}: ${characterShortName('abeno')}`
    ])
    const request = createConfirmRequest(first, target)
    expect(Object.keys(request.questions)).toEqual([STORE_CONFIRM_KEY, CHARACTER_CONFIRM_KEY])
    expect(request.questions[STORE_CONFIRM_KEY]).toEqual(STORE_CONFIRM_QUESTION)
    expect(request.questions[CHARACTER_CONFIRM_KEY]).toEqual(CHARACTER_CONFIRM_QUESTION)
    const lines = request.state.split('\n')
    expect(lines.at(-2)).toBe(`${STORE_TARGET_LABEL}: あべのキューズモール店`)
    expect(lines.at(-1)).toBe(`${CHARACTER_TARGET_LABEL}: ${characterShortName('abeno')}`)
  })
  test('本番で見つかった例: 新横浜店の店舗の娘（新横たん）も、店舗と娘の両方を確認する', () => {
    expect(targetOf(answersOf('shinyoko', 'shinyoko'))).toEqual({ store: 'shinyoko', character: 'shinyoko' })
  })
  test('どの店舗でも、店舗の娘（同じ ID）は店舗と娘の両方を対象にする', () => {
    expect(detectionStores.length).toBeGreaterThan(40)
    for (const store of detectionStores) {
      expect(targetOf(answersOf(store.id, store.id)), store.id).toEqual({ store: store.id, character: store.id })
    }
  })
  test('店舗と別の具体的な娘は、従来どおり娘も対象にする（別の店舗の娘も、店舗の無い娘も）', () => {
    expect(targetOf(answersOf('funabashi', 'funato'))).toEqual({ store: 'funabashi', character: 'funato' })
    expect(targetOf(answersOf('abeno', 'akiba'))).toEqual({ store: 'abeno', character: 'akiba' })
  })
  test('店舗が none・multiple なら店舗は対象にせず、娘が具体的なら（店舗の ID と同じ名前でも）娘だけを対象にする', () => {
    for (const special of ['none', 'multiple']) {
      expect(targetOf(answersOf(special, 'abeno'))).toEqual({ character: 'abeno' })
    }
  })
  test('娘を対象にしないのは、確認する具体的な娘が無いとき（store_character・none・multiple・other・secret）だけ', () => {
    // store_character（v17。本文に娘の言及なし = 店舗の娘）は具体的な娘ではないので、娘の確認は聞かない。店舗は聞く。
    expect(targetOf(answersOf('abeno', CHARACTER_STORE))).toEqual({ store: 'abeno' })
    expect(targetOf(answersOf('abeno', CHARACTER_STORE)).character).toBeUndefined()
    for (const special of ['none', 'multiple', 'other', 'secret']) {
      expect(targetOf(answersOf('abeno', special)), special).toEqual({ store: 'abeno' })
    }
    // 同じ文字列でも、カタログに無い id や特別な値は具体的な娘・店舗ではない。
    for (const special of ['none', 'multiple', 'other', 'secret', CHARACTER_STORE, 'nowhere']) {
      expect(targetOf(answersOf(special, special)), special).toEqual({})
    }
  })
  test('どちらも具体的でなければ対象は無く、質問も作らない', () => {
    const target = targetOf(answersOf('none', 'other'))
    expect(target).toEqual({})
    expect(hasConfirmTarget(target)).toBe(false)
    expect(confirmQuestions(target)).toEqual({})
    expect(() => createConfirmRequest(first, target)).toThrow('at least one target')
  })
  test('回答が無い・choice でない・カタログに無い id は対象にしない', () => {
    expect(targetOf({})).toEqual({})
    expect(targetOf({ store: { type: 'noul', noul: 0.9 }, character: { type: 'noul', noul: 0.9 } })).toEqual({})
    expect(targetOf(answersOf('nowhere', 'nobody'))).toEqual({})
  })
  test('最上位の確率が 70% 以上なら確認を聞かない（店舗も娘も、店舗の娘も）。ちょうど 70% も聞かない', () => {
    expect(targetOf(answersOf('abeno', 'funato', 0.85))).toEqual({})
    expect(targetOf(answersOf('abeno', 'abeno', 0.85))).toEqual({})
    expect(targetOf(answersOf('abeno', 'funato', 0.7))).toEqual({})
    // 69.9% は聞く。
    expect(targetOf(answersOf('abeno', 'funato', 0.699))).toEqual({ store: 'abeno', character: 'funato' })
  })
  test('店舗と娘は別々に判断する: 片方が 70% 以上なら、もう片方（70% 未満）だけを聞く', () => {
    const mixed: Record<string, ClefAnswer> = {
      store: choice('abeno', { abeno: 0.85 }),
      character: choice('funato', { funato: 0.6 })
    }
    expect(targetOf(mixed)).toEqual({ character: 'funato' })
    const reversed: Record<string, ClefAnswer> = {
      store: choice('abeno', { abeno: 0.6 }),
      character: choice('funato', { funato: 0.85 })
    }
    expect(targetOf(reversed)).toEqual({ store: 'abeno' })
  })
  test('確率が低くても、最上位が具体的なら聞く。店舗の娘（最上位が同じ ID）も店舗と娘の両方を聞く', () => {
    const low: Record<string, ClefAnswer> = {
      store: choice('abeno', { abeno: 0.05, akiba: 0.04 }),
      character: choice('funato', { funato: 0.05, akiba: 0.04 })
    }
    expect(targetOf(low)).toEqual({ store: 'abeno', character: 'funato' })
    const lowSame: Record<string, ClefAnswer> = {
      store: choice('abeno', { abeno: 0.05, akiba: 0.04 }),
      character: choice('abeno', { abeno: 0.05, akiba: 0.04 })
    }
    expect(targetOf(lowSame)).toEqual({ store: 'abeno', character: 'abeno' })
  })
  test('確率が取れない・欠けた回答は 70% 未満として扱い、確認を聞く側に倒す', () => {
    const missing: Record<string, ClefAnswer> = {
      store: { type: 'choice', choice: 'abeno', probabilities: {} },
      character: { type: 'choice', choice: 'funato', probabilities: {} }
    }
    expect(targetOf(missing)).toEqual({ store: 'abeno', character: 'funato' })
  })
  test('下限は引数で受け取る: 渡した値より低ければ聞かず、高ければ聞く（判定と同じ thresholdOf の値を呼び出し側が渡す）', () => {
    const at60 = answersOf('abeno', 'funato', 0.6)
    expect(confirmTargetOf(at60, { store: 0.5, character: 0.5 })).toEqual({})
    expect(confirmTargetOf(at60, { store: 0.9, character: 0.5 })).toEqual({ store: 'abeno' })
    expect(confirmTargetOf(at60, { store: 0.5, character: 0.9 })).toEqual({ character: 'funato' })
  })
})

describe('1段目の確率と確認の判定ヘルパー', () => {
  test('topProbability は choice の最上位の確率。choice でない回答・欠けた確率は null', () => {
    expect(topProbability(choice('abeno', { abeno: 0.6, akiba: 0.2 }))).toBe(0.6)
    expect(topProbability({ type: 'noul', noul: 0.9 })).toBeNull()
    expect(topProbability(undefined)).toBeNull()
    expect(topProbability({ type: 'choice', choice: 'abeno', probabilities: {} })).toBeNull()
  })
  test('isConfident は下限以上のときだけ true（ちょうど下限は true）。確率が取れなければ false', () => {
    expect(isConfident(choice('abeno', { abeno: 0.7 }), 0.7)).toBe(true)
    expect(isConfident(choice('abeno', { abeno: 0.699 }), 0.7)).toBe(false)
    expect(isConfident({ type: 'choice', choice: 'abeno', probabilities: {} }, 0.7)).toBe(false)
    expect(isConfident(undefined, 0.7)).toBe(false)
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
  test('下限以上で通り、未満・欠落・noul 以外は通らない', () => {
    expect(isConfirmedYes(request, yes(0.7, 0.7), STORE_CONFIRM_KEY, 0.7)).toBe(true)
    expect(isConfirmedYes(request, yes(0.6999, 0.7), STORE_CONFIRM_KEY, 0.7)).toBe(false)
    expect(isConfirmedYes(request, {}, STORE_CONFIRM_KEY, 0.7)).toBe(false)
    expect(isConfirmedYes(request, { [STORE_CONFIRM_KEY]: choice('a', { a: 1 }) }, STORE_CONFIRM_KEY, 0.7)).toBe(false)
  })
  test('request に確認の質問が無ければ、回答に「はい」があっても確認では確定できない（v15 以前の保存データ・対象にならなかった項目）', () => {
    // 以前は「質問が無ければ関門を掛けず通す」だった。70% 未満の確定は確認でしか決まらないので、質問が無ければ確定できない。
    expect(wasConfirmAsked(first, STORE_CONFIRM_KEY)).toBe(false)
    expect(wasConfirmAsked(request, STORE_CONFIRM_KEY)).toBe(true)
    expect(isConfirmedYes(first, yes(0.99, 0.99), STORE_CONFIRM_KEY, 0.7)).toBe(false)
    expect(isConfirmedYes(first, {}, STORE_CONFIRM_KEY, 0.7)).toBe(false)
    const storeOnly = createConfirmRequest(first, { store: 'abeno' })
    expect(isConfirmedYes(storeOnly, yes(0.9, 0.99), CHARACTER_CONFIRM_KEY, 0.7)).toBe(false)
    expect(isConfirmedYes(storeOnly, yes(0.9, 0.99), STORE_CONFIRM_KEY, 0.7)).toBe(true)
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
  // 現行の版（DETECTION_VERSION）は v17 に進んでいる。v16 は保存済みの定義を明示的な ID で引く。
  const v16 = definitionOf('v5-webhook-v16-confirm-selection')

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
  // 保存済みの版定義は変えられない（変えるには版を上げる）。v16・v17 の定義の説明は、店舗の娘には娘の確認を聞かないと書いたまま残っている。
  // 現行の挙動は、店舗の娘にも娘の確認を聞く（confirmTargetOf）。質問文は変わっていない。説明だけが古い。
  test('保存済みの v16 の定義の説明は「店舗の娘には娘の確認を聞かない」のまま（現行の挙動とは違う。版を上げるまで直せない）', () => {
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
