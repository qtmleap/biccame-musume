import { describe, expect, test } from 'bun:test'
import { confirmTargetOf, createConfirmRequest } from './association-confirm'
import { CHARACTER_CONFIRM_KEY, CHARACTER_STORE, STORE_CONFIRM_KEY } from './associations'
import type { ClefAnswer, ClefRequest } from './clef'
import {
  CHARACTER_CONFIRM_THRESHOLD,
  type DetectionThresholds,
  evaluateDetection,
  STORE_CONFIRM_THRESHOLD
} from './detection'
import {
  associationAnswers,
  choice,
  choiceThresholds,
  evaluateWithStore,
  post,
  requestWithAssociations,
  response,
  uncertainAnswers
} from './detection-test-fixtures'

// 1段目の最上位が 70% 未満の店舗・娘は、2段目の確認（はい/いいえ）の「はい」が 70% 以上のときだけ確定する。
// 70% 以上は確認なしで確定する（detection-association.test.ts）。ここでは確認が決める側（70% 未満）の関門を調べる。
const value = post('ふなとーたん擬人化記念アクキーを2026年11月3日から全員に配布します', {
  screenName: 'bic_funabashi',
  url: 'https://x.com/bic_funabashi/status/2109221721773576390'
})
const first = requestWithAssociations(value)
// 1段目の request に、2段目の確認の質問をまとめた request（runWebhookDetection がまとめるのと同じ形）。
const merged = (target: { store?: string; character?: string }): ClefRequest => {
  const confirm = createConfirmRequest(first, target)
  return { ...first, questions: { ...first.questions, ...confirm.questions } }
}
const both = merged({ store: 'funabashi', character: 'funato' })
// 配布物・日付・条件は確定させ、店舗と娘の回答だけを変える。
const base: Record<string, ClefAnswer> = {
  category: choice('ackey', { ackey: 0.99 }),
  condition: choice('everyone', { everyone: 0.99 }),
  quantity: choice('none', { none: 0.99 })
}
const yes = (store: number, character: number): Record<string, ClefAnswer> => ({
  [STORE_CONFIRM_KEY]: { type: 'noul', noul: store },
  [CHARACTER_CONFIRM_KEY]: { type: 'noul', noul: character }
})
// 既定の 1 段目は、店舗も娘も最上位が 60%（70% 未満）。確認の「はい」が採用を決める。
const run = (
  request: ClefRequest,
  overrides: Record<string, ClefAnswer>,
  confirm: Record<string, ClefAnswer> = yes(0.99, 0.99),
  thresholds?: DetectionThresholds
) => {
  const answers = {
    ...response(request, { ...base, ...uncertainAnswers('funabashi', 'funato'), ...overrides }).answers
  }
  const { [STORE_CONFIRM_KEY]: _store, [CHARACTER_CONFIRM_KEY]: _character, ...rest } = answers
  return evaluateWithStore(value, request, { answers: { ...rest, ...confirm } }, thresholds)
}

describe('既定の下限は店舗・娘の確認とも 0.7', () => {
  test('定数で持ち、どちらも 0.7', () => {
    expect(STORE_CONFIRM_THRESHOLD).toBe(0.7)
    expect(CHARACTER_CONFIRM_THRESHOLD).toBe(0.7)
  })
})

