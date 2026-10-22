import { describe, expect, test } from 'bun:test'
import { createConfirmRequest } from './association-confirm'
import { CHARACTER_CONFIRM_KEY, STORE_CONFIRM_KEY } from './associations'
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
  evaluateWithStore,
  post,
  requestWithAssociations,
  response
} from './detection-test-fixtures'

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
const run = (
  request: ClefRequest,
  overrides: Record<string, ClefAnswer>,
  confirm: Record<string, ClefAnswer> = yes(0.99, 0.99),
  thresholds?: DetectionThresholds
) => {
  const answers = {
    ...response(request, { ...base, ...associationAnswers('funabashi', 'funato'), ...overrides }).answers
  }
  const { [STORE_CONFIRM_KEY]: _store, [CHARACTER_CONFIRM_KEY]: _character, ...rest } = answers
  return evaluateWithStore(value, request, { answers: { ...rest, ...confirm } }, thresholds)
}

describe('既定の下限は店舗・娘とも 0.7', () => {
  test('定数で持ち、どちらも 0.7', () => {
    expect(STORE_CONFIRM_THRESHOLD).toBe(0.7)
    expect(CHARACTER_CONFIRM_THRESHOLD).toBe(0.7)
  })
})

describe('2段目の確認の関門（request に確認の質問があるときだけ）', () => {
  test('確認の「はい」が下限以上なら、これまでどおり登録に進む', () => {
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
  test('娘の確認が下限未満なら、娘を確定せず保留する（店舗は確定する）', () => {
    const result = run(both, {}, yes(0.99, 0.69))
    expect(result).toMatchObject({ status: 'held', reasons: ['character_unconfirmed', 'character_confirm_low'] })
  })
  test('両方が下限未満なら、両方の理由を併記する', () => {
    expect(run(both, {}, yes(0.1, 0.1))).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed', 'store_confirm_low', 'character_unconfirmed', 'character_confirm_low']
    })
  })
  test('確認の回答が欠けているなら、通さずに保留する（例外にしない）', () => {
    expect(run(both, {}, { [CHARACTER_CONFIRM_KEY]: { type: 'noul', noul: 0.99 } })).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed', 'store_confirm_low']
    })
    expect(run(both, {}, { [STORE_CONFIRM_KEY]: { type: 'noul', noul: 0.99 } })).toMatchObject({
      status: 'held',
      reasons: ['character_unconfirmed', 'character_confirm_low']
    })
    expect(run(both, {}, {})).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed', 'store_confirm_low', 'character_unconfirmed', 'character_confirm_low']
    })
  })
  test('確認の回答が noul でない形なら、他の質問と同じく不正な応答として例外にする', () => {
    const wrong: Record<string, ClefAnswer> = { ...yes(0.99, 0.99), [STORE_CONFIRM_KEY]: choice('a', { a: 1 }) }
    expect(() => run(both, {}, wrong)).toThrow('Incomplete detection response')
  })
  test('店舗だけを確認する request では、娘に関門を掛けない（確認の質問が無い項目は通す）', () => {
    const storeOnly = merged({ store: 'funabashi' })
    expect(run(storeOnly, {}, yes(0.99, 0.01)).status).toBe('register')
    expect(run(storeOnly, {}, { [STORE_CONFIRM_KEY]: { type: 'noul', noul: 0.2 } })).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed', 'store_confirm_low']
    })
  })
  test('娘が other・secret の企画は確認が無く、関門を掛けない', () => {
    for (const special of ['other', 'secret']) {
      const request = merged({ store: 'funabashi' })
      const result = run(request, associationAnswers('funabashi', special), {
        [STORE_CONFIRM_KEY]: { type: 'noul', noul: 0.99 }
      })
      expect(result.status).toBe('register')
    }
  })
  test('1段目で採用されない店舗（下限未満）は、確認が高くても採用されない', () => {
    const result = run(both, { store: choice('funabashi', { funabashi: 0.25, none: 0.2 }) }, yes(0.99, 0.99))
    expect(result).toMatchObject({ status: 'held', reasons: ['store_unconfirmed'] })
    expect(result.reasons).not.toContain('store_confirm_low')
  })
  test('店舗の確認の下限は、管理画面の店舗の項目別しきい値や共通値に左右されない', () => {
    const thresholds: DetectionThresholds = {
      eventThreshold: 0.9,
      fieldThreshold: 0.5,
      ignoreThreshold: 0.1,
      fieldThresholds: { store: 0.3 }
    }
    expect(run(both, {}, yes(0.6, 0.99), thresholds)).toMatchObject({ status: 'held' })
    expect(run(both, {}, yes(0.7, 0.99), { ...thresholds, fieldThreshold: 0.99 }).status).toBe('register')
  })
})

describe('確認の質問が無い request は、判定を一切変えない（v15 以前の保存データ）', () => {
  test('確認の回答が低くても、request に質問が無ければ関門を掛けない', () => {
    const result = run(first, {}, yes(0.01, 0.01))
    expect(result.status).toBe('register')
    expect(result.reasons).toEqual([])
  })
  test('確認の質問が無い request の判定は、確認の回答の有無に依らず同じ', () => {
    const answers = response(first, { ...base, ...associationAnswers('funabashi', 'funato') })
    const without = evaluateDetection(value, first, answers, undefined, 'funabashi')
    const withExtra = evaluateDetection(
      value,
      first,
      { answers: { ...answers.answers, ...yes(0.01, 0.01) } },
      undefined,
      'funabashi'
    )
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
      run(noneStore, associationAnswers('none', 'funato'), { [CHARACTER_CONFIRM_KEY]: { type: 'noul', noul: 0.99 } })
    ).toMatchObject({ status: 'held', reasons: ['store_unconfirmed'] })
  })
})
