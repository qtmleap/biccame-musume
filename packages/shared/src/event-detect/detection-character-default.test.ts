import { describe, expect, test } from 'bun:test'
import { createConfirmRequest } from './association-confirm'
import { CHARACTER_CONFIRM_KEY, STORE_CONFIRM_KEY } from './associations'
import type { ClefAnswer, ClefRequest } from './clef'
import { DEFAULT_DETECTION_THRESHOLDS, type DetectionThresholds } from './detection'
import { resolveCharacterIds } from './detection-character'
import {
  associationAnswers,
  choice,
  evaluateWithStore,
  post,
  requestWithAssociations,
  response
} from './detection-test-fixtures'

// 規則: 「ビッカメ娘の値が明示されていないときは、その店舗のビッカメ娘」。D1 でも娘が明示されるのは店舗の娘と違うときだけ。
// 明示 = 確率が下限（0.3）以上の娘が、店舗と別の具体的な娘で2段目の確認を通った、または other・secret・店舗と同じ娘。
const value = post('ふなとーたん擬人化記念アクキーを2026年11月3日から全員に配布します', {
  screenName: 'bic_funabashi',
  url: 'https://x.com/bic_funabashi/status/2109221721773576390'
})
const first = requestWithAssociations(value)
// 1段目の request に、2段目の確認の質問をまとめた request（runWebhookDetection がまとめるのと同じ形）。
const withConfirm = (target: { store?: string; character?: string }): ClefRequest => {
  const confirm = createConfirmRequest(first, target)
  return { ...first, questions: { ...first.questions, ...confirm.questions } }
}
const base: Record<string, ClefAnswer> = {
  category: choice('ackey', { ackey: 0.99 }),
  condition: choice('everyone', { everyone: 0.99 }),
  quantity: choice('none', { none: 0.99 })
}
const yes = (store: number, character: number): Record<string, ClefAnswer> => ({
  [STORE_CONFIRM_KEY]: { type: 'noul', noul: store },
  [CHARACTER_CONFIRM_KEY]: { type: 'noul', noul: character }
})
const run = (
  request: ClefRequest,
  overrides: Record<string, ClefAnswer>,
  confirm: Record<string, ClefAnswer> = {},
  thresholds: DetectionThresholds = DEFAULT_DETECTION_THRESHOLDS
) => {
  const answers = response(request, { ...base, ...associationAnswers('funabashi', 'funabashi'), ...overrides }).answers
  const { [STORE_CONFIRM_KEY]: _store, [CHARACTER_CONFIRM_KEY]: _character, ...rest } = answers
  return evaluateWithStore(value, request, { answers: { ...rest, ...confirm } }, thresholds)
}
const registeredCharacters = (result: ReturnType<typeof run>) => {
  if (result.status !== 'register') throw new Error(`Expected registration: ${result.reasons.join(',')}`)
  return result.candidate.characterIds
}
const both = withConfirm({ store: 'funabashi', character: 'funato' })

describe('娘が明示されていなければ、採用した店舗の娘にして保留しない', () => {
  test('確率が下限（0.3）に届かない娘は、最上位が具体的な娘でも店舗の娘で登録する', () => {
    const result = run(first, { character: choice('funato', { funato: 0.25, funabashi: 0.2 }) })
    expect(result).toMatchObject({ status: 'register', reasons: [] })
    expect(registeredCharacters(result)).toEqual(['funabashi'])
  })
  test('確率が下限に届かない最上位が店舗の娘・other・secret でも、店舗の娘で登録する', () => {
    for (const top of ['funabashi', 'other', 'secret']) {
      const result = run(first, { character: choice(top, { [top]: 0.25, funato: 0.2 }) })
      expect(registeredCharacters(result), top).toEqual(['funabashi'])
    }
  })
  test('娘の回答が確率の散った（0.3 未満の）具体的な娘でも、店舗が採用されていれば店舗の娘になる', () => {
    const result = run(first, { character: choice('akiba', { akiba: 0.1, funato: 0.09, abeno: 0.08 }) })
    expect(registeredCharacters(result)).toEqual(['funabashi'])
  })
  test('店舗と別の娘の確認が下限未満なら、確認が通らないので店舗の娘で登録し、character_confirm_low は付けない', () => {
    const result = run(both, { character: choice('funato', { funato: 0.99 }) }, yes(0.99, 0.69))
    expect(result).toMatchObject({ status: 'register', reasons: [] })
    expect(registeredCharacters(result)).toEqual(['funabashi'])
  })
  test('店舗と別の娘の確認の回答が欠けていても、店舗の娘で登録する（例外にしない）', () => {
    const result = run(
      both,
      { character: choice('funato', { funato: 0.99 }) },
      { [STORE_CONFIRM_KEY]: yes(1, 1)[STORE_CONFIRM_KEY] }
    )
    expect(result).toMatchObject({ status: 'register', reasons: [] })
    expect(registeredCharacters(result)).toEqual(['funabashi'])
  })
  test('共通値を下げれば娘の下限も下がり、0.25 の娘は明示されたものとして採用する', () => {
    const answers = { character: choice('funato', { funato: 0.25, funabashi: 0.2 }) }
    const loose: DetectionThresholds = { ...DEFAULT_DETECTION_THRESHOLDS, fieldThreshold: 0.2 }
    expect(registeredCharacters(run(first, answers, {}, loose))).toEqual(['funato'])
    expect(registeredCharacters(run(first, answers))).toEqual(['funabashi'])
  })
})

