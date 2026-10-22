import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from './clef'
import { ClefRequestSchema } from './clef'
import { dateCandidates } from './decide'
import {
  createDetectionRequest,
  DetectionThresholdsSchema,
  evaluateDetection,
  filterWebhookPost,
  WEBHOOK_KEYWORD_VERDICTS,
  webhookKeywordVerdict
} from './detection'
import {
  categoryCriteria,
  choice,
  now,
  payload,
  post,
  requestWithAssociations,
  response
} from './detection-test-fixtures'
import { normalizeWebhookPayload } from './webhook'

describe('Webhook payload', () => {
  test('Snowflakeを精度を落とさず復元し、通知timestampと購読先を使わない', () => {
    const value = payload()
    const result = normalizeWebhookPayload(value, now)
    expect(result.success).toBe(true)
    if (!result.success) throw result.error
    expect(result.data.id).toBe(value.data.uri.split('/')[3])
    expect(result.data.createdAt).toBe('2026-10-11T01:00:00.000Z')
    expect(result.data.url).toBe(`https://x.com/bic_abeno/status/${result.data.id}`)
    expect(JSON.stringify(result.data)).not.toContain('synthetic-subscription')
    expect(JSON.stringify(result.data)).not.toContain('unused.png')
    expect(result.data).not.toHaveProperty('timestamp')
  })
  test('上位body/tagが省略された通知も受信できる', () => {
    expect(normalizeWebhookPayload({ data: payload().data }, now).success).toBe(true)
  })
  test('矛盾するbody/tagと外部URL、tweet以外を拒否する', () => {
    const value = payload()
    for (const invalid of [
      { ...value, body: 'different' },
      { ...value, tag: 'tweet-123' },
      { ...value, data: { ...value.data, tag: 'tweet-123' } },
      { ...value, data: { ...value.data, uri: 'https://x.com/bic_abeno/status/123' } },
      { ...value, data: { ...value.data, type: 'reply' } }
    ])
      expect(normalizeWebhookPayload(invalid, now).success).toBe(false)
  })
  test('64bit超過、先頭ゼロ、未来の投稿IDを拒否する', () => {
    const value = payload()
    for (const id of ['18446744073709551616', '000123']) {
      expect(
        normalizeWebhookPayload({ data: { ...value.data, uri: `/bic_abeno/status/${id}`, tag: `tweet-${id}` } }, now)
          .success
      ).toBe(false)
    }
    expect(normalizeWebhookPayload(payload('2026-10-11T02:06:00.000Z'), now).success).toBe(false)
  })
  test('本文のRT表記は構造除外できる', () => {
    const value = payload()
    const result = normalizeWebhookPayload({ data: { ...value.data, body: 'RT @other: あべのたん名刺配布' } }, now)
    expect(result.success).toBe(true)
    if (!result.success) throw result.error
    expect(filterWebhookPost(result.data).reason).toBe('retweet')
  })
})

describe('Strict date candidates', () => {
  test('存在しない日付を候補にしない', () => {
    expect(dateCandidates(post('2026/2/30、2026年4月31日、13/2'))).toEqual([])
    expect(dateCandidates(post('2027/2/29'))).toEqual([])
    expect(dateCandidates(post('2028/2/29'))).toEqual(['2028-02-29'])
  })
  test('明示年を投稿日に合わせて書き換えない', () => {
    expect(dateCandidates(post('2027年11月3日、2028/1/2'))).toEqual(['2027-11-03', '2028-01-02'])
  })
  test('年末とJSTの本日・明日を処理する', () => {
    expect(dateCandidates(post('1/2から', { createdAt: '2026-12-30T15:00:00.000Z' }))).toEqual(['2027-01-02'])
    expect(dateCandidates(post('本日から明日まで', { createdAt: '2026-12-31T15:00:00.000Z' }))).toEqual([
      '2027-01-01',
      '2027-01-02'
    ])
  })
})

const omitKey = <T>(record: Record<string, T>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== key))

