import { describe, expect, test } from 'bun:test'
import { describeAnswers } from './answer-view'
import { choice, thresholds } from './answer-view-test-fixtures'
import { createConfirmRequest } from './association-confirm'
import { CHARACTER_CONFIRM_KEY, STORE_CONFIRM_KEY } from './associations'
import type { ClefAnswer } from './clef'
import {
  CHARACTER_CONFIRM_THRESHOLD,
  type DetectionThresholds,
  evaluateDetection,
  STORE_CONFIRM_THRESHOLD,
  thresholdOf
} from './detection'
import { evaluateWithStore, post, requestWithAssociations, response, uncertainAnswers } from './detection-test-fixtures'

const value = post('ふなとーたん擬人化記念アクキーを2026年11月3日から全員に配布します', {
  screenName: 'bic_funabashi',
  url: 'https://x.com/bic_funabashi/status/2109221721773576390'
})
const first = requestWithAssociations(value)
const confirm = createConfirmRequest(first, { store: 'funabashi', character: 'funato' })
const merged = { ...first, questions: { ...first.questions, ...confirm.questions } }
const yes = (store: number, character: number): Record<string, ClefAnswer> => ({
  [STORE_CONFIRM_KEY]: { type: 'noul', noul: store },
  [CHARACTER_CONFIRM_KEY]: { type: 'noul', noul: character }
})
const answersOf = (confirmAnswers: Record<string, ClefAnswer>): Record<string, ClefAnswer> => ({
  ...response(merged, {
    category: choice('ackey', { ackey: 0.99 }),
    condition: choice('everyone', { everyone: 0.99 }),
    quantity: choice('none', { none: 0.99 }),
    // 1段目の最上位は 60%（70% 未満）。確認の「はい」が採用を決める。
    ...uncertainAnswers('funabashi', 'funato')
  }).answers,
  ...confirmAnswers
})

describe('thresholdOf は確認の質問に定数のしきい値を返す', () => {
  test('店舗・娘の確認は、共通値や他の項目に依らず既定 0.7', () => {
    for (const setting of [
      thresholds,
      { ...thresholds, fieldThreshold: 0.2 },
      { ...thresholds, fieldThreshold: 1 },
      { ...thresholds, fieldThreshold: 0.5, fieldThresholds: { store: 0.3, status: 0.1 } }
    ] satisfies DetectionThresholds[]) {
      expect(thresholdOf(setting, STORE_CONFIRM_KEY)).toBe(STORE_CONFIRM_THRESHOLD)
      expect(thresholdOf(setting, CHARACTER_CONFIRM_KEY)).toBe(CHARACTER_CONFIRM_THRESHOLD)
    }
    expect(STORE_CONFIRM_THRESHOLD).toBe(0.7)
    expect(CHARACTER_CONFIRM_THRESHOLD).toBe(0.7)
  })
  test('保存した確認のしきい値があれば、それが優先する', () => {
    const saved: DetectionThresholds = {
      ...thresholds,
      fieldThresholds: { store_confirm: 0.5, character_confirm: 0.6 }
    }
    expect(thresholdOf(saved, STORE_CONFIRM_KEY)).toBe(0.5)
    expect(thresholdOf(saved, CHARACTER_CONFIRM_KEY)).toBe(0.6)
  })
  test('他のキーのしきい値は変わらない', () => {
    // 1段目の店舗・娘の下限は既定 0.7（共通値 0.9 には依らない。管理画面で保存した値が優先する）。
    expect(thresholdOf(thresholds, 'store')).toBe(0.7)
    expect(thresholdOf(thresholds, 'character')).toBe(0.7)
    expect(thresholdOf(thresholds, 'condition')).toBe(0.9)
    expect(thresholdOf(thresholds, 'is_event')).toBe(0.9)
    // 似た名前の未知のキーは共通値のまま（確認のキーだけを個別に扱う）。
    expect(thresholdOf(thresholds, 'store_confirm_a')).toBe(0.9)
  })
})