describe('娘が明示されていれば、その娘をそのまま採用する', () => {
  test('店舗と別の娘で、確率が下限以上かつ確認が下限以上なら、その娘で登録する', () => {
    const result = run(both, { character: choice('funato', { funato: 0.99 }) }, yes(0.99, 0.99))
    expect(result).toMatchObject({ status: 'register', reasons: [] })
    expect(registeredCharacters(result)).toEqual(['funato'])
  })
  test('ちょうど確認の下限（0.7）でも、その娘で登録する', () => {
    const result = run(both, { character: choice('funato', { funato: 0.99 }) }, yes(0.7, 0.7))
    expect(registeredCharacters(result)).toEqual(['funato'])
  })
  test('確認の質問が無い request（v15 以前の保存データ）は関門なしで、店舗と別の娘をそのまま採用する', () => {
    const result = run(first, { character: choice('funato', { funato: 0.6, funabashi: 0.3 }) })
    expect(registeredCharacters(result)).toEqual(['funato'])
  })
  test('下限ちょうど（0.3）の娘は明示されたものとして採用する', () => {
    const result = run(first, { character: choice('funato', { funato: 0.3, funabashi: 0.2 }) })
    expect(registeredCharacters(result)).toEqual(['funato'])
  })
  test.each(['other', 'secret'])('娘が %s なら（確認は聞かない）、その値をそのまま採用する', (special) => {
    const request = withConfirm({ store: 'funabashi' })
    const result = run(request, associationAnswers('funabashi', special), {
      [STORE_CONFIRM_KEY]: { type: 'noul', noul: 0.99 }
    })
    expect(registeredCharacters(result)).toEqual([special])
  })
  test('娘が店舗の娘（同じ ID）なら、店舗の娘で登録する', () => {
    const request = withConfirm({ store: 'funabashi' })
    const result = run(request, associationAnswers('funabashi', 'funabashi'), {
      [STORE_CONFIRM_KEY]: { type: 'noul', noul: 0.99 }
    })
    expect(registeredCharacters(result)).toEqual(['funabashi'])
  })
  test('店舗の娘の確認が request に残っている保存データは、残った質問どおり関門を掛け、低ければ店舗の娘のまま登録する', () => {
    const asked = withConfirm({ store: 'funabashi', character: 'funabashi' })
    const result = run(asked, associationAnswers('funabashi', 'funabashi'), yes(0.99, 0.01))
    expect(registeredCharacters(result)).toEqual(['funabashi'])
  })
})

