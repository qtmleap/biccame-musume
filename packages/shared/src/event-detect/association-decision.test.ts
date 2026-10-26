import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from './clef'
import { evaluateDetection } from './detection'
import {
  associationAnswers,
  choice,
  evaluateWithStore,
  post,
  requestWithAssociations,
  response
} from './detection-test-fixtures'
import { describeDetectionOutcome } from './discovery'

const value = post('ふなとーたん擬人化記念アクキーを2026年11月3日から全員に配布します', {
  screenName: 'bic_funabashi',
  url: 'https://x.com/bic_funabashi/status/2109221721773576390'
})
const request = requestWithAssociations(value)
// 配布物・日付・条件は確定させ、店舗と娘の回答だけを変える。
const base: Record<string, ClefAnswer> = {
  category: choice('ackey', { ackey: 0.99 }),
  condition: choice('everyone', { everyone: 0.99 }),
  quantity: choice('none', { none: 0.99 })
}
// storeKey を省くと、選ばれた店舗と同じ抽出段階の候補があるものとして評価する（null を渡せば候補なし）。
const run = (overrides: Record<string, ClefAnswer>, storeKey?: string | null) =>
  evaluateWithStore(value, request, response(request, { ...base, ...overrides }), undefined, storeKey)

describe('店舗と対象ビッカメ娘を choice 1 問ずつで決める', () => {
  test('選ばれた店舗と娘を1件ずつ登録し、店舗名から娘を補完しない', () => {
    const result = run(associationAnswers('funabashi', 'funato'))
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected registration')
    expect(result.candidate.stores).toEqual(['funabashi'])
    expect(result.candidate.characterIds).toEqual(['funato'])
    expect(result.candidate.characterIds).not.toContain('funabashi')
  })
  test('投稿元と異なる開催店舗も、選ばれていれば採用する', () => {
    const result = run(associationAnswers('akiba', 'funato'))
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected registration')
    expect(result.candidate.stores).toEqual(['akiba'])
  })
  test.each(['other', 'secret'])('娘が %s の企画は、その値を対象として登録する', (special) => {
    const result = run(associationAnswers('funabashi', special))
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected registration')
    expect(result.candidate.characterIds).toEqual([special])
  })
  test('店舗が none なら store_unconfirmed で保留し、投稿アカウントから補完しない', () => {
    const result = run(associationAnswers('none', 'funato'))
    expect(result).toMatchObject({ status: 'held', reasons: ['store_unconfirmed'] })
    expect(result.reasons).not.toContain('store_inferred_from_account')
    expect(result).not.toHaveProperty('candidate')
  })
  test('店舗が multiple・しきい値未満でも store_unconfirmed で保留する', () => {
    expect(run(associationAnswers('multiple', 'funato'))).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed']
    })
    // 選ばれた店舗の確率が下限（0.7）に届かず、確認の質問も無い（旧版の保存データ）ときは、採用せず保留する。
    expect(
      run({
        ...associationAnswers('funabashi', 'funato'),
        store: choice('funabashi', { funabashi: 0.25, none: 0.2 })
      })
    ).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed']
    })
  })
  test('娘が multiple（共同絵柄）なら character_unconfirmed で保留し、複数登録しない', () => {
    const result = run(associationAnswers('funabashi', 'multiple'))
    expect(result).toMatchObject({ status: 'held', reasons: ['character_unconfirmed'] })
    expect(result).not.toHaveProperty('candidate')
  })
  test('娘の確率が下限（0.7）に届かず確認も無いなら、娘は明示されていないので、次点が近くても採用せず店舗の娘で登録する', () => {
    const result = run({
      ...associationAnswers('funabashi', 'funato'),
      character: choice('funato', { funato: 0.25, funabashi: 0.2 })
    })
    expect(result).toMatchObject({ status: 'register', reasons: [] })
    if (result.status !== 'register') throw new Error('Expected registration')
    expect(result.candidate.characterIds).toEqual(['funabashi'])
  })
  test('店舗の質問にない値や、辞書にない娘を答えた応答は不正な選択として投げる', () => {
    expect(() => run({ store: choice('invented', { invented: 0.99 }) })).toThrow('Invalid detection choice')
    expect(() => run({ character: choice('invented', { invented: 0.99 }) })).toThrow('Invalid detection choice')
  })
  test('娘の回答が欠けた応答は不完全として投げる', () => {
    const { character: _missing, ...answers } = response(request, base).answers
    expect(() => evaluateDetection(value, request, { answers })).toThrow('Incomplete')
  })
})