describe('回答表の確認の行', () => {
  const rows = describeAnswers(answersOf(yes(0.8, 0.5)), thresholds)
  const rowOf = (key: string) => {
    const row = rows.find((entry) => entry.key === key)
    if (row === undefined) throw new Error(`Missing row ${key}`)
    return row
  }

  test('確認の行は、1段目の店舗・娘の行の直後に並ぶ', () => {
    const keys = rows.map((row) => row.key)
    expect(keys.indexOf(STORE_CONFIRM_KEY)).toBe(keys.indexOf('store') + 1)
    expect(keys.indexOf(CHARACTER_CONFIRM_KEY)).toBe(keys.indexOf('character') + 1)
  })
  test('質問名は、確認した最上位の名前を添えない素のラベルで出す', () => {
    expect(rowOf(STORE_CONFIRM_KEY).label).toBe('開催・配布店舗の確認')
    expect(rowOf(CHARACTER_CONFIRM_KEY).label).toBe('対象ビッカメ娘の確認')
  })
  test('「はい」の確率としきい値（0.7）を出し、未満なら未確定にする', () => {
    expect(rowOf(STORE_CONFIRM_KEY)).toMatchObject({
      answer: 'はい',
      probability: 0.8,
      threshold: 0.7,
      confirmed: true
    })
    // 0.5 は「はい」の確率としては 0.7 未満なので、回答は「はい」でも未確定。
    expect(rowOf(CHARACTER_CONFIRM_KEY)).toMatchObject({
      answer: 'はい',
      probability: 0.5,
      threshold: 0.7,
      confirmed: false
    })
    expect(rowOf(CHARACTER_CONFIRM_KEY).alternatives).toEqual([{ answer: 'いいえ', probability: 0.5 }])
  })
  test('「いいえ」寄りの回答は、いいえの確率を出して未確定にする', () => {
    const no = describeAnswers(answersOf(yes(0.2, 0.2)), thresholds).find((row) => row.key === STORE_CONFIRM_KEY)
    expect(no).toMatchObject({ answer: 'いいえ', probability: 0.8, threshold: 0.7, confirmed: false })
  })
  test('1段目の最上位が無い（store の回答が無い）保存データでも、質問名は素のラベルのまま、例外にせず出す', () => {
    const { store: _store, ...withoutStore } = answersOf(yes(0.9, 0.9))
    const row = describeAnswers(withoutStore, thresholds).find((entry) => entry.key === STORE_CONFIRM_KEY)
    expect(row?.label).toBe('開催・配布店舗の確認')
  })
  test('確認の行が無い保存データ（v15 以前）の行は変わらない', () => {
    const { [STORE_CONFIRM_KEY]: _s, [CHARACTER_CONFIRM_KEY]: _c, ...v15 } = answersOf(yes(0.9, 0.9))
    const keys = describeAnswers(v15, thresholds).map((row) => row.key)
    expect(keys).not.toContain(STORE_CONFIRM_KEY)
    expect(keys).not.toContain(CHARACTER_CONFIRM_KEY)
  })
})