describe('娘が指定されていない扱いにしないもの（従来どおり保留）', () => {
  test('娘が multiple（確率が下限以上の共同デザイン）なら、店舗の娘にせず character_unconfirmed で保留する', () => {
    const result = run(first, associationAnswers('funabashi', 'multiple'))
    expect(result).toMatchObject({ status: 'held', reasons: ['character_unconfirmed'] })
    expect(result).not.toHaveProperty('candidate')
  })
  test('店舗が具体的で娘だけ none なら、店舗の娘にせず character_unconfirmed で保留する', () => {
    expect(run(first, associationAnswers('funabashi', 'none'))).toMatchObject({
      status: 'held',
      reasons: ['character_unconfirmed']
    })
  })
  test('店舗も娘も none（しきい値以上）なら対象外のまま', () => {
    expect(run(first, associationAnswers('none', 'none'))).toMatchObject({
      status: 'ignored',
      reasons: ['not_distribution_event']
    })
  })
  test.each(['multiple', 'none'])('娘の最上位が %s で確率が下限に届かないときも、店舗の娘にせず保留する', (top) => {
    const result = run(first, { character: choice(top, { [top]: 0.25, funato: 0.2 }) })
    expect(result).toMatchObject({ status: 'held', reasons: ['character_unconfirmed'] })
  })
  test('店舗が none・multiple なら、店舗が採用されないので娘の既定は効かず、両方の理由で保留する', () => {
    for (const store of ['none', 'multiple']) {
      const result = run(first, {
        store: choice(store, { [store]: 0.99 }),
        character: choice('funato', { funato: 0.25, funabashi: 0.2 })
      })
      expect(result, store).toMatchObject({ status: 'held', reasons: ['store_unconfirmed', 'character_unconfirmed'] })
    }
  })
  test('店舗の確率が下限に届かないときも、娘の既定は効かず保留する', () => {
    const result = run(first, {
      store: choice('funabashi', { funabashi: 0.25, none: 0.2 }),
      character: choice('funato', { funato: 0.25, funabashi: 0.2 })
    })
    expect(result).toMatchObject({ status: 'held', reasons: ['store_unconfirmed', 'character_unconfirmed'] })
  })
  test('店舗の確認が下限未満で店舗が採用されないときは、娘が確率不足でも店舗の娘にならず保留する', () => {
    const request = withConfirm({ store: 'funabashi' })
    const result = run(
      request,
      { character: choice('funato', { funato: 0.25, funabashi: 0.2 }) },
      { [STORE_CONFIRM_KEY]: { type: 'noul', noul: 0.4 } }
    )
    expect(result).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed', 'store_confirm_low', 'character_unconfirmed']
    })
    expect(result).not.toHaveProperty('candidate')
  })
  test('店舗が採用されず娘の確認も低いときだけ、character_unconfirmed に character_confirm_low を併記する', () => {
    const result = run(both, { character: choice('funato', { funato: 0.99 }) }, yes(0.1, 0.1))
    expect(result).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed', 'store_confirm_low', 'character_unconfirmed', 'character_confirm_low']
    })
  })
  test('娘の回答がある店舗なし（none）の保留では、娘が確認を通っていれば娘は採用される', () => {
    const request = withConfirm({ character: 'funato' })
    const result = run(
      request,
      { store: choice('none', { none: 0.99 }), character: choice('funato', { funato: 0.99 }) },
      { [CHARACTER_CONFIRM_KEY]: { type: 'noul', noul: 0.99 } }
    )
    expect(result).toMatchObject({ status: 'held', reasons: ['store_unconfirmed'] })
  })
})

describe('resolveCharacterIds（娘の決め方の単体）', () => {
  const input = { stores: ['funabashi'], choice: undefined, top: undefined, confirmLow: false }
  test('明示されている（確率が下限以上）なら、確認が通る限りその値。確認が低ければ店舗の娘', () => {
    expect(resolveCharacterIds({ ...input, choice: 'funato', top: 'funato' })).toEqual(['funato'])
    expect(resolveCharacterIds({ ...input, choice: 'funato', top: 'funato', confirmLow: true })).toEqual(['funabashi'])
    expect(resolveCharacterIds({ ...input, choice: 'other', top: 'other' })).toEqual(['other'])
  })
  test('確率不足は、最上位が none・multiple でも回答なしでもなければ店舗の娘', () => {
    expect(resolveCharacterIds({ ...input, top: 'funato' })).toEqual(['funabashi'])
    expect(resolveCharacterIds({ ...input, top: 'multiple' })).toEqual([])
    expect(resolveCharacterIds({ ...input, top: 'none' })).toEqual([])
    expect(resolveCharacterIds({ ...input, top: undefined })).toEqual([])
  })
  test('確率が下限以上の multiple・none は、店舗の娘にせず空（保留）', () => {
    expect(resolveCharacterIds({ ...input, choice: 'multiple', top: 'multiple' })).toEqual([])
    expect(resolveCharacterIds({ ...input, choice: 'none', top: 'none' })).toEqual([])
  })
  test('店舗が採用されない、または店舗の ID が EventCharacter として無効なら、店舗の娘にできず空', () => {
    expect(resolveCharacterIds({ ...input, stores: [], top: 'funato' })).toEqual([])
    expect(resolveCharacterIds({ ...input, stores: [], choice: 'funato', top: 'funato', confirmLow: true })).toEqual([])
    expect(resolveCharacterIds({ ...input, stores: ['invented'], top: 'funato' })).toEqual([])
    expect(
      resolveCharacterIds({ ...input, stores: ['invented'], choice: 'funato', top: 'funato', confirmLow: true })
    ).toEqual([])
  })
})
