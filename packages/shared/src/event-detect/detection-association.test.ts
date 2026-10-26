import { describe, expect, test } from 'bun:test'
import { confirmTargetOf, createConfirmRequest } from './association-confirm'
import { CHARACTER_CONFIRM_KEY, CHARACTER_STORE, STORE_CONFIRM_KEY } from './associations'
import type { ClefAnswer, ClefRequest } from './clef'
import { DEFAULT_DETECTION_THRESHOLDS, type DetectionThresholds, thresholdOf } from './detection'
import { decideAssociations } from './detection-association'
import {
  choice,
  choiceThresholds,
  evaluateWithStore,
  post,
  requestWithAssociations,
  response
} from './detection-test-fixtures'

// 店舗・ビッカメ娘の採用規則: 1段目の最上位の確率が 70% 以上なら2段目の確認なしで確定、70% 未満なら確認の「はい」が 70% 以上のときだけ確定。
// 判定（decideAssociations）と確認の対象選択（confirmTargetOf）が、同じ thresholdOf の値を使うこと。
const value = post('ふなとーたん擬人化記念アクキーを2026年11月3日から全員に配布します', {
  screenName: 'bic_funabashi',
  url: 'https://x.com/bic_funabashi/status/2109221721773576390'
})
const first = requestWithAssociations(value)
const base: Record<string, ClefAnswer> = {
  category: choice('ackey', { ackey: 0.99 }),
  condition: choice('everyone', { everyone: 0.99 }),
  quantity: choice('none', { none: 0.99 })
}
// 最上位 top を確率 p にした choice（残りは none に置く。合計が 1 を超えない）。
const top = (selected: string, p: number): ClefAnswer =>
  choice(selected, selected === 'none' ? { none: p } : { [selected]: p, none: Math.min(1 - p, p) })
const yes = (store?: number, character?: number): Record<string, ClefAnswer> => ({
  ...(store === undefined ? {} : { [STORE_CONFIRM_KEY]: { type: 'noul', noul: store } satisfies ClefAnswer }),
  ...(character === undefined
    ? {}
    : { [CHARACTER_CONFIRM_KEY]: { type: 'noul', noul: character } satisfies ClefAnswer })
})
// 本番（runWebhookDetection）と同じく、1段目の応答から確認の対象を決め、確認の質問をまとめた request を作る。
const requestFor = (
  answers: Record<string, ClefAnswer>,
  thresholds: DetectionThresholds = DEFAULT_DETECTION_THRESHOLDS
) => {
  const target = confirmTargetOf(answers, choiceThresholds(thresholds))
  if (target.store === undefined && target.character === undefined) return first
  const confirm = createConfirmRequest(first, target)
  return { ...first, questions: { ...first.questions, ...confirm.questions } }
}
const run = (
  firstStage: Record<string, ClefAnswer>,
  confirm: Record<string, ClefAnswer> = {},
  options: { request?: ClefRequest; thresholds?: DetectionThresholds } = {}
) => {
  const thresholds = options.thresholds === undefined ? DEFAULT_DETECTION_THRESHOLDS : options.thresholds
  const request = options.request === undefined ? requestFor(firstStage, thresholds) : options.request
  const answers = response(request, { ...base, ...firstStage }).answers
  const { [STORE_CONFIRM_KEY]: _store, [CHARACTER_CONFIRM_KEY]: _character, ...rest } = answers
  return evaluateWithStore(value, request, { answers: { ...rest, ...confirm } }, thresholds)
}
const storesOf = (result: ReturnType<typeof run>) => {
  if (result.status !== 'register') throw new Error(`Expected registration: ${result.reasons.join(',')}`)
  return result.candidate.stores
}
const charactersOf = (result: ReturnType<typeof run>) => {
  if (result.status !== 'register') throw new Error(`Expected registration: ${result.reasons.join(',')}`)
  return result.candidate.characterIds
}