describe('店舗の娘にも娘の確認を聞くので、回答表に店舗の確認と娘の確認の両方の行が出る', () => {
  // 店舗の娘（store と character が同じ ID）。本番と同じく、店舗と娘の両方の確認の質問をまとめた request で判定する。
  const sameConfirm = createConfirmRequest(first, { store: 'funabashi', character: 'funabashi' })
  const sameRequest = { ...first, questions: { ...first.questions, ...sameConfirm.questions } }
  const storeCharacterAnswers = (store: number, character: number): Record<string, ClefAnswer> => ({
    ...response(sameRequest, {
      category: choice('ackey', { ackey: 0.99 }),
      condition: choice('everyone', { everyone: 0.99 }),
      quantity: choice('none', { none: 0.99 }),
      ...uncertainAnswers('funabashi', 'funabashi')
    }).answers,
    ...yes(store, character)
  })

  test('開催・配布店舗の確認と対象ビッカメ娘の確認の両方の行が出て、それぞれ店舗・娘の行の直後に並ぶ', () => {
    const rows = describeAnswers(storeCharacterAnswers(0.8, 0.9), thresholds)
    const keys = rows.map((row) => row.key)
    expect(keys).toContain(STORE_CONFIRM_KEY)
    expect(keys).toContain(CHARACTER_CONFIRM_KEY)
    expect(keys.indexOf(STORE_CONFIRM_KEY)).toBe(keys.indexOf('store') + 1)
    // 行の並びは「対象ビッカメ娘」の次。
    expect(keys.indexOf(CHARACTER_CONFIRM_KEY)).toBe(keys.indexOf('character') + 1)
    expect(rows.find((row) => row.key === STORE_CONFIRM_KEY)?.label).toBe('開催・配布店舗の確認')
    // 添え字は付けない。
    expect(rows.find((row) => row.key === CHARACTER_CONFIRM_KEY)?.label).toBe('対象ビッカメ娘の確認')
    expect(rows.find((row) => row.key === 'character')?.answer).toBe('ふなたん')
  })
  test('店舗の確認が低いと、判定の理由と表の確定表示が一致して保留になる。娘の確認は低くても保留にしない', () => {
    for (const store of [0.3, 0.69, 0.7, 0.99]) {
      for (const character of [0.01, 0.69, 0.7, 0.99]) {
        const answers = storeCharacterAnswers(store, character)
        const rows = describeAnswers(answers, thresholds)
        const confirmed = (key: string) => rows.find((row) => row.key === key)?.confirmed
        const result = evaluateWithStore(value, sameRequest, { answers })
        expect(confirmed(STORE_CONFIRM_KEY), `store ${store}`).toBe(!result.reasons.includes('store_confirm_low'))
        // 表の娘の確認の行は確率だけで確定・未確定が決まる（表示は変えない）。
        expect(confirmed(CHARACTER_CONFIRM_KEY), `character ${character}`).toBe(character >= 0.7)
        // 登録できるかは店舗の確認だけで決まる。店舗の娘は、娘の確認が低くても店舗の娘で登録する。
        expect(result.status === 'register', `store ${store} character ${character}`).toBe(store >= 0.7)
        if (result.status === 'register') expect(result.candidate.characterIds).toEqual(['funabashi'])
      }
    }
  })
  test('娘の確認の質問が無い保存データ（旧版の店舗の娘）は、店舗の確認の行だけを出し、表は壊れない', () => {
    const storeOnly = createConfirmRequest(first, { store: 'funabashi' })
    const request = { ...first, questions: { ...first.questions, ...storeOnly.questions } }
    const { [CHARACTER_CONFIRM_KEY]: _character, ...asked } = storeCharacterAnswers(0.8, 0.9)
    const rows = describeAnswers(asked, thresholds)
    const keys = rows.map((row) => row.key)
    expect(keys).toContain(STORE_CONFIRM_KEY)
    expect(keys).not.toContain(CHARACTER_CONFIRM_KEY)
    expect(keys).toContain('character')
    expect(evaluateWithStore(value, request, { answers: asked }).status).toBe('register')
  })
})

describe('回答表の確定表示は、判定（evaluateDetection）の関門と一致する', () => {
  const probabilities = [0, 0.3, 0.5, 0.69, 0.7, 0.71, 0.99, 1]
  test('確認の確率の全ての組み合わせで、「確定」と判定の通過が一致する', () => {
    for (const store of probabilities) {
      for (const character of probabilities) {
        const answers = answersOf(yes(store, character))
        const rows = describeAnswers(answers, thresholds)
        const confirmed = (key: string) => rows.find((row) => row.key === key)?.confirmed
        const result = evaluateWithStore(value, merged, { answers })
        const reasons = result.reasons
        // 店舗は、表で「未確定」なら判定で store_confirm_low を出し、「確定」なら出さない。店舗が確認を通らなければ保留。
        expect(confirmed(STORE_CONFIRM_KEY), `store ${store}`).toBe(!reasons.includes('store_confirm_low'))
        expect(result.status === 'register').toBe(store >= 0.7)
        // 娘の確認が低いのは「娘が明示されていない」ということで、店舗が採用されているなら店舗の娘で登録に進み、保留にしない。
        // character_confirm_low は、店舗が採用されず保留になるときだけ併記される。表の娘の確認の行は確率だけで「未確定」と出る（表示は変えない）。
        expect(reasons.includes('character_confirm_low'), `store ${store} character ${character}`).toBe(
          character < 0.7 && store < 0.7
        )
      }
    }
  })
  test('判定は設定の共通値にも左右されない（表も判定も定数 0.7）', () => {
    const loose: DetectionThresholds = { ...thresholds, fieldThreshold: 0.2 }
    const answers = answersOf(yes(0.6, 0.6))
    const rows = describeAnswers(answers, loose)
    expect(rows.find((row) => row.key === STORE_CONFIRM_KEY)?.confirmed).toBe(false)
    expect(evaluateDetection(value, merged, { answers }, loose, 'funabashi').reasons).toContain('store_confirm_low')
  })
})