describe('2段目の確認の関門（1段目の最上位が 70% 未満のとき）', () => {
  test('確認の「はい」が下限以上なら、登録に進む', () => {
    const result = run(both, {})
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected registration')
    expect(result.candidate.stores).toEqual(['funabashi'])
    expect(result.candidate.characterIds).toEqual(['funato'])
  })
  test('ちょうど下限（0.7）でも通る', () => {
    expect(run(both, {}, yes(0.7, 0.7)).status).toBe('register')
  })
  test('店舗の確認が下限未満なら、店舗を確定せず保留する（娘は確定する）', () => {
    const result = run(both, {}, yes(0.69, 0.99))
    expect(result).toMatchObject({ status: 'held', reasons: ['store_unconfirmed', 'store_confirm_low'] })
    expect(result).not.toHaveProperty('candidate')
  })
  test('娘の確認が下限未満なら、娘は明示されていないので保留せず、採用した店舗の娘で登録する（character_confirm_low は付けない）', () => {
    const result = run(both, {}, yes(0.99, 0.69))
    expect(result).toMatchObject({ status: 'register', reasons: [] })
    if (result.status !== 'register') throw new Error('Expected registration')
    expect(result.candidate.stores).toEqual(['funabashi'])
    expect(result.candidate.characterIds).toEqual(['funabashi'])
  })
  test('両方が下限未満なら、両方の理由を併記する', () => {
    expect(run(both, {}, yes(0.1, 0.1))).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed', 'store_confirm_low', 'character_unconfirmed', 'character_confirm_low']
    })
  })
  test('確認の回答が欠けているなら、通さない（例外にしない）。店舗は保留、娘は店舗の娘になる', () => {
    expect(run(both, {}, { [CHARACTER_CONFIRM_KEY]: { type: 'noul', noul: 0.99 } })).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed', 'store_confirm_low']
    })
    const characterMissing = run(both, {}, { [STORE_CONFIRM_KEY]: { type: 'noul', noul: 0.99 } })
    expect(characterMissing).toMatchObject({ status: 'register', reasons: [] })
    if (characterMissing.status !== 'register') throw new Error('Expected registration')
    expect(characterMissing.candidate.characterIds).toEqual(['funabashi'])
    expect(run(both, {}, {})).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed', 'store_confirm_low', 'character_unconfirmed', 'character_confirm_low']
    })
  })
  test('確認の回答が noul でない形なら、他の質問と同じく不正な応答として例外にする', () => {
    const wrong: Record<string, ClefAnswer> = { ...yes(0.99, 0.99), [STORE_CONFIRM_KEY]: choice('a', { a: 1 }) }
    expect(() => run(both, {}, wrong)).toThrow('Incomplete detection response')
  })
  test('店舗だけを確認する request では、娘の確認の質問が無いので、70% 未満の娘は確認では確定できず店舗の娘になる', () => {
    const storeOnly = merged({ store: 'funabashi' })
    const result = run(storeOnly, {}, yes(0.99, 0.01))
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected registration')
    expect(result.candidate.characterIds).toEqual(['funabashi'])
    // 店舗が確認で採用されない保留では、娘も店舗の娘にできない（70% 未満で確認の質問も無い娘は明示されない）ので、character_unconfirmed も併記する。
    expect(run(storeOnly, {}, { [STORE_CONFIRM_KEY]: { type: 'noul', noul: 0.2 } })).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed', 'store_confirm_low', 'character_unconfirmed']
    })
  })
  test('娘が other・secret で 70% 以上なら確認の対象にならず、その値で登録する', () => {
    for (const special of ['other', 'secret']) {
      const request = merged({ store: 'funabashi' })
      const result = run(
        request,
        { character: choice(special, { [special]: 0.9 }) },
        {
          [STORE_CONFIRM_KEY]: { type: 'noul', noul: 0.99 }
        }
      )
      expect(result.status).toBe('register')
    }
  })
  test('確認の下限は共通値に左右されない。1 段目の下限は保存した店舗のしきい値に従う', () => {
    const lowStore: DetectionThresholds = {
      eventThreshold: 0.9,
      fieldThreshold: 0.5,
      ignoreThreshold: 0.1,
      fieldThresholds: { store: 0.3 }
    }
    // 保存した店舗の 1 段目のしきい値 0.3 では 60% は確認なしで確定するので、確認の回答は見ない。
    expect(run(both, {}, yes(0.6, 0.99), lowStore).status).toBe('register')
    // 既定の 1 段目（0.7）では 60% は確認が決める。共通値を変えても確認の下限は 0.7 のまま。
    const common: DetectionThresholds = { eventThreshold: 0.9, fieldThreshold: 0.5, ignoreThreshold: 0.1 }
    expect(run(both, {}, yes(0.6, 0.99), common)).toMatchObject({ status: 'held' })
    expect(run(both, {}, yes(0.7, 0.99), { ...common, fieldThreshold: 0.99 }).status).toBe('register')
  })
})