describe('店舗: 最上位が 70% 以上なら確認なしで確定、70% 未満なら確認の「はい」が 70% 以上のときだけ確定', () => {
  test('① 最上位が 85%・確認なし → 採用（確認は聞かれない）', () => {
    const answers = { store: top('funabashi', 0.85), character: top('funabashi', 0.85) }
    const request = requestFor(answers)
    expect(Object.keys(request.questions)).not.toContain(STORE_CONFIRM_KEY)
    expect(storesOf(run(answers))).toEqual(['funabashi'])
  })
  test('② 最上位が 60%・確認がはい 97% → 採用', () => {
    const answers = { store: top('funabashi', 0.6) }
    expect(Object.keys(requestFor(answers).questions)).toContain(STORE_CONFIRM_KEY)
    const result = run(answers, yes(0.97))
    expect(storesOf(result)).toEqual(['funabashi'])
    expect(result.reasons).toEqual([])
  })
  test('③ 最上位が 60%・確認がいいえ（はい 40%）→ 不採用（store_unconfirmed + store_confirm_low）', () => {
    const result = run({ store: top('funabashi', 0.6) }, yes(0.4))
    expect(result).toMatchObject({ status: 'held' })
    expect(result.reasons).toEqual(expect.arrayContaining(['store_unconfirmed', 'store_confirm_low']))
    expect(result).not.toHaveProperty('candidate')
  })
  test('④ 最上位が 60%・request に確認が無い（旧データ）→ 不採用。確認を聞いていないので store_confirm_low は付かない', () => {
    // 保存済みの過去データ（v15 以前）は確認の質問を含まない。旧版の下限 30% は廃止したので、70% 未満は採用しない。
    const answers = { store: top('funabashi', 0.6) }
    const result = run(answers, yes(0.99), { request: first })
    expect(result).toMatchObject({ status: 'held' })
    expect(result.reasons).toContain('store_unconfirmed')
    expect(result.reasons).not.toContain('store_confirm_low')
  })
  test('⑤ 最上位が 85%・確認が回答にあって低い → 採用（確認を見ない）', () => {
    const answers = { store: top('funabashi', 0.85) }
    const withQuestion = {
      ...first,
      questions: { ...first.questions, ...createConfirmRequest(first, { store: 'funabashi' }).questions }
    }
    const result = run(answers, yes(0.05), { request: withQuestion })
    expect(storesOf(result)).toEqual(['funabashi'])
    expect(result.reasons).not.toContain('store_confirm_low')
  })
  test('⑧ ちょうど 70% は確認なしで採用（境界）。69.9% は確認を聞く', () => {
    expect(storesOf(run({ store: top('funabashi', 0.7) }))).toEqual(['funabashi'])
    const below = { store: top('funabashi', 0.699) }
    expect(Object.keys(requestFor(below).questions)).toContain(STORE_CONFIRM_KEY)
    expect(run(below).status).toBe('held')
    expect(storesOf(run(below, yes(0.7)))).toEqual(['funabashi'])
    expect(run(below, yes(0.699)).status).toBe('held')
  })
  test('確認の回答が欠けているなら（確認を聞いたのに）不採用。例外にしない', () => {
    const result = run({ store: top('funabashi', 0.6) }, {})
    expect(result).toMatchObject({ status: 'held' })
    expect(result.reasons).toEqual(expect.arrayContaining(['store_unconfirmed', 'store_confirm_low']))
  })
  test('none・multiple は確率が高くても採用しない（確認の対象にもならない）', () => {
    for (const special of ['none', 'multiple']) {
      const answers = { store: top(special, 0.95) }
      expect(confirmTargetOf(answers, choiceThresholds()).store).toBeUndefined()
      expect(run(answers).reasons).toContain('store_unconfirmed')
    }
  })
})