describe('Detection gate', () => {
  test('初期Clefリクエストは既存schemaを満たす', () => {
    const request = requestWithAssociations(post())
    expect(request.model).toBe('clef')
    expect(ClefRequestSchema.safeParse(createDetectionRequest(post())).success).toBe(true)
    // category は本文に根拠語がある種類だけが選択肢に出る（この本文は「名刺」のみ）。
    expect(Object.keys(categoryCriteria(request))).toEqual(['limited_card', 'regular_card', 'other', 'none'])
  })
  test('既知店舗・キーワードを先に判定できる', () => {
    expect(filterWebhookPost(post()).reason).toBeUndefined()
    expect(filterWebhookPost(post('日常のあいさつです')).reason).toBe('no_keyword')
    expect(filterWebhookPost(post(undefined, { screenName: 'untrusted' })).reason).toBe('non_store_account')
  })
  test('高スコアで必須項目が揃う告知だけ登録候補にする', () => {
    const value = post()
    const request = requestWithAssociations(value)
    const result = evaluateDetection(value, request, response(request))
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate).toEqual({
      category: 'limited_card',
      title: 'ビックカメラあべのキューズモール店 限定名刺配布',
      stores: ['abeno'],
      characterIds: ['abeno'],
      startDate: '2026-11-03',
      conditions: [{ type: 'first_come', quantity: 100 }],
      referenceUrls: [{ type: 'announce', url: value.url }],
      limitedQuantity: 100,
      isPreliminary: false
    })
  })
  test('is_event は参考値で、低くても店舗とビッカメ娘が取れていれば登録し、confidence に P(is_event) を残す', () => {
    const value = post()
    const request = requestWithAssociations(value)
    for (const noul of [0.1, 0.8])
      expect(evaluateDetection(value, request, response(request, { is_event: { type: 'noul', noul } }))).toMatchObject({
        status: 'register',
        confidence: noul,
        reasons: []
      })
  })
  test('confidenceではなく選択肢のprobabilitiesで足切りする', () => {
    const value = post()
    const request = requestWithAssociations(value)
    const result = evaluateDetection(
      value,
      request,
      response(request, {
        category: { type: 'choice', choice: 'limited_card', probabilities: { limited_card: 0.8 }, confidence: 0.99 }
      })
    )
    expect(result).toMatchObject({ status: 'held', reasons: ['category_unconfirmed'] })
  })
  test('閾値ちょうどは通過する', () => {
    const value = post()
    const request = requestWithAssociations(value)
    const result = evaluateDetection(
      value,
      request,
      response(request, {
        is_event: { type: 'noul', noul: 0.9 },
        category: { type: 'choice', choice: 'limited_card', probabilities: { limited_card: 0.9 } }
      })
    )
    expect(result.status).toBe('register')
  })
  test('必須の開催日が欠ける場合は保留する', () => {
    const value = post('あべのたん限定名刺を先着100枚配布します')
    const request = requestWithAssociations(value)
    expect(evaluateDetection(value, request, response(request))).toMatchObject({
      status: 'held',
      reasons: ['start_date_unspecified']
    })
  })
  test('配布条件を書いていない投稿は条件なし（全員）として登録し、条件未記載で保留しない', () => {
    const value = post('あべのたん限定名刺を2026年11月3日から配布します')
    const request = requestWithAssociations(value)
    // 本文に条件の語が無いので、条件の質問は作られない。
    expect(request.questions).not.toHaveProperty('condition')
    const result = evaluateDetection(value, request, response(request))
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate.conditions).toEqual([{ type: 'everyone' }])
  })
  test('質問の有無は本文から作り直さず、送った request で決める（条件の質問が無い古い版の保存データでも評価できる）', () => {
    const value = post('あべのたん限定名刺を2026年11月3日から先着で配布します')
    const sent = requestWithAssociations(value)
    expect(sent.questions).toHaveProperty('condition')
    const request = { ...sent, questions: omitKey(sent.questions, 'condition') }
    expect(evaluateDetection(value, request, response(request))).toMatchObject({
      status: 'register',
      candidate: { conditions: [{ type: 'everyone' }] }
    })
  })
  test('「円以上」だけで購入・入金の語が無い曖昧な金額は、全員とみなさず保留する', () => {
    const value = post('あべのたん限定名刺を2026年11月3日から3,000円以上で配布します')
    const request = requestWithAssociations(value)
    expect(request.questions).not.toHaveProperty('condition')
    expect(evaluateDetection(value, request, response(request))).toMatchObject({
      status: 'held',
      reasons: ['distribution_condition_unspecified']
    })
  })
  test('先着と抽選の両方の語がある投稿は、条件の質問が作られなくても全員とみなさず保留する', () => {
    const value = post('あべのたん限定名刺を2026年11月3日から先着100枚を抽選で配布します')
    const request = requestWithAssociations(value)
    expect(request.questions).not.toHaveProperty('condition')
    expect(evaluateDetection(value, request, response(request))).toMatchObject({
      status: 'held',
      reasons: ['distribution_condition_unspecified']
    })
  })
  test('条件の質問があって none と答えた・確率が足りない投稿は、条件なしとみなさず保留する', () => {
    const value = post('あべのたん限定名刺を2026年11月3日から先着で配布します')
    const request = requestWithAssociations(value)
    expect(request.questions).toHaveProperty('condition')
    const none = response(request, { condition: choice('none', { none: 0.99 }) })
    expect(evaluateDetection(value, request, none)).toMatchObject({
      status: 'held',
      reasons: ['distribution_condition_unspecified']
    })
    const unsure = response(request, { condition: choice('first_come', { first_come: 0.5, none: 0.4 }) })
    expect(evaluateDetection(value, request, unsure)).toMatchObject({
      status: 'held',
      reasons: ['distribution_condition_unconfirmed']
    })
  })
  test('未対応の会員・提示などの語がある投稿は、条件の質問が無くても全員とみなさず保留する', () => {
    const value = post('あべのたん限定名刺を2026年11月3日から会員カード提示で配布します')
    const request = requestWithAssociations(value)
    expect(request.questions).not.toHaveProperty('condition')
    expect(evaluateDetection(value, request, response(request))).toMatchObject({
      status: 'held',
      reasons: ['unmodeled_distribution_condition', 'distribution_condition_unspecified']
    })
  })
  test('終了日・数量の記載がないこと自体は保留理由にしない', () => {
    const value = post('あべのたん限定名刺を2026年11月3日からどなたでも配布します')
    const request = requestWithAssociations(value)
    const result = evaluateDetection(
      value,
      request,
      response(request, { condition: { type: 'choice', choice: 'everyone', probabilities: { everyone: 0.99 } } })
    )
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate.conditions).toEqual([{ type: 'everyone' }])
    expect(result.candidate).not.toHaveProperty('endDate')
    expect(result.candidate).not.toHaveProperty('limitedQuantity')
  })
  test('購入条件は金額が不明なら保留、確定すれば先着と両方保存する', () => {
    const condition: ClefAnswer = {
      type: 'choice',
      choice: 'purchase_first_come',
      probabilities: { purchase_first_come: 0.99 }
    }
    const unknown = post('あべのたん限定名刺 2026年11月3日からお買い上げの方先着100枚')
    const unknownRequest = requestWithAssociations(unknown)
    expect(evaluateDetection(unknown, unknownRequest, response(unknownRequest, { condition }))).toMatchObject({
      status: 'held',
      reasons: ['purchase_amount_unconfirmed']
    })
    const value = post('あべのたん限定名刺 2026年11月3日から1,000円以上お買い上げの方先着100枚')
    const request = requestWithAssociations(value)
    const result = evaluateDetection(value, request, response(request, { condition }))
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate.conditions).toEqual([
      { type: 'purchase', purchaseAmount: 1000 },
      { type: 'first_come', quantity: 100 }
    ])
  })
  test('継続・終了は新規登録にしない', () => {
    const value = post()
    const request = requestWithAssociations(value)
    for (const choice of ['ongoing', 'end'])
      expect(
        evaluateDetection(
          value,
          request,
          response(request, { status: { type: 'choice', choice, probabilities: { [choice]: 0.99 } } })
        )
      ).toMatchObject({ status: 'held', reasons: [choice === 'ongoing' ? 'existing_event_update' : 'event_ended'] })
  })
  test('本文の複数キャラ言及だけでは店舗やイベントの曖昧さとみなさない', () => {
    const value = post('あべのたん・アキバたん 限定名刺 2026年11月3日から先着100枚')
    const request = requestWithAssociations(value)
    expect(evaluateDetection(value, request, response(request)).status).toBe('register')
    const single = post()
    const singleRequest = requestWithAssociations(single)
    expect(
      evaluateDetection(single, singleRequest, response(singleRequest, { single_event: { type: 'noul', noul: 0.3 } }))
        .reasons
    ).not.toContain('multiple_or_ambiguous_events')
  })
  test('逆転した期間は保留する', () => {
    const value = post('あべのたん限定名刺 2026年11月3日から11月2日まで先着100枚')
    const request = requestWithAssociations(value)
    expect(
      evaluateDetection(
        value,
        request,
        response(request, { end_date: { type: 'choice', choice: 'd20261102', probabilities: { d20261102: 0.99 } } })
      ).reasons
    ).toContain('invalid_date_range')
  })
  test('欠落・不正選択・不正確率はupstream失敗として扱う', () => {
    const value = post()
    const request = requestWithAssociations(value)
    expect(() => evaluateDetection(value, request, { answers: {} })).toThrow('Incomplete detection response')
    expect(() =>
      evaluateDetection(
        value,
        request,
        response(request, { category: { type: 'choice', choice: 'invented', probabilities: { invented: 0.99 } } })
      )
    ).toThrow('Invalid detection choice')
    expect(() => evaluateDetection(value, request, response(request, { is_event: { type: 'noul', noul: 2 } }))).toThrow(
      'Invalid detection response'
    )
    expect(() =>
      evaluateDetection(
        value,
        request,
        response(request, {
          category: { type: 'choice', choice: 'limited_card', probabilities: { limited_card: 0.6, other: 0.7 } }
        })
      )
    ).toThrow('Invalid detection choice')
  })
  test('未対応の会員・提示条件を無条件配布に置き換えない', () => {
    const value = post('あべのたん限定名刺 2026年11月3日から会員カード提示で先着100枚配布')
    const request = requestWithAssociations(value)
    expect(evaluateDetection(value, request, response(request)).reasons).toContain('unmodeled_distribution_condition')
  })
  test('単なる購入表記も購入額不明なら先着だけで登録しない', () => {
    const value = post('あべのたん限定名刺 2026年11月3日から商品購入で先着100枚配布')
    const request = requestWithAssociations(value)
    expect(
      evaluateDetection(
        value,
        request,
        response(request, {
          condition: { type: 'choice', choice: 'purchase_first_come', probabilities: { purchase_first_come: 0.99 } }
        })
      ).reasons
    ).toContain('purchase_amount_unconfirmed')
  })
  test('確率分布の合計が1を超えるAI応答は拒否する', () => {
    const value = post()
    const request = requestWithAssociations(value)
    expect(() =>
      evaluateDetection(
        value,
        request,
        response(request, {
          category: { type: 'choice', choice: 'limited_card', probabilities: { limited_card: 0.99, other: 0.99 } }
        })
      )
    ).toThrow('Invalid detection choice')
  })
  test('閾値設定を検証する', () => {
    expect(
      DetectionThresholdsSchema.safeParse({ eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 }).success
    ).toBe(true)
    expect(
      DetectionThresholdsSchema.safeParse({ eventThreshold: 0.4, fieldThreshold: 0.9, ignoreThreshold: 0.5 }).success
    ).toBe(false)
    expect(
      DetectionThresholdsSchema.safeParse({ eventThreshold: 0.9, fieldThreshold: 1.1, ignoreThreshold: 0.5 }).success
    ).toBe(false)
  })
})