describe('確認の質問が無い request（v15 以前の保存データ）は、70% 未満を確定しない', () => {
  // 以前は「質問が無ければ関門を掛けず通す（下限 30%）」だった。新しい規則では、70% 未満を確定できるのは確認の「はい」だけなので、
  // 確認を聞いていない保存データの 70% 未満は採用しない。旧データの再評価は厳しくなる（意図した変更）。
  test('70% 未満の店舗は、確認の回答が応答にあっても、request に質問が無ければ採用しない', () => {
    const result = run(first, {}, yes(0.99, 0.99))
    expect(result).toMatchObject({ status: 'held' })
    expect(result.reasons).toContain('store_unconfirmed')
    // 確認を聞いていないので、確認が低かったという理由は付けない。
    expect(result.reasons).not.toContain('store_confirm_low')
  })
  test('70% 以上なら、request に質問が無くても採用する（確認の回答の有無に依らず同じ）', () => {
    const answers = response(first, { ...base, ...associationAnswers('funabashi', 'funato') })
    const without = evaluateDetection(value, first, answers, undefined, 'funabashi')
    const withExtra = evaluateDetection(
      value,
      first,
      { answers: { ...answers.answers, ...yes(0.01, 0.01) } },
      undefined,
      'funabashi'
    )
    expect(without.status).toBe('register')
    expect(withExtra).toEqual(without)
  })
  test('店舗・娘が none のときの保留と対象外も変わらない', () => {
    expect(run(both, associationAnswers('none', 'none'), yes(0.01, 0.01))).toMatchObject({
      status: 'ignored',
      reasons: ['not_distribution_event']
    })
    // 最上位が none の項目は確認の対象にならず、1段目の理由だけで保留する。
    const noneStore = merged({ character: 'funato' })
    expect(
      run(
        noneStore,
        { ...associationAnswers('none', 'funato'), character: choice('funato', { funato: 0.6 }) },
        { [CHARACTER_CONFIRM_KEY]: { type: 'noul', noul: 0.99 } }
      )
    ).toMatchObject({ status: 'held', reasons: ['store_unconfirmed'] })
  })
})

