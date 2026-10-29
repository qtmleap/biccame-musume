import { describe, expect, test } from 'bun:test'
import { describeAnswers } from './answer-view'
import { choice, thresholds } from './answer-view-test-fixtures'
import { CHARACTER_CONFIRM_KEY, CHARACTER_STORE, STORE_CONFIRM_KEY } from './associations'
import type { ClefAnswer } from './clef'
import { type DetectionThresholds, resolveFieldThresholds } from './detection'

// 対象ビッカメ娘の行: 店舗が具体的な S のとき、店舗の娘（store_character）と S の娘自身は同じ人物を指すので、確率を割らずに 1 つにまとめて出す。
// 判定（resolveCharacterIds）は変えない。表示だけを揃える。
const yes = (probability: number): ClefAnswer => ({ type: 'noul', noul: probability })
const characterRow = (answers: Record<string, ClefAnswer>, custom = thresholds) => {
  const row = describeAnswers(answers, custom).find((entry) => entry.key === 'character')
  if (row === undefined) throw new Error('Missing character row')
  return row
}

// 実データ（投稿 2114543815453491225、あべの店のアクリルキーホルダー、v18）。
const abeno: Record<string, ClefAnswer> = {
  store: choice('abeno', { abeno: 0.7881, none: 0.05 }),
  character: choice(CHARACTER_STORE, { [CHARACTER_STORE]: 0.7421, abeno: 0.1244, other: 0.0236, none: 0.0081 })
}

describe('実データの再現（あべの店、store_character 0.7421 / abeno 0.1244）', () => {
  test('回答は「店舗の娘（あべのたん）」、確率は合算値、次点は other と none、しきい値 0.7 で確定', () => {
    const row = characterRow(abeno)
    expect(row.answer).toBe('店舗の娘（あべのたん）')
    expect(row.probability).toBe(0.8665)
    expect(row.alternatives).toEqual([
      { answer: 'その他', probability: 0.0236 },
      { answer: '該当なし', probability: 0.0081 }
    ])
    expect(row.threshold).toBe(0.7)
    expect(row.confirmed).toBe(true)
  })

  test('合算は丸めの前に足してから 4 桁に丸める（0.7421 + 0.1244 = 0.8664999… → 0.8665）。86.6% に合わせる特別扱いはしない', () => {
    // 画面に出る文言（86.7%）は、実際の描画で __tests__/webhook-answer-merged-character.test.ts が確かめる。
    expect(characterRow(abeno).probability).toBe(0.8665)
  })

  test('キーは character のまま。ほかの行（store など）は変わらない', () => {
    const rows = describeAnswers(abeno, thresholds)
    expect(rows.map((row) => row.key)).toEqual(['store', 'character'])
    expect(rows[0]).toMatchObject({ answer: 'あべのキューズモール店', probability: 0.7881, confirmed: true })
  })
})

describe('最上位が S の娘自身のとき', () => {
  test('abeno 0.45 / store_character 0.40 → 回答「あべのたん」、確率 0.85', () => {
    const row = characterRow({
      store: choice('abeno', { abeno: 0.9 }),
      character: choice('abeno', { abeno: 0.45, [CHARACTER_STORE]: 0.4, other: 0.1, none: 0.05 })
    })
    expect(row.answer).toBe('あべのたん')
    expect(row.probability).toBe(0.85)
    expect(row.alternatives).toEqual([
      { answer: 'その他', probability: 0.1 },
      { answer: '該当なし', probability: 0.05 }
    ])
    expect(row.confirmed).toBe(true)
  })

  test('次点は合算した 2 つを除く上位 2 件（確率の降順）。3 件目以降は出さない', () => {
    const row = characterRow({
      store: choice('abeno', { abeno: 0.9 }),
      character: choice(CHARACTER_STORE, {
        [CHARACTER_STORE]: 0.4,
        abeno: 0.2,
        akiba: 0.15,
        other: 0.1,
        secret: 0.08,
        none: 0.07
      })
    })
    expect(row.alternatives).toEqual([
      { answer: 'アキバたん', probability: 0.15 },
      { answer: 'その他', probability: 0.1 }
    ])
  })
})

describe('確定（confirmed）は合算値としきい値の比較', () => {
  test('単独では 0.7 未満の store_character も、合算が 0.7 以上なら確定', () => {
    const row = characterRow({
      store: choice('abeno', { abeno: 0.9 }),
      character: choice(CHARACTER_STORE, { [CHARACTER_STORE]: 0.6, abeno: 0.15, other: 0.25 })
    })
    expect(row.probability).toBe(0.75)
    expect(row.confirmed).toBe(true)
  })

  test('合算してもしきい値に届かなければ未確定。ちょうどしきい値は確定（丸めた値で比べる）', () => {
    const below = characterRow({
      store: choice('abeno', { abeno: 0.9 }),
      character: choice(CHARACTER_STORE, { [CHARACTER_STORE]: 0.4, abeno: 0.29, other: 0.31 })
    })
    expect(below.probability).toBe(0.69)
    expect(below.confirmed).toBe(false)
    // 0.4 + 0.3 は浮動小数点で 0.7 にならない値になりうる。画面に出す丸めた値（0.7）で比べるので確定。
    const exact = characterRow({
      store: choice('abeno', { abeno: 0.9 }),
      character: choice(CHARACTER_STORE, { [CHARACTER_STORE]: 0.4, abeno: 0.3, other: 0.3 })
    })
    expect(exact.probability).toBe(0.7)
    expect(exact.confirmed).toBe(true)
  })

  test('管理画面で保存した娘のしきい値が使われる', () => {
    const saved: DetectionThresholds = {
      ...thresholds,
      fieldThresholds: resolveFieldThresholds(0.9, { character: 0.9 })
    }
    const answers = {
      store: choice('abeno', { abeno: 0.9 }),
      character: choice(CHARACTER_STORE, { [CHARACTER_STORE]: 0.7421, abeno: 0.1244, other: 0.14 })
    }
    // 合算 0.8665 は 0.7 以上で確定、保存した 0.9 には届かず未確定。
    expect(characterRow(answers)).toMatchObject({ threshold: 0.7, confirmed: true })
    expect(characterRow(answers, saved)).toMatchObject({ threshold: 0.9, confirmed: false })
  })
})