describe('Webhook keyword verdict', () => {
  const retweet = post(undefined, { kind: 'retweet' })
  const cases = [
    ['限定名刺の告知は一致', post(), 'match'],
    ['キーワードが無い投稿は不一致（no_keyword は除外ではない）', post('日常のあいさつです'), 'mismatch'],
    ['店舗アカウントでない投稿は除外', post(undefined, { screenName: 'untrusted' }), 'excluded'],
    ['リツイートは除外', retweet, 'excluded']
  ] as const

  test.each(cases)('%s', (_label, value, expected) => {
    expect(webhookKeywordVerdict(value)).toBe(expected)
  })

  test('filterWebhookPost の結果と同じ規則: reason が無くても no_keyword でもなければ除外、hits があれば一致', () => {
    for (const [, value] of cases) {
      const verdict = filterWebhookPost(value)
      const expected =
        verdict.reason !== undefined && verdict.reason !== 'no_keyword'
          ? 'excluded'
          : verdict.hits.length > 0
            ? 'match'
            : 'mismatch'
      expect(webhookKeywordVerdict(value)).toBe(expected)
    }
  })

  test('一覧の絞り込みに使う3種がすべて実際に出る', () => {
    expect(new Set(cases.map(([, value]) => webhookKeywordVerdict(value)))).toEqual(new Set(WEBHOOK_KEYWORD_VERDICTS))
  })
})