describe('店舗の娘にも娘の確認を聞く（二回チェック）。確認が低くても保留せず、店舗の娘で登録する', () => {
  // 本番（runWebhookDetection）と同じく、1段目の最上位から確認の対象を決めて、確認の質問をまとめた request を作る。
  const productionRequest = (answers: Record<string, ClefAnswer>): ClefRequest => {
    const confirm = createConfirmRequest(first, confirmTargetOf(answers, choiceThresholds()))
    return { ...first, questions: { ...first.questions, ...confirm.questions } }
  }
  const sameId = uncertainAnswers('funabashi', 'funabashi')
  const registeredCharacters = (result: ReturnType<typeof run>) => {
    if (result.status !== 'register') throw new Error(`Expected registration: ${result.reasons.join(',')}`)
    return result.candidate.characterIds
  }

  test('最上位の娘が店舗と同じ ID でも、70% 未満なら request に店舗と娘の両方の確認の質問が入り、両方が通れば店舗の娘で登録に進む', () => {
    const request = productionRequest(sameId)
    expect(Object.keys(request.questions)).toEqual(expect.arrayContaining([STORE_CONFIRM_KEY, CHARACTER_CONFIRM_KEY]))
    const result = run(request, sameId, yes(0.99, 0.99))
    expect(result).toMatchObject({ status: 'register', reasons: [] })
    if (result.status !== 'register') throw new Error('Expected registration')
    expect(result.candidate.stores).toEqual(['funabashi'])
    expect(result.candidate.characterIds).toEqual(['funabashi'])
  })
  test('店舗の娘で娘の確認が下限（0.7）未満でも、保留にせず、採用した店舗の娘で登録する（character_confirm_low は付けない）', () => {
    const request = productionRequest(sameId)
    for (const character of [0.01, 0.39, 0.69]) {
      const result = run(request, sameId, yes(0.99, character))
      expect(result, String(character)).toMatchObject({ status: 'register', reasons: [] })
      expect(registeredCharacters(result), String(character)).toEqual(['funabashi'])
      expect(result.reasons).not.toContain('character_confirm_low')
      expect(result.reasons).not.toContain('character_unconfirmed')
    }
  })
  test('店舗の娘の判定結果（状態・候補・理由）は、娘の確認が高くても低くても同じ（確認は店舗の娘のとき登録を止めない）', () => {
    const request = productionRequest(sameId)
    const results = [0.01, 0.69, 0.7, 0.99].map((character) => run(request, sameId, yes(0.99, character)))
    for (const result of results) expect(result).toEqual(results[0])
  })
  test('店舗の確認が下限未満なら、店舗の娘でも従来どおり店舗を保留する（store_confirm_low）', () => {
    const result = run(productionRequest(sameId), sameId, yes(0.69, 0.99))
    expect(result).toMatchObject({ status: 'held', reasons: ['store_unconfirmed', 'store_confirm_low'] })
    expect(result).not.toHaveProperty('candidate')
  })
  test('店舗の確認も娘の確認も低いときは、店舗を保留する。娘は店舗が採用されないので店舗の娘にできず、理由に併記される', () => {
    const result = run(productionRequest(sameId), sameId, yes(0.69, 0.69))
    expect(result.status).toBe('held')
    expect(result).not.toHaveProperty('candidate')
    expect(result.reasons).toEqual(
      expect.arrayContaining(['store_unconfirmed', 'store_confirm_low', 'character_confirm_low'])
    )
  })
  test('娘の確認の回答が欠けていても、店舗の娘で登録する（例外にしない）', () => {
    const result = run(productionRequest(sameId), sameId, { [STORE_CONFIRM_KEY]: yes(1, 1)[STORE_CONFIRM_KEY] })
    expect(result).toMatchObject({ status: 'register', reasons: [] })
    expect(registeredCharacters(result)).toEqual(['funabashi'])
  })
  test('娘の確認の質問が無い request でも、店舗の娘は店舗の娘のまま登録する（明示でなければ店舗の娘）', () => {
    const request = merged({ store: 'funabashi' })
    expect(Object.keys(request.questions)).not.toContain(CHARACTER_CONFIRM_KEY)
    expect(registeredCharacters(run(request, sameId, yes(0.99, 0.01)))).toEqual(['funabashi'])
  })
  test('store_character が最上位のときは、娘は確認の対象にならず（質問が無い）、店舗の娘で登録する', () => {
    const answers = {
      ...uncertainAnswers('funabashi', CHARACTER_STORE),
      character: choice(CHARACTER_STORE, { [CHARACTER_STORE]: 0.6 })
    }
    const request = productionRequest(answers)
    expect(Object.keys(request.questions)).toContain(STORE_CONFIRM_KEY)
    expect(Object.keys(request.questions)).not.toContain(CHARACTER_CONFIRM_KEY)
    const result = run(request, answers, { [STORE_CONFIRM_KEY]: yes(0.99, 0.99)[STORE_CONFIRM_KEY] })
    expect(registeredCharacters(result)).toEqual(['funabashi'])
  })
  test('店舗と別の娘は、従来どおり娘の確認を聞き、下限未満なら娘は明示されていないとして店舗の娘で登録する', () => {
    const different = uncertainAnswers('funabashi', 'funato')
    const request = productionRequest(different)
    expect(Object.keys(request.questions)).toEqual(expect.arrayContaining([STORE_CONFIRM_KEY, CHARACTER_CONFIRM_KEY]))
    expect(registeredCharacters(run(request, different, yes(0.99, 0.99)))).toEqual(['funato'])
    const low = run(request, different, yes(0.99, 0.69))
    expect(low).toMatchObject({ status: 'register', reasons: [] })
    expect(registeredCharacters(low)).toEqual(['funabashi'])
  })
  test.each(['none', 'multiple'])(
    '店舗が %s で娘が具体的（60%）なら店舗の娘とは言えないので、娘の確認だけを聞いて関門を掛ける',
    (special) => {
      const answers = {
        ...associationAnswers(special, 'funabashi'),
        character: choice('funabashi', { funabashi: 0.6 })
      }
      const request = productionRequest(answers)
      expect(Object.keys(request.questions)).toContain(CHARACTER_CONFIRM_KEY)
      expect(Object.keys(request.questions)).not.toContain(STORE_CONFIRM_KEY)
      const low = run(request, answers, { [CHARACTER_CONFIRM_KEY]: { type: 'noul', noul: 0.3 } })
      expect(low.reasons).toContain('character_confirm_low')
      const high = run(request, answers, { [CHARACTER_CONFIRM_KEY]: { type: 'noul', noul: 0.99 } })
      expect(high.reasons).not.toContain('character_confirm_low')
    }
  )
})