describe('character_confirm があるとき（判定は確認の行が担う）', () => {
  test('confirmed は null のまま、しきい値は出し、確率・回答・次点は合算した形', () => {
    const row = characterRow({ ...abeno, [STORE_CONFIRM_KEY]: yes(0.9), [CHARACTER_CONFIRM_KEY]: yes(0.9) })
    expect(row).toMatchObject({
      answer: '店舗の娘（あべのたん）',
      probability: 0.8665,
      threshold: 0.7,
      confirmed: null
    })
    expect(row.alternatives).toEqual([
      { answer: 'その他', probability: 0.0236 },
      { answer: '該当なし', probability: 0.0081 }
    ])
  })

  test('store_confirm だけがあって character_confirm が無いなら、娘の行は合算値で確定を出す', () => {
    const row = characterRow({ ...abeno, [STORE_CONFIRM_KEY]: yes(0.9) })
    expect(row).toMatchObject({ probability: 0.8665, confirmed: true })
  })
})

describe('まとめない場合は従来どおり', () => {
  const unmerged = (answers: Record<string, ClefAnswer>) => characterRow(answers)

  test('store の回答が無い（v13 未満・回答なし）', () => {
    const row = unmerged({
      character: choice(CHARACTER_STORE, { [CHARACTER_STORE]: 0.7421, abeno: 0.1244, other: 0.0236 })
    })
    expect(row).toMatchObject({ answer: '店舗の娘', probability: 0.7421 })
    expect(row.alternatives[0]).toEqual({ answer: 'あべのたん', probability: 0.1244 })
  })

  test('最上位の店舗が none・multiple（具体的な店舗ではない）', () => {
    for (const store of ['none', 'multiple']) {
      const row = unmerged({
        store: choice(store, { [store]: 0.8, abeno: 0.1 }),
        character: choice(CHARACTER_STORE, { [CHARACTER_STORE]: 0.7421, abeno: 0.1244, other: 0.0236 })
      })
      expect(row, store).toMatchObject({ answer: '店舗の娘', probability: 0.7421 })
      expect(row.alternatives[0], store).toEqual({ answer: 'あべのたん', probability: 0.1244 })
    }
  })

  test('store が choice でない・カタログに無い値でも、まとめない', () => {
    for (const store of [yes(0.9), choice('unknown_store', { unknown_store: 0.9 })]) {
      const row = unmerged({
        store,
        character: choice(CHARACTER_STORE, { [CHARACTER_STORE]: 0.7421, abeno: 0.1244 })
      })
      expect(row).toMatchObject({ answer: '店舗の娘', probability: 0.7421 })
    }
  })

  test('store_character が確率に無い', () => {
    const row = unmerged({
      store: choice('abeno', { abeno: 0.9 }),
      character: choice('abeno', { abeno: 0.8, other: 0.1 })
    })
    expect(row).toMatchObject({ answer: 'あべのたん', probability: 0.8 })
    expect(row.alternatives).toEqual([{ answer: 'その他', probability: 0.1 }])
  })

  test('S の娘が確率に無い', () => {
    const row = unmerged({
      store: choice('abeno', { abeno: 0.9 }),
      character: choice(CHARACTER_STORE, { [CHARACTER_STORE]: 0.8, other: 0.1 })
    })
    expect(row).toMatchObject({ answer: '店舗の娘', probability: 0.8 })
  })

  test('最上位が別の店舗の娘（S と違う）なら、その娘の確率をそのまま出す。store_character と S の娘は次点に従来どおり出る', () => {
    const row = unmerged({
      store: choice('abeno', { abeno: 0.9 }),
      character: choice('akiba', { akiba: 0.5, [CHARACTER_STORE]: 0.3, abeno: 0.15, other: 0.05 })
    })
    expect(row).toMatchObject({ answer: 'アキバたん', probability: 0.5 })
    expect(row.alternatives).toEqual([
      { answer: '店舗の娘', probability: 0.3 },
      { answer: 'あべのたん', probability: 0.15 }
    ])
  })

  test('最上位が other・secret・none でも、まとめない', () => {
    for (const top of ['other', 'secret', 'none']) {
      const row = unmerged({
        store: choice('abeno', { abeno: 0.9 }),
        character: choice(top, { [top]: 0.5, [CHARACTER_STORE]: 0.3, abeno: 0.2 })
      })
      expect(row.probability, top).toBe(0.5)
      expect(row.alternatives[0], top).toEqual({ answer: '店舗の娘', probability: 0.3 })
    }
  })

  test('character が choice でない（noul）回答は、従来の形で出る', () => {
    const row = characterRow({ store: choice('abeno', { abeno: 0.9 }), character: yes(0.9) })
    expect(row).toMatchObject({ answer: 'はい', probability: 0.9 })
  })
})