describe('対象外にするのは、店舗と娘の両方が none のときだけ', () => {
  test('両方が none（しきい値以上）なら ignored。理由は not_distribution_event で、confidence は P(is_event) のまま', () => {
    const result = run({ ...associationAnswers('none', 'none'), is_event: { type: 'noul', noul: 0.97 } })
    expect(result).toEqual({ status: 'ignored', confidence: 0.97, reasons: ['not_distribution_event'] })
  })
  test('片方だけ none なら ignored にせず held', () => {
    expect(run(associationAnswers('none', 'funato'))).toMatchObject({ status: 'held' })
    expect(run(associationAnswers('funabashi', 'none'))).toMatchObject({
      status: 'held',
      reasons: ['character_unconfirmed']
    })
  })
  test('none の確率がしきい値未満なら ignored にしない', () => {
    const weak = choice('none', { none: 0.6, funabashi: 0.3 })
    const result = run({ store: weak, character: choice('none', { none: 0.6, funato: 0.3 }) })
    expect(result.status).toBe('held')
    expect(result.reasons).toEqual(expect.arrayContaining(['store_unconfirmed', 'character_unconfirmed']))
  })
  test('none で対象外にするしきい値は、店舗も娘も共通値 fieldThreshold（採用の下限や store の項目別設定とは別）', () => {
    const answers = {
      store: choice('none', { none: 0.85, funabashi: 0.1 }),
      character: choice('none', { none: 0.85, funato: 0.1 })
    }
    const thresholds = (fieldThresholds: { store: number }, fieldThreshold: number) => ({
      eventThreshold: 0.9,
      fieldThreshold,
      ignoreThreshold: 0.5,
      fieldThresholds
    })
    const evaluate = (settings: ReturnType<typeof thresholds>) =>
      evaluateDetection(value, request, response(request, { ...base, ...answers }), settings)
    expect(evaluate(thresholds({ store: 0.3 }, 0.8)).status).toBe('ignored')
    expect(evaluate(thresholds({ store: 0.9 }, 0.8)).status).toBe('ignored')
    expect(evaluate(thresholds({ store: 0.3 }, 0.9)).status).toBe('held')
    expect(evaluate(thresholds({ store: 0.8 }, 0.9)).status).toBe('held')
  })
  test('キーワードフィルタで除外された投稿は、回答にかかわらず従来の理由で ignored', () => {
    const untrusted = { ...value, screenName: 'untrusted' }
    expect(
      evaluateDetection(
        untrusted,
        request,
        response(request, { ...base, ...associationAnswers('funabashi', 'funato') })
      )
    ).toEqual({ status: 'ignored', confidence: 0, reasons: ['non_store_account'] })
  })
})

describe('is_event は参考値に降格した', () => {
  test.each([0.05, 0.4, 0.8])(
    'is_event が %s でも、店舗と娘が取れていれば登録し、confidence は P(is_event)',
    (noul) => {
      const result = run({ ...associationAnswers('funabashi', 'funato'), is_event: { type: 'noul', noul } })
      expect(result).toMatchObject({ status: 'register', confidence: noul, reasons: [] })
    }
  )
  test('is_event が低くても、両方 none でなければ ignored にならない', () => {
    const result = run({ ...associationAnswers('none', 'funato'), is_event: { type: 'noul', noul: 0.01 } })
    expect(result.status).toBe('held')
    expect(result.reasons).not.toContain('not_distribution_event')
    expect(result.reasons).not.toContain('event_confidence_below_threshold')
  })
  test('is_event の回答が noul でなければ、従来どおり不正な応答として投げる', () => {
    const answers = response(request, { ...base, ...associationAnswers('funabashi', 'funato') }).answers
    const { is_event: _event, ...withoutEvent } = answers
    expect(() => evaluateDetection(value, request, { answers: withoutEvent })).toThrow('Incomplete')
  })
  test('両方 none で対象外になった投稿は、is_event が高くても発見の状態を not_event にする', () => {
    const answers = response(request, {
      ...base,
      ...associationAnswers('none', 'none'),
      is_event: { type: 'noul', noul: 0.99 }
    }).answers
    const decision = evaluateDetection(value, request, { answers })
    const outcome = describeDetectionOutcome(value, answers, decision)
    expect(outcome.discovery).toMatchObject({ status: 'not_event', confidence: 0.99 })
    expect(outcome.action).toBe('ignore')
  })
  test('キーワード不在などの別の理由による ignored は、is_event が高ければ従来どおり発見のまま', () => {
    const answers = { is_event: { type: 'noul' as const, noul: 0.99 } }
    const decision = { status: 'ignored' as const, confidence: 0.99, reasons: ['no_keyword'] }
    const outcome = describeDetectionOutcome(post('限定デザイン'), answers, decision)
    expect(outcome.discovery.status).toBe('detected')
  })
})

describe('抽出段階の開催店舗候補（storeKey）との照合', () => {
  test('選ばれた店舗と一致すれば登録する。候補が無ければ照合しない', () => {
    expect(run(associationAnswers('funabashi', 'funato'), 'funabashi').status).toBe('register')
    // 抽出段階の開催店舗候補が無い（null）候補は、店舗の照合ができないので保留規則で保留する。
    expect(run(associationAnswers('funabashi', 'funato'), null)).toMatchObject({
      status: 'held',
      reasons: ['extraction_store_unspecified']
    })
  })
  test('食い違うときは store_mismatch で保留し、登録候補を作らない', () => {
    const result = run(associationAnswers('funabashi', 'funato'), 'akiba')
    expect(result).toMatchObject({ status: 'held', reasons: ['store_mismatch'] })
    expect(result).not.toHaveProperty('candidate')
  })
  test('店舗が選ばれていないときは、候補があっても store_unconfirmed を優先する', () => {
    expect(run(associationAnswers('none', 'funato'), 'akiba')).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed']
    })
  })
})