describe('娘: 最上位が 70% 以上なら確認なしで明示として採用、70% 未満なら確認の「はい」が 70% 以上のときだけ明示', () => {
  const stores = { store: top('funabashi', 0.95) }
  test('⑥ 85% で明示として採用する', () => {
    const answers = { ...stores, character: top('funato', 0.85) }
    expect(Object.keys(requestFor(answers).questions)).not.toContain(CHARACTER_CONFIRM_KEY)
    expect(charactersOf(run(answers))).toEqual(['funato'])
  })
  test('⑥ 60% + 確認がはい で明示として採用する', () => {
    const answers = { ...stores, character: top('funato', 0.6) }
    expect(Object.keys(requestFor(answers).questions)).toContain(CHARACTER_CONFIRM_KEY)
    expect(charactersOf(run(answers, yes(undefined, 0.9)))).toEqual(['funato'])
  })
  test('⑥ 60% + 確認が低い・確認なしは、明示なしとして採用した店舗の娘になる（保留しない）', () => {
    const answers = { ...stores, character: top('funato', 0.6) }
    const low = run(answers, yes(undefined, 0.2))
    expect(low).toMatchObject({ status: 'register', reasons: [] })
    expect(charactersOf(low)).toEqual(['funabashi'])
    // 確認の質問が無い保存データ。
    const old = run(answers, {}, { request: first })
    expect(old).toMatchObject({ status: 'register', reasons: [] })
    expect(charactersOf(old)).toEqual(['funabashi'])
  })
  test('85% なら確認が回答にあって低くても、確認を見ずに明示として採用する', () => {
    const answers = { ...stores, character: top('funato', 0.85) }
    const withQuestion = {
      ...first,
      questions: { ...first.questions, ...createConfirmRequest(first, { character: 'funato' }).questions }
    }
    expect(charactersOf(run(answers, yes(undefined, 0.01), { request: withQuestion }))).toEqual(['funato'])
  })
  test('other・secret は 70% 以上なら明示、未満なら店舗の娘。store_character は常に店舗の娘', () => {
    for (const special of ['other', 'secret'] as const) {
      expect(charactersOf(run({ ...stores, character: top(special, 0.85) })), special).toEqual([special])
      expect(charactersOf(run({ ...stores, character: top(special, 0.5) })), special).toEqual(['funabashi'])
    }
    for (const p of [0.95, 0.4]) {
      expect(charactersOf(run({ ...stores, character: top(CHARACTER_STORE, p) })), String(p)).toEqual(['funabashi'])
    }
  })
  test('multiple・none は確率に関わらず店舗の娘にせず保留する（従来どおり）', () => {
    for (const special of ['multiple', 'none']) {
      for (const p of [0.95, 0.4]) {
        expect(run({ ...stores, character: top(special, p) }).reasons, `${special} ${p}`).toContain(
          'character_unconfirmed'
        )
      }
    }
  })
  test('店舗が採用されない保留のときは、娘の確認が低かったことも併記する', () => {
    const answers = { store: top('funabashi', 0.6), character: top('funato', 0.6) }
    const result = run(answers, yes(0.2, 0.2))
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'store_unconfirmed',
        'store_confirm_low',
        'character_unconfirmed',
        'character_confirm_low'
      ])
    )
  })
  test('両方 none を共通値以上で選んだときだけ対象外にする（70% の採用の下限とは別）', () => {
    expect(run({ store: top('none', 0.95), character: top('none', 0.95) }).status).toBe('ignored')
    expect(run({ store: top('none', 0.75), character: top('none', 0.75) }).status).toBe('held')
  })
})

describe('⑦ 店舗の娘（店舗と同じ ID）も、具体的な娘で 70% 未満なら確認の対象になる。70% 以上なら対象にならない', () => {
  test('店舗も娘も 60% なら両方を確認する', () => {
    const answers = { store: top('funabashi', 0.6), character: top('funabashi', 0.6) }
    expect(confirmTargetOf(answers, choiceThresholds())).toEqual({ store: 'funabashi', character: 'funabashi' })
  })
  test('店舗が 85%・娘が 60% なら娘だけを確認する。娘が 85% なら対象にならない', () => {
    expect(
      confirmTargetOf({ store: top('funabashi', 0.85), character: top('funabashi', 0.6) }, choiceThresholds())
    ).toEqual({
      character: 'funabashi'
    })
    expect(
      confirmTargetOf({ store: top('funabashi', 0.6), character: top('funabashi', 0.85) }, choiceThresholds())
    ).toEqual({
      store: 'funabashi'
    })
    expect(
      confirmTargetOf({ store: top('funabashi', 0.85), character: top('funabashi', 0.85) }, choiceThresholds())
    ).toEqual({})
  })
  test('確率が取れない・欠けた回答は 70% 未満として扱い、確認を聞く側に倒す', () => {
    const missing: Record<string, ClefAnswer> = {
      store: { type: 'choice', choice: 'funabashi', probabilities: {} },
      character: { type: 'choice', choice: 'funato', probabilities: {} }
    }
    expect(confirmTargetOf(missing, choiceThresholds())).toEqual({ store: 'funabashi', character: 'funato' })
  })
  test('店舗の娘で娘の確認が低くても保留にせず、店舗の娘で登録する（判定は変わらない）', () => {
    const answers = { store: top('funabashi', 0.95), character: top('funabashi', 0.6) }
    const result = run(answers, yes(undefined, 0.05))
    expect(result).toMatchObject({ status: 'register', reasons: [] })
    expect(charactersOf(result)).toEqual(['funabashi'])
  })
})

describe('確認を聞く条件と採用の条件は、同じ thresholdOf の値を使う（ずれない）', () => {
  const settings = (fieldThresholds: DetectionThresholds['fieldThresholds']): DetectionThresholds => ({
    ...DEFAULT_DETECTION_THRESHOLDS,
    ...(fieldThresholds === undefined ? {} : { fieldThresholds })
  })
  test('保存した store: 0.9 では 85% は確認を聞く（採用は確認の「はい」で決まる）、95% は聞かない', () => {
    const saved = settings({ store: 0.9 })
    const at85 = { store: top('funabashi', 0.85) }
    expect(confirmTargetOf(at85, choiceThresholds(saved)).store).toBe('funabashi')
    expect(run(at85, {}, { thresholds: saved }).reasons).toContain('store_unconfirmed')
    expect(storesOf(run(at85, yes(0.8), { thresholds: saved }))).toEqual(['funabashi'])
    const at95 = { store: top('funabashi', 0.95) }
    expect(confirmTargetOf(at95, choiceThresholds(saved)).store).toBeUndefined()
    expect(storesOf(run(at95, {}, { thresholds: saved }))).toEqual(['funabashi'])
  })
  test('確認のしきい値を 0.5 に保存すると、はい 60% で採用される（既定では不採用）', () => {
    const answers = { store: top('funabashi', 0.6), character: top('funato', 0.6) }
    expect(run(answers, yes(0.6, 0.6)).status).toBe('held')
    const saved = settings({ store_confirm: 0.5, character_confirm: 0.5 })
    const result = run(answers, yes(0.6, 0.6), { thresholds: saved })
    expect(storesOf(result)).toEqual(['funabashi'])
    expect(charactersOf(result)).toEqual(['funato'])
  })
  test('娘の 1 段目のしきい値を 0.5 に保存すると、60% は確認なしで明示として採用される', () => {
    const saved = settings({ character: 0.5 })
    const answers = { store: top('funabashi', 0.95), character: top('funato', 0.6) }
    expect(confirmTargetOf(answers, choiceThresholds(saved)).character).toBeUndefined()
    expect(charactersOf(run(answers, {}, { thresholds: saved }))).toEqual(['funato'])
  })
  test('どの確率・どの設定でも、確認を聞く ⇔ 70% 未満（採用は確認なしでは決まらない）が decideAssociations と一致する', () => {
    const settingsList = [
      DEFAULT_DETECTION_THRESHOLDS,
      settings({ store: 0.9, character: 0.5 }),
      settings({ store: 0.3 })
    ]
    for (const thresholds of settingsList) {
      for (const p of [0.2, 0.3, 0.5, 0.69, 0.7, 0.71, 0.9, 0.99]) {
        const answers = { store: top('funabashi', p), character: top('funato', p) }
        const target = confirmTargetOf(answers, choiceThresholds(thresholds))
        const asked = requestFor(answers, thresholds)
        // 確認を聞く対象 ⇔ 確認の質問が request に入る ⇔ 下限未満。
        expect(target.store !== undefined, `store ${p}`).toBe(p < thresholdOf(thresholds, 'store'))
        expect(target.character !== undefined, `character ${p}`).toBe(p < thresholdOf(thresholds, 'character'))
        expect(Object.keys(asked.questions).includes(STORE_CONFIRM_KEY)).toBe(target.store !== undefined)
        // 確認を聞かなかった項目（下限以上）は、確認の回答が無くても採用される。聞いた項目は、確認の回答が「はい」でなければ採用されない。
        const answersOnly = response(asked, { ...base, ...answers }).answers
        const { [STORE_CONFIRM_KEY]: _store, [CHARACTER_CONFIRM_KEY]: _character, ...withoutConfirm } = answersOnly
        const decision = decideAssociations(asked, withoutConfirm, thresholds)
        expect(decision.stores.length === 1, `store ${p}`).toBe(target.store === undefined)
      }
    }
  })
})
