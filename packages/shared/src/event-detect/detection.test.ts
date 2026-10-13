import { describe, expect, test } from 'bun:test'
import dayjs from 'dayjs'
import type { ClefAnswer, ClefRequest, ClefResponse } from './clef'
import { ClefRequestSchema } from './clef'
import { baseQuestions, dateCandidates, QUESTION_VERSION, STATUS_CRITERIA } from './decide'
import {
  buildDetectionDraft,
  createDetectionRequest,
  DEFAULT_DETECTION_THRESHOLDS,
  DETECTION_VERSION,
  DetectionDraftSchema,
  DetectionThresholdsSchema,
  evaluateDetection,
  FIELD_THRESHOLD_KEYS,
  FieldThresholdsSchema,
  filterWebhookPost,
  resolveFieldThresholds,
  STATUS_DEFAULT_THRESHOLD,
  thresholdOf
} from './detection'
import type { DetectPost } from './post'
import { normalizeWebhookPayload } from './webhook'

const post = (
  text = 'あべのたん限定名刺 2026年11月3日から先着100枚を配布します',
  overrides: Partial<DetectPost> = {}
): DetectPost => ({
  id: '2109221721773576390',
  createdAt: '2026-10-11T01:00:00.000Z',
  screenName: 'bic_abeno',
  kind: 'original',
  text,
  url: 'https://x.com/bic_abeno/status/2109221721773576390',
  media: [],
  ...overrides
})
const response = (request: ClefRequest, overrides: Record<string, ClefAnswer> = {}): ClefResponse => {
  const selected: Record<string, string> = {
    status: 'announce',
    category: 'limited_card',
    store: 'abeno',
    start_date: 'd20261103',
    end_date: 'none',
    condition: 'first_come',
    quantity: 'q100',
    purchase_amount: 'p1000'
  }
  const answers = Object.fromEntries(
    Object.entries(request.questions).map(([key, question]): [string, ClefAnswer] => {
      if (question.type === 'noul') return [key, { type: 'noul', noul: 0.99 }]
      if (question.type !== 'choice') throw new Error('Unexpected test question')
      const choice = selected[key]
      if (!choice || !Object.hasOwn(question.criteria, choice))
        return [key, { type: 'choice', choice: 'none', probabilities: { none: 0.99 } }]
      return [key, { type: 'choice', choice, probabilities: { [choice]: 0.99 }, confidence: 0.01 }]
    })
  )
  return { answers: { ...answers, ...overrides } }
}
const payload = (iso = '2026-10-11T01:00:00.000Z') => {
  const id = (((BigInt(dayjs(iso).valueOf()) - 1_288_834_974_657n) << 22n) + 123n).toString()
  return {
    body: 'あべのたん名刺配布✨',
    tag: `tweet-${id}`,
    timestamp: '1',
    registration_ids: ['synthetic-subscription-not-saved'],
    icon: 'https://example.com/unused.png',
    data: {
      body: 'あべのたん名刺配布✨',
      tag: `tweet-${id}`,
      type: 'tweet',
      uri: `/bic_abeno/status/${id}`,
      ignored: 'not-saved'
    }
  }
}
const now = dayjs('2026-10-11T02:00:00.000Z').valueOf()

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

describe('Detection gate', () => {
  test('初期Clefリクエストは既存schemaを満たす', () => {
    const request = createDetectionRequest(post())
    expect(request.model).toBe('clef')
    expect(ClefRequestSchema.safeParse(request).success).toBe(true)
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
    const request = createDetectionRequest(value)
    const result = evaluateDetection(value, request, response(request))
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate).toEqual({
      category: 'limited_card',
      title: 'あべのたん 限定名刺配布',
      stores: ['abeno'],
      startDate: '2026-11-03',
      conditions: [{ type: 'first_come', quantity: 100 }],
      referenceUrls: [{ type: 'announce', url: value.url }],
      limitedQuantity: 100,
      isPreliminary: false
    })
  })
  test('低いイベントスコアは除外し、中間スコアは保留する', () => {
    const value = post()
    const request = createDetectionRequest(value)
    expect(evaluateDetection(value, request, response(request, { is_event: { type: 'noul', noul: 0.1 } })).status).toBe(
      'ignored'
    )
    expect(
      evaluateDetection(value, request, response(request, { is_event: { type: 'noul', noul: 0.8 } }))
    ).toMatchObject({ status: 'held', reasons: ['event_confidence_below_threshold'] })
  })
  test('confidenceではなく選択肢のprobabilitiesで足切りする', () => {
    const value = post()
    const request = createDetectionRequest(value)
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
    const request = createDetectionRequest(value)
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
  test('必須の開催日や配布条件が欠ける場合は保留する', () => {
    for (const text of ['あべのたん限定名刺を先着100枚配布します', 'あべのたん限定名刺を2026年11月3日から配布します']) {
      const value = post(text)
      const request = createDetectionRequest(value)
      expect(evaluateDetection(value, request, response(request)).status).toBe('held')
    }
  })
  test('終了日・数量の記載がないこと自体は保留理由にしない', () => {
    const value = post('あべのたん限定名刺を2026年11月3日からどなたでも配布します')
    const request = createDetectionRequest(value)
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
    const unknownRequest = createDetectionRequest(unknown)
    expect(evaluateDetection(unknown, unknownRequest, response(unknownRequest, { condition }))).toMatchObject({
      status: 'held',
      reasons: ['purchase_amount_unconfirmed']
    })
    const value = post('あべのたん限定名刺 2026年11月3日から1,000円以上お買い上げの方先着100枚')
    const request = createDetectionRequest(value)
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
    const request = createDetectionRequest(value)
    for (const choice of ['ongoing', 'end'])
      expect(
        evaluateDetection(
          value,
          request,
          response(request, { status: { type: 'choice', choice, probabilities: { [choice]: 0.99 } } })
        )
      ).toMatchObject({ status: 'held', reasons: ['not_new_event_announcement'] })
  })
  test('複数店舗・複数イベントは保留する', () => {
    const value = post('あべのたん・アキバたん 限定名刺 2026年11月3日から先着100枚')
    const request = createDetectionRequest(value)
    expect(evaluateDetection(value, request, response(request)).reasons).toContain('multiple_or_ambiguous_stores')
    const single = post()
    const singleRequest = createDetectionRequest(single)
    expect(
      evaluateDetection(single, singleRequest, response(singleRequest, { single_event: { type: 'noul', noul: 0.3 } }))
        .reasons
    ).toContain('multiple_or_ambiguous_events')
  })
  test('逆転した期間は保留する', () => {
    const value = post('あべのたん限定名刺 2026年11月3日から11月2日まで先着100枚')
    const request = createDetectionRequest(value)
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
    const request = createDetectionRequest(value)
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
    const request = createDetectionRequest(value)
    expect(evaluateDetection(value, request, response(request)).reasons).toContain('unmodeled_distribution_condition')
  })
  test('単なる購入表記も購入額不明なら先着だけで登録しない', () => {
    const value = post('あべのたん限定名刺 2026年11月3日から商品購入で先着100枚配布')
    const request = createDetectionRequest(value)
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
    const request = createDetectionRequest(value)
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

const choice = (selected: string, probabilities: Record<string, number>): ClefAnswer => ({
  type: 'choice',
  choice: selected,
  probabilities
})
const categoryCriteria = (request: ClefRequest) => {
  const question = request.questions.category
  if (question?.type !== 'choice') throw new Error('Missing category question')
  return question.criteria
}
// 新東たんの「アクリルコースタープレゼント」を想定した、しきい値に届かない回答。
const shintouPost = post(
  '【擬人化６周年イベント】10/19(月)から、1,000円以上お買い上げの方にアクリルコースターをプレゼント！数量限定100個',
  { screenName: 'Bic_shintoueki', createdAt: '2026-10-16T01:00:00.000Z' }
)
const shintouPostText =
  '🎃新東たん擬人化６周年イベント🎃\n日付：10月19日（月）～なくなり次第終了\n枚数：限定60枚\n※5,000円以上お買い物でお一人様一枚まで\nアクリルコースタープレゼント🎁'
const shintouOverrides = { screenName: 'Bic_shintoueki', createdAt: '2026-10-16T01:00:00.000Z' }
const shintouAnswers = (request: ClefRequest): Record<string, ClefAnswer> => ({
  ...response(request).answers,
  status: choice('announce', { announce: 0.7499, start: 0.2 }),
  category: choice('acsta', { acsta: 0.45, ackey: 0.43, other: 0.02 }),
  store: choice('none', { none: 0.61, shintou: 0.39 }),
  start_date: choice('d20261019', { d20261019: 0.8, none: 0.1 }),
  end_date: choice('none', { none: 0.95 }),
  condition: choice('purchase', { purchase: 0.7, none: 0.2 }),
  purchase_amount: choice('p1000', { p1000: 0.8, none: 0.1 }),
  quantity: choice('q100', { q100: 0.8, none: 0.1 })
})

describe('Detection version and category criteria', () => {
  test('質問文の変更に合わせて判定の版を上げる', () => {
    expect(DETECTION_VERSION.endsWith('-webhook-v3')).toBe(true)
  })
  test('コースターはotherに入れ、アクキー・アクスタの定義には含めない', () => {
    // アクキー・アクスタに言及する本文では、両方の選択肢が出る。
    const criteria = categoryCriteria(
      createDetectionRequest(post('名刺・アクキー・アクスタではなくアクリルコースターを配布'))
    )
    expect(criteria.other).toContain('アクリルコースター')
    expect(criteria.other).toContain('アクリルプレート')
    for (const key of ['ackey', 'acsta']) {
      const text = criteria[key]
      if (text === undefined) throw new Error('Missing category criteria')
      // 含める範囲の説明（最初の一文）にコースターは出ず、除外の文脈でのみ登場する。
      expect(text.split('。')[0]).not.toContain('コースター')
      expect(text).toMatch(/コースター.*含まない/)
    }
    expect(criteria.limited_card).toBe('期間限定・数量限定・記念の名刺')
    expect(criteria.regular_card).toBe('通年配布の通常名刺')
    expect(criteria.none).toBe('配布物の話ではない')
  })
})

describe('Webhook is_event question', () => {
  const instructionsOf = (questions: ClefRequest['questions'], key: string) => {
    const question = questions[key]
    if (question?.type !== 'noul') throw new Error(`Missing noul question ${key}`)
    return question.instructions
  }
  test('Webhook判定の is_event は「ビッカメ娘のイベントか」を尋ね、配布に限定しない', () => {
    const request = createDetectionRequest(post())
    const instructions = instructionsOf(request.questions, 'is_event')
    expect(request.questions.is_event?.type).toBe('noul')
    expect(instructions).toContain('ビッカメ娘')
    expect(instructions).toContain('擬人化記念イベント')
    expect(instructions).toContain('コラボ')
    expect(instructions).toContain('フェア')
    expect(instructions).toContain('日時を決めて行う催し')
    // 配布物の種類は category が担当するため、is_event は「配布する」ことを条件にしない。
    expect(instructions).not.toContain('配布する')
    expect(instructions).not.toContain('ノベルティを配布')
    // 除外の説明（商品紹介・宣伝・無関係なキャンペーン）は残す。
    expect(instructions).toContain('家電の宣伝')
    expect(instructions).toContain('メーカーのキャンペーン')
    expect(ClefRequestSchema.safeParse(request).success).toBe(true)
  })
  test('ローカルCLI側の baseQuestions と質問の版は変えていない', () => {
    // CLI の評価とキャッシュキーが変わらないことの確認。Webhook の上書きは createDetectionRequest だけで行う。
    const base = baseQuestions()
    expect(base.is_event).toEqual({
      type: 'noul',
      instructions:
        'この投稿は、ビッカメ娘（ビックカメラの店舗擬人化キャラクター）の名刺・アクリルキーホルダー・アクリルスタンド・缶バッジなどのノベルティを配布するイベントについての投稿ですか？ ビッカメ娘と関係ない商品の購入特典やメーカーのキャンペーンは含みません。'
    })
    expect(instructionsOf(base, 'is_event')).toContain('配布するイベント')
    expect(QUESTION_VERSION).toBe('v2')
    const webhook = createDetectionRequest(post())
    expect(instructionsOf(webhook.questions, 'is_event')).not.toBe(instructionsOf(base, 'is_event'))
    // 状態の質問文は Webhook だけが上書きする。CLI 共用の baseQuestions は従来のまま。
    expect(base.status).toEqual({
      type: 'choice',
      instructions: 'この投稿が伝えている配布イベントの状態はどれですか？',
      criteria: { ...STATUS_CRITERIA }
    })
    expect(webhook.questions.status).not.toEqual(base.status)
  })
})

describe('Store resolution from the posting account', () => {
  test('アカウントから店舗が決まる投稿は store を質問せず、回答が無くても店舗を補って登録候補にする', () => {
    const value = post()
    const request = createDetectionRequest(value)
    expect(Object.hasOwn(request.questions, 'store')).toBe(false)
    const result = evaluateDetection(value, request, response(request))
    expect(result).toMatchObject({
      status: 'register',
      reasons: ['store_inferred_from_account'],
      candidate: { stores: ['abeno'], title: 'あべのたん 限定名刺配布' }
    })
  })
  test('旧版が保存した store 回答（none・しきい値未満）が混ざっていても、アカウントの店舗なら store_unconfirmed を付けない', () => {
    const value = post()
    const request = createDetectionRequest(value)
    for (const store of [choice('none', { none: 0.61, abeno: 0.39 }), choice('none', { none: 0.99 })]) {
      const result = evaluateDetection(value, request, response(request, { store }))
      expect(result.reasons).not.toContain('store_unconfirmed')
      expect(result.status).toBe('register')
      // 店舗を投稿アカウントから補った登録候補には、情報用の理由だけを付ける。
      expect(result.reasons).toEqual(['store_inferred_from_account'])
    }
  })
  test('登録まで進む高スコアの回答で store が none でも、アカウントの店舗が登録候補に入る', () => {
    const value = post()
    const request = createDetectionRequest(value)
    const result = evaluateDetection(
      value,
      request,
      response(request, { store: choice('none', { none: 0.61, abeno: 0.39 }) })
    )
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate.stores).toEqual(['abeno'])
    expect(result.candidate.title).toBe('あべのたん 限定名刺配布')
    expect(result.reasons).toEqual(['store_inferred_from_account'])
  })
  test('旧版が保存した store 回答がしきい値以上で既知の店舗なら従来どおりそれを使い、補完の理由は足さない', () => {
    const value = post()
    const request = createDetectionRequest(value)
    const result = evaluateDetection(
      value,
      request,
      response(request, { store: choice('abeno', { abeno: 0.99, none: 0.01 }) })
    )
    expect(result).toMatchObject({ status: 'register', reasons: [], candidate: { stores: ['abeno'] } })
    // しきい値ちょうども確定として扱い、補完にしない。
    const exact = evaluateDetection(
      value,
      request,
      response(request, { store: choice('abeno', { abeno: 0.9, none: 0.1 }) })
    )
    expect(exact).toMatchObject({ status: 'register', reasons: [] })
    // しきい値未満の既知店舗は確定とみなさず、アカウントの店舗で補完する。
    const below = evaluateDetection(
      value,
      request,
      response(request, { store: choice('abeno', { abeno: 0.5, none: 0.4 }) })
    )
    expect(below).toMatchObject({ status: 'register', reasons: ['store_inferred_from_account'] })
  })
  test('補完した店舗で保留になった場合は、情報用の理由を足さず他の理由だけを残す', () => {
    const value = post()
    const request = createDetectionRequest(value)
    const result = evaluateDetection(
      value,
      request,
      response(request, {
        store: choice('none', { none: 0.99 }),
        category: choice('none', { none: 0.99 })
      })
    )
    expect(result).toMatchObject({ status: 'held', reasons: ['category_unconfirmed'] })
  })
  test('本文に別の店舗名がある投稿は、storeがnoneならこれまでどおり保留にする', () => {
    const value = post('あべのたん・アキバたん 限定名刺 2026年11月3日から先着100枚')
    const request = createDetectionRequest(value)
    const result = evaluateDetection(
      value,
      request,
      response(request, { store: choice('none', { none: 0.61, abeno: 0.2, akiba: 0.19 }) })
    )
    expect(result.status).toBe('held')
    expect(result.reasons).toContain('store_unconfirmed')
    expect(result.reasons).toContain('multiple_or_ambiguous_stores')
  })
  test('別の店舗名が本文にあれば、店舗が選ばれていても候補が複数のため保留のまま', () => {
    const value = post('あべのたん・アキバたん 限定名刺 2026年11月3日から先着100枚')
    const request = createDetectionRequest(value)
    const result = evaluateDetection(value, request, response(request))
    expect(result.status).toBe('held')
    expect(result.reasons).toEqual(['multiple_or_ambiguous_stores'])
  })
  test('アカウントに対応する店舗が無い投稿は店舗を補わない（判定は対象外、下書きの店舗も空）', () => {
    const value = post(undefined, { screenName: 'untrusted' })
    const request = createDetectionRequest(value)
    // 店舗アカウント以外は構造フィルタで対象外になり、store の回答まで進まない。
    expect(evaluateDetection(value, request, response(request, { store: choice('none', { none: 0.99 }) }))).toEqual({
      status: 'ignored',
      confidence: 0,
      reasons: ['non_store_account']
    })
    expect(buildDetectionDraft(value, { store: choice('none', { none: 0.99 }) }).stores).toEqual([])
    // 本文だけで店舗名が1件見つかっても、アカウント由来でなければ採用しない。
    const mention = post('あべのたん限定名刺 2026年11月3日から', { screenName: 'untrusted' })
    expect(buildDetectionDraft(mention, { store: choice('none', { none: 0.99 }) })).toMatchObject({ stores: [] })
    expect(buildDetectionDraft(mention, { store: choice('none', { none: 0.99 }) }).title).toBeUndefined()
  })
})

describe('Store fallback safety against other store mentions', () => {
  const core = '限定名刺を2026年11月3日から先着100枚配布します'
  // store は店舗を補えない投稿（他店の言及あり）でだけ質問される。補える投稿では余分な回答として無視される。
  const decide = (text: string, screenName = 'bic_abeno', overrides: Record<string, ClefAnswer> = {}) => {
    const value = post(text, { screenName })
    const request = createDetectionRequest(value)
    return evaluateDetection(value, request, response(request, { store: choice('none', { none: 0.99 }), ...overrides }))
  }
  test('本文に他の実店舗名がある投稿は、store が none 0.99 でもアカウントの店舗にせず保留にする', () => {
    const result = decide(`ビックカメラ秋葉原店で${core}`)
    expect(result.status).toBe('held')
    expect(result.reasons).toContain('store_unconfirmed')
    expect(result.reasons).not.toContain('store_inferred_from_account')
  })
  test('キャラ名があっても、他の実店舗名が本文にあれば保留のまま', () => {
    const result = decide(`【あべのたん】${core}。ビックカメラ秋葉原店でも同時開催`)
    expect(result.status).toBe('held')
    expect(result.reasons).toEqual(['store_unconfirmed'])
  })
  test.each([
    'ビックカメラ秋葉原店でも同時開催',
    '秋葉原店と新宿西口店でも同時開催',
    '新宿西口店の店頭でも配布',
    '1号店でも配布'
  ])('自店の言及があっても他の実店舗（%s）が残れば保留にする', (extra) => {
    const result = decide(`ビックカメラ新宿東口駅前店で${core}。${extra}`, 'Bic_shintoueki')
    expect(result.status).toBe('held')
    expect(result.reasons).toContain('store_unconfirmed')
  })
  test.each([
    '新宿東口駅前店',
    'ビックカメラ新宿東口駅前店',
    'ビックカメラ 新宿東口駅前店 店頭',
    '本日、ビックカメラ新宿東口駅前店の店頭'
  ])('自店の実店舗名「%s」が本文にあっても補完が効いて登録候補になり、理由に補完を残す', (name) => {
    const result = decide(`${name}で${core}`, 'Bic_shintoueki')
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate.stores).toEqual(['shintou'])
    expect(result.candidate.title).toBe('新東たん 限定名刺配布')
    expect(result.reasons).toEqual(['store_inferred_from_account'])
  })
  test.each([
    ['当店', `当店で${core}`],
    ['店頭', `店頭で${core}`],
    ['店舗', `店舗により異なります。${core}`],
    ['全店舗', `全店舗で${core}`],
    ['各店', `各店で${core}`],
    ['店内', `店内で${core}`],
    ['来店', `ご来店の方に${core}`],
    ['お店', `お店で${core}`],
    ['実店舗', `実店舗で${core}`],
    ['店頭の前に助詞', `全国の店頭で${core}`],
    ['ブランド名+店頭', `ビックカメラ店頭で${core}`],
    ['店舗と店頭', `全店の店頭・店舗で${core}`]
  ])('一般語（%s）が本文にあるだけでは補完を妨げない', (_label, text) => {
    const result = decide(text)
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate.stores).toEqual(['abeno'])
    expect(result.reasons).toEqual(['store_inferred_from_account'])
  })
  test('引用元の本文にある他の実店舗名も言及として扱う', () => {
    const value = post(core, {
      screenName: 'bic_abeno',
      quoted: { id: '1', screenName: 'someone', text: 'ビックカメラ秋葉原店でも開催' }
    })
    const request = createDetectionRequest(value)
    const result = evaluateDetection(value, request, response(request, { store: choice('none', { none: 0.99 }) }))
    expect(result.status).toBe('held')
    expect(result.reasons).toContain('store_unconfirmed')
  })
  test('新東たんの実投稿（他店の言及なし）は store を質問せず、アカウントの店舗で登録候補になる', () => {
    const value = post(
      '🎃新東たん擬人化６周年イベント🎃\n10/19(月)から、5,000円以上お買い物でアクリルコースタープレゼント！\n※数量限定60個 ※お一人様一枚まで',
      { screenName: 'Bic_shintoueki', createdAt: '2026-10-16T01:00:00.000Z' }
    )
    const request = createDetectionRequest(value)
    const result = evaluateDetection(
      value,
      request,
      response(request, {
        category: choice('other', { other: 0.99 }),
        start_date: choice('d20261019', { d20261019: 0.99 }),
        condition: choice('purchase', { purchase: 0.99 }),
        purchase_amount: choice('p5000', { p5000: 0.99 }),
        quantity: choice('q60', { q60: 0.99 })
      })
    )
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate.stores).toEqual(['shintou'])
    expect(result.candidate.title).toBe('新東たん ノベルティ配布')
    expect(result.candidate.conditions).toEqual([{ type: 'purchase', purchaseAmount: 5000 }])
    expect(result.reasons).toEqual(['store_inferred_from_account'])
  })
  test('下書きの店舗も同じ安全化を受け、他の実店舗名があるときは補完しない', () => {
    const none = { store: choice('none', { none: 0.99 }) }
    expect(buildDetectionDraft(post(`ビックカメラ秋葉原店で${core}`), none).stores).toEqual([])
    expect(buildDetectionDraft(post(`ビックカメラ秋葉原店で${core}`), none).title).toBeUndefined()
    expect(buildDetectionDraft(post(`当店で${core}`), none)).toMatchObject({
      stores: ['abeno'],
      title: 'あべのたん 配布'
    })
    expect(
      buildDetectionDraft(post(`ビックカメラ新宿東口駅前店で${core}`, { screenName: 'Bic_shintoueki' }), none).stores
    ).toEqual(['shintou'])
    // AIが既知の店舗を選んでいれば、本文の言及に関わらずその回答を使う（従来どおり）。
    expect(
      buildDetectionDraft(post(`ビックカメラ秋葉原店で${core}`), { store: choice('abeno', { abeno: 0.6 }) }).stores
    ).toEqual(['abeno'])
  })
  test('下書きは終了日が開始日より前なら終了日だけを落とし、開始日は残す', () => {
    const base = { start_date: choice('d20261103', { d20261103: 0.9 }) }
    const reversed = buildDetectionDraft(post(), { ...base, end_date: choice('d20261101', { d20261101: 0.9 }) })
    expect(reversed.startDate).toBe('2026-11-03')
    expect(reversed.endDate).toBeUndefined()
    expect(DetectionDraftSchema.safeParse(reversed).success).toBe(true)
    // 同日・開始日より後は残す。
    expect(buildDetectionDraft(post(), { ...base, end_date: choice('d20261103', { d20261103: 0.9 }) }).endDate).toBe(
      '2026-11-03'
    )
    expect(buildDetectionDraft(post(), { ...base, end_date: choice('d20261110', { d20261110: 0.9 }) }).endDate).toBe(
      '2026-11-10'
    )
    // 開始日が取れないときは比較せず、終了日をそのまま残す。
    expect(buildDetectionDraft(post(), { end_date: choice('d20261101', { d20261101: 0.9 }) })).toMatchObject({
      endDate: '2026-11-01'
    })
  })
})

describe('Purchase amount candidates', () => {
  test('「以上お買い物で」の購入額も質問の選択肢にする', () => {
    const request = createDetectionRequest(post('※5,000円以上お買い物でお一人様一枚まで'))
    const question = request.questions.purchase_amount
    if (question?.type !== 'choice') throw new Error('Missing purchase_amount question')
    expect(Object.keys(question.criteria)).toEqual(['p5000', 'none'])
    expect(question.criteria.p5000).toBe('5000円')
  })
  test.each([
    ['1,000円以上のお買い物で', 'p1000'],
    ['3000円お買物でプレゼント', 'p3000'],
    ['2000円以上買い物された方に', 'p2000'],
    ['1500円(税込)以上買物で', 'p1500'],
    ['500円以上ご購入の方', 'p500']
  ])('購入表現「%s」から%sを拾う', (text, key) => {
    const question = createDetectionRequest(post(text)).questions.purchase_amount
    if (question?.type !== 'choice') throw new Error('Missing purchase_amount question')
    expect(Object.hasOwn(question.criteria, key)).toBe(true)
  })
  test('購入表現を伴わない金額は選択肢にしない', () => {
    const { questions } = createDetectionRequest(post('あべのたん限定名刺 1,000円のアクスタを販売'))
    expect(Object.hasOwn(questions, 'purchase_amount')).toBe(false)
  })
})

describe('Detection draft', () => {
  test('カテゴリが僅差（0.45 / 0.43）の時はカテゴリを採用せず、タイトルを「店舗名 配布」にする', () => {
    // アクスタ・アクキーに言及する本文では category の選択肢が3つ残り、確率が割れうる。
    const split = { ...shintouPost, text: `${shintouPost.text}（アクスタ・アクキーではありません）` }
    const request = createDetectionRequest(split)
    const answers = shintouAnswers(request)
    const draft = buildDetectionDraft(split, answers)
    expect(draft).toEqual({
      title: '新東たん 配布',
      stores: ['shintou'],
      startDate: '2026-10-19',
      conditions: [{ type: 'purchase', purchaseAmount: 1000 }],
      limitedQuantity: 100
    })
    expect(draft.category).toBeUndefined()
    expect(DetectionDraftSchema.safeParse(draft).success).toBe(true)
    // 同じ回答は登録候補にならず保留のまま。下書きは判定結果を変えない。
    expect(evaluateDetection(split, request, { answers })).toMatchObject({ status: 'held' })
  })
  test('カテゴリは最有力候補の確率が0.5以上の時だけ採用し、タイトルにカテゴリ名を含める', () => {
    const answers = shintouAnswers(createDetectionRequest(shintouPost))
    const draftOf = (probabilities: Record<string, number>, selected = 'other') =>
      buildDetectionDraft(shintouPost, { ...answers, category: choice(selected, probabilities) })
    expect(draftOf({ other: 0.62, acsta: 0.2 })).toMatchObject({ category: 'other', title: '新東たん ノベルティ配布' })
    expect(draftOf({ acsta: 0.5, ackey: 0.3 }, 'acsta')).toMatchObject({
      category: 'acsta',
      title: '新東たん アクリルスタンド配布'
    })
    const justBelow = draftOf({ acsta: 0.4999, ackey: 0.3 }, 'acsta')
    expect(justBelow.category).toBeUndefined()
    expect(justBelow.title).toBe('新東たん 配布')
  })
  test('回答の店舗が既知ならそれを優先し、none・不明なら投稿から1件に絞れた時だけ使う', () => {
    const request = createDetectionRequest(shintouPost)
    const answers = shintouAnswers(request)
    expect(buildDetectionDraft(shintouPost, { ...answers, store: choice('shintou', { shintou: 0.5 }) }).stores).toEqual(
      ['shintou']
    )
    expect(
      buildDetectionDraft(shintouPost, { ...answers, store: choice('invented', { invented: 0.5 }) }).stores
    ).toEqual(['shintou'])
    const multiple = post('あべのたん・アキバたん 限定名刺 2026年11月3日から先着100枚')
    const draft = buildDetectionDraft(multiple, { category: choice('limited_card', { limited_card: 0.6 }) })
    expect(draft.stores).toEqual([])
    expect(draft.title).toBeUndefined()
    expect(draft.category).toBe('limited_card')
  })
  test('カテゴリがnoneの時はカテゴリを作らず、タイトルは「店舗名 配布」になる', () => {
    const request = createDetectionRequest(shintouPost)
    const draft = buildDetectionDraft(shintouPost, {
      ...shintouAnswers(request),
      category: choice('none', { none: 0.6 })
    })
    expect(draft.category).toBeUndefined()
    expect(draft.title).toBe('新東たん 配布')
    expect(draft.stores).toEqual(['shintou'])
  })
  test('回答が空・欠落・型違いでも投げず、取れない項目は空にする', () => {
    const empty = buildDetectionDraft(post(), {})
    expect(empty).toEqual({ title: 'あべのたん 配布', stores: ['abeno'], conditions: [] })
    expect(DetectionDraftSchema.safeParse(empty).success).toBe(true)
    const wrongTypes = buildDetectionDraft(post(), {
      category: { type: 'noul', noul: 0.9 },
      store: { type: 'score', score: 1 },
      start_date: choice('none', { none: 1 }),
      end_date: choice('', { '': 1 }),
      condition: { type: 'noul', noul: 0.5 },
      quantity: choice('invented', { invented: 1 })
    })
    expect(wrongTypes).toEqual({ title: 'あべのたん 配布', stores: ['abeno'], conditions: [] })
  })
  test('存在しない日付・0や過大な数量・不正な金額キーは下書きに入れない', () => {
    const draft = buildDetectionDraft(shintouPost, {
      ...shintouAnswers(createDetectionRequest(shintouPost)),
      start_date: choice('d20261399', { d20261399: 0.9 }),
      end_date: choice('d20260230', { d20260230: 0.9 }),
      purchase_amount: choice('p99999999999999999999', { p99999999999999999999: 0.9 }),
      quantity: choice('q0', { q0: 0.9 })
    })
    expect(draft.startDate).toBeUndefined()
    expect(draft.endDate).toBeUndefined()
    expect(draft.limitedQuantity).toBeUndefined()
    expect(draft.conditions).toEqual([])
    expect(DetectionDraftSchema.safeParse(draft).success).toBe(true)
  })
  test('配布条件ごとに先着・抽選へ数量を付け、全員配布は金額も数量も持たない', () => {
    const base = shintouAnswers(createDetectionRequest(shintouPost))
    const conditionsOf = (selected: string) =>
      buildDetectionDraft(shintouPost, { ...base, condition: choice(selected, { [selected]: 0.5 }) }).conditions
    expect(conditionsOf('purchase_first_come')).toEqual([
      { type: 'purchase', purchaseAmount: 1000 },
      { type: 'first_come', quantity: 100 }
    ])
    expect(conditionsOf('purchase_lottery')).toEqual([
      { type: 'purchase', purchaseAmount: 1000 },
      { type: 'lottery', quantity: 100 }
    ])
    expect(conditionsOf('first_come')).toEqual([{ type: 'first_come', quantity: 100 }])
    expect(conditionsOf('lottery')).toEqual([{ type: 'lottery', quantity: 100 }])
    expect(conditionsOf('everyone')).toEqual([{ type: 'everyone' }])
    expect(conditionsOf('none')).toEqual([])
  })
})

const choiceQuestionOf = (request: ClefRequest, key: string) => {
  const question = request.questions[key]
  if (question?.type !== 'choice') throw new Error(`Missing choice question ${key}`)
  return question
}

describe('Webhook question wording', () => {
  const shintouText =
    '🎃新東たん擬人化６周年イベント🎃\n日付：10月19日（月）～なくなり次第終了\n枚数：限定60枚\n※5,000円以上お買い物でお一人様一枚まで\nアクリルコースタープレゼント🎁'
  const request = createDetectionRequest(
    post(shintouText, { screenName: 'Bic_shintoueki', createdAt: '2026-10-16T01:00:00.000Z' })
  )

  test('is_event は「投稿者」行の店舗を投稿者本人の店舗とみなし、除外条項と店舗以外の扱いを残す', () => {
    const question = request.questions.is_event
    if (question?.type !== 'noul') throw new Error('Missing is_event question')
    expect(question.instructions).toContain('「投稿者」の行')
    expect(question.instructions).toContain('本人のアカウント')
    expect(question.instructions).toContain('「ビッカメ娘」の言及が無くても')
    expect(question.instructions).toContain('「店舗以外」のときはこの扱いをしません')
    // 既存の除外条項は残す。
    expect(question.instructions).toContain('通常の商品紹介・家電の宣伝・雑談')
    expect(question.instructions).toContain('ビッカメ娘と関係ない商品の購入特典・メーカーのキャンペーン')
  })

  test('store は本文の記載を優先し、無ければ投稿者の店舗を選ばせる。none は投稿者の店舗にならない場合に限る', () => {
    // 本文に別の店舗のキャラ名があり、アカウントだけでは店舗が決まらない投稿では store を質問する。
    const question = choiceQuestionOf(
      createDetectionRequest(
        post('新東たん擬人化６周年イベント。あべのたんでも10月19日（月）から限定名刺', {
          screenName: 'Bic_shintoueki',
          createdAt: '2026-10-16T01:00:00.000Z'
        })
      ),
      'store'
    )
    expect(question.instructions).toContain('本文に店舗の記載があればその店舗')
    expect(question.instructions).toContain('記載が無ければ投稿者の店舗')
    expect(question.criteria.none).toContain('複数の店舗')
    expect(question.criteria.none).toContain('投稿者が店舗以外')
    expect(question.criteria.none).not.toBe('どの店舗でもない・わからない')
    expect(question.criteria.shintou).toBe('新東たん')
  })

  test('end_date は start_date と別に組み立て、「なくなり次第終了」を終了日の記載なしとして扱わせる', () => {
    const end = choiceQuestionOf(request, 'end_date')
    expect(end.instructions).toContain('なくなり次第終了')
    expect(end.instructions).toContain('無くなり次第終了')
    expect(end.instructions).toContain('終了日の記載なし')
    expect(end.instructions).toContain('開始日を終了日として選ばないでください')
    expect(end.criteria.none).toBe('終了日の記載なし（『なくなり次第終了』など日付で終わりが決まらない場合を含む）')
    // 日付の選択肢は start_date と同じ。none の説明だけが違う。
    const start = choiceQuestionOf(request, 'start_date')
    const { none: endNone, ...endDates } = end.criteria
    const { none: startNone, ...startDates } = start.criteria
    expect(endDates).toEqual(startDates)
    expect(Object.keys(endDates)).toEqual(['d20261019'])
    expect(endNone).not.toBe(startNone)
  })

  test('start_date の質問文と none の説明は従来のまま', () => {
    const start = choiceQuestionOf(request, 'start_date')
    expect(start.instructions).toBe('配布の開始日はどれですか？')
    expect(start.criteria.none).toBe('本文に書かれていない')
    expect(ClefRequestSchema.safeParse(request).success).toBe(true)
  })
})

describe('End date none confirmation', () => {
  // 新東たんの実投稿に近い入力。本文に店舗名・「ビッカメ娘」は無く、終了日は「なくなり次第終了」。
  const value = post(
    '🎃新東たん擬人化６周年イベント🎃\n日付：10月19日（月）～なくなり次第終了\n枚数：限定60枚\n※5,000円以上お買い物でお一人様一枚まで\nアクリルコースタープレゼント🎁',
    { screenName: 'Bic_shintoueki', createdAt: '2026-10-16T01:00:00.000Z' }
  )
  const request = createDetectionRequest(value)
  const answersOf = (endDate: ClefAnswer) =>
    response(request, {
      is_event: { type: 'noul', noul: 0.95 },
      category: choice('other', { other: 0.99 }),
      start_date: choice('d20261019', { d20261019: 0.99 }),
      end_date: endDate,
      condition: choice('purchase', { purchase: 0.99 }),
      purchase_amount: choice('p5000', { p5000: 0.99 }),
      quantity: choice('q60', { q60: 0.99 })
    })

  test('最有力が none（0.7348）ならしきい値未満でも終了日なしで確定し、end_date_unconfirmed を付けずに登録する', () => {
    const result = evaluateDetection(value, request, answersOf(choice('none', { none: 0.7348, d20261019: 0.2652 })))
    expect(result.status).toBe('register')
    expect(result.reasons).not.toContain('end_date_unconfirmed')
    expect(result.reasons).toEqual(['store_inferred_from_account'])
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate).not.toHaveProperty('endDate')
    expect(result.candidate.limitedQuantity).toBe(60)
  })

  test('none が過半数に届かなくても、最有力ならしきい値未満で確定する', () => {
    const result = evaluateDetection(value, request, answersOf(choice('none', { none: 0.4, d20261019: 0.35 })))
    expect(result.status).toBe('register')
    expect(result.reasons).not.toContain('end_date_unconfirmed')
  })

  test('最有力が日付で確率がしきい値未満（0.6）なら従来どおり end_date_unconfirmed で保留する', () => {
    const result = evaluateDetection(value, request, answersOf(choice('d20261019', { d20261019: 0.6, none: 0.3 })))
    expect(result).toMatchObject({ status: 'held', reasons: ['end_date_unconfirmed'] })
  })

  test('最有力が日付でしきい値以上（0.95）なら終了日が入る', () => {
    const result = evaluateDetection(value, request, answersOf(choice('d20261019', { d20261019: 0.95, none: 0.04 })))
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate.endDate).toBe('2026-10-19')
  })

  test('下書きは最有力が none なら終了日を入れず、判定とは独立に動く', () => {
    const answers = answersOf(choice('none', { none: 0.7348, d20261019: 0.2652 })).answers
    const draft = buildDetectionDraft(value, answers)
    expect(draft.endDate).toBeUndefined()
    expect(draft.startDate).toBe('2026-10-19')
    expect(DetectionDraftSchema.safeParse(draft).success).toBe(true)
  })
})

describe('Store question is omitted when the account decides the store', () => {
  const shintou = post(shintouPostText, shintouOverrides)
  const askedKeys = (value: DetectPost) => Object.keys(createDetectionRequest(value).questions)

  test('新東たんの投稿は store を質問せず、他の質問は従来どおり出す', () => {
    const request = createDetectionRequest(shintou)
    expect(Object.hasOwn(request.questions, 'store')).toBe(false)
    for (const key of [
      'is_event',
      'status',
      'category',
      'single_event',
      'start_date',
      'end_date',
      'quantity',
      'condition',
      'purchase_amount'
    ])
      expect(Object.hasOwn(request.questions, key), key).toBe(true)
    // store を除いても、他の質問の並びは変えない。
    expect(askedKeys(shintou)).toEqual([
      'is_event',
      'status',
      'category',
      'single_event',
      'start_date',
      'end_date',
      'quantity',
      'condition',
      'purchase_amount'
    ])
    expect(ClefRequestSchema.safeParse(request).success).toBe(true)
  })

  test('store 無しの応答でも、アカウントの店舗で登録候補になり、理由は補完だけ', () => {
    const request = createDetectionRequest(shintou)
    const result = evaluateDetection(
      shintou,
      request,
      response(request, {
        is_event: { type: 'noul', noul: 0.95 },
        category: choice('other', { other: 0.99 }),
        start_date: choice('d20261019', { d20261019: 0.99 }),
        end_date: choice('none', { none: 0.7348, d20261019: 0.2652 }),
        condition: choice('purchase', { purchase: 0.99 }),
        purchase_amount: choice('p5000', { p5000: 0.99 }),
        quantity: choice('q60', { q60: 0.99 })
      })
    )
    expect(result.status).toBe('register')
    expect(result.reasons).toEqual(['store_inferred_from_account'])
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate.stores).toEqual(['shintou'])
    expect(result.candidate.title).toBe('新東たん ノベルティ配布')
  })

  test('store 無しの回答でも、判定済みの下書きは同じ店舗で作れる', () => {
    const request = createDetectionRequest(shintou)
    const answers = {
      ...response(request).answers,
      category: choice('other', { other: 0.62, acsta: 0.2 })
    }
    expect(Object.hasOwn(answers, 'store')).toBe(false)
    expect(buildDetectionDraft(shintou, answers)).toMatchObject({
      stores: ['shintou'],
      title: '新東たん ノベルティ配布'
    })
  })

  test('リクエストに無い store の回答は無視する（旧版が保存した回答が混ざっても投げない）', () => {
    const request = createDetectionRequest(shintou)
    const stale = response(request, { store: choice('none', { none: 0.5998, shintou: 0.4002 }) })
    expect(() => evaluateDetection(shintou, request, stale)).not.toThrow()
  })

  test.each([
    [
      '店舗以外のアカウントが店舗名を書いた投稿',
      post('あべのたん限定名刺 2026年11月3日から', { screenName: 'untrusted' })
    ],
    ['本文に他店舗のキャラ名がある店舗アカウントの投稿', post('あべのたん・アキバたん 限定名刺 2026年11月3日から')],
    [
      '本文に他の実店舗名がある店舗アカウントの投稿',
      post('ビックカメラ秋葉原店でも同時開催 限定名刺 2026年11月3日から')
    ],
    [
      '引用元に他の実店舗名がある店舗アカウントの投稿',
      post('限定名刺 2026年11月3日から', {
        quoted: { id: '1', screenName: 'someone', text: 'ビックカメラ秋葉原店でも開催' }
      })
    ],
    [
      '別の店舗のキャラ名が本文にある店舗アカウントの投稿',
      post('あべのたんでも同時開催 限定名刺 2026年11月3日から', { screenName: 'Bic_shintoueki' })
    ]
  ])('%sは従来どおり store を質問する', (_label, value) => {
    const request = createDetectionRequest(value)
    expect(request.questions.store?.type).toBe('choice')
    expect(askedKeys(value)).toContain('store')
  })

  test('store を質問する投稿で回答が欠けていれば、従来どおり不完全な応答として投げる', () => {
    const value = post('あべのたん・アキバたん 限定名刺 2026年11月3日から先着100枚')
    const request = createDetectionRequest(value)
    const { store: _store, ...withoutStore } = response(request).answers
    expect(() => evaluateDetection(value, request, { answers: withoutStore })).toThrow('Incomplete detection response')
  })
})

describe('Category criteria are narrowed to kinds with evidence in the text', () => {
  // 新東たんの投稿は本文に名刺・アクキー・アクスタのどの語も無く「アクリルコースター」だけが書かれている。
  const keysOf = (text: string, overrides: Partial<DetectPost> = {}) =>
    Object.keys(categoryCriteria(createDetectionRequest(post(text, overrides))))

  test('新東たん近似の投稿は other と none だけが残る', () => {
    expect(keysOf(shintouPostText, shintouOverrides)).toEqual(['other', 'none'])
  })
  test('「名刺」があれば限定名刺と通常名刺が残る', () => {
    expect(keysOf('新東たん限定名刺を配布')).toEqual(['limited_card', 'regular_card', 'other', 'none'])
  })
  test.each([
    ['アクキー', ['ackey']],
    ['アクリルキーホルダー', ['ackey']],
    ['キーホルダー', ['ackey']],
    ['アクスタ', ['acsta']],
    ['アクリルスタンド', ['acsta']],
    ['スタンド', ['acsta']]
  ])('「%s」があれば対応する種類が残る', (word, kept) => {
    expect(keysOf(`${word}をプレゼント`)).toEqual([...kept, 'other', 'none'])
  })
  test('複数の語があれば複数残り、キーの並びは元の定義のまま', () => {
    expect(keysOf('アクスタとアクキーと名刺を配布')).toEqual([
      'limited_card',
      'regular_card',
      'ackey',
      'acsta',
      'other',
      'none'
    ])
  })
  test('引用元の本文にある語も拾う', () => {
    expect(keysOf('こちらを配布', { quoted: { id: '1', screenName: 'someone', text: '限定アクスタ' } })).toEqual([
      'acsta',
      'other',
      'none'
    ])
    // 引用元だけでなく本文の語も従来どおり拾う。
    expect(keysOf('名刺を配布', { quoted: { id: '1', screenName: 'someone', text: '限定アクスタ' } })).toEqual([
      'limited_card',
      'regular_card',
      'acsta',
      'other',
      'none'
    ])
  })
  test('全角・半角の表記ゆれは正規化してから探す（ｱｸｽﾀ）', () => {
    expect(keysOf('ｱｸｽﾀを配布')).toEqual(['acsta', 'other', 'none'])
  })
  test('各選択肢の説明文は絞り込みで変えない', () => {
    const criteria = categoryCriteria(createDetectionRequest(post('名刺・アクキー・アクスタを配布')))
    expect(criteria.limited_card).toBe('期間限定・数量限定・記念の名刺')
    expect(criteria.regular_card).toBe('通年配布の通常名刺')
    expect(criteria.none).toBe('配布物の話ではない')
  })
  test('category の質問文と他の質問は変えない', () => {
    const request = createDetectionRequest(shintouPost)
    const question = request.questions.category
    if (question?.type !== 'choice') throw new Error('Missing category question')
    expect(question.instructions).toBe('この投稿で配布されるものは主にどれですか？')
    expect(choiceQuestionOf(request, 'status').criteria).toEqual({ ...STATUS_CRITERIA })
    expect(ClefRequestSchema.safeParse(request).success).toBe(true)
  })

  test('絞り込んだ category に other が高確率で返れば、category_unconfirmed なしで other の登録候補になる', () => {
    const value = post(shintouPostText, shintouOverrides)
    const request = createDetectionRequest(value)
    const result = evaluateDetection(
      value,
      request,
      response(request, {
        is_event: { type: 'noul', noul: 0.95 },
        category: choice('other', { other: 0.95, none: 0.03 }),
        start_date: choice('d20261019', { d20261019: 0.99 }),
        end_date: choice('none', { none: 0.7348, d20261019: 0.2652 }),
        condition: choice('purchase', { purchase: 0.99 }),
        purchase_amount: choice('p5000', { p5000: 0.99 }),
        quantity: choice('q60', { q60: 0.99 })
      })
    )
    expect(result.reasons).not.toContain('category_unconfirmed')
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected candidate')
    expect(result.candidate.category).toBe('other')
    expect(result.candidate.title).toBe('新東たん ノベルティ配布')
  })
  test('リクエストに無い種類（本文に根拠語が無い acsta）を答えた応答は、不正な選択として投げる', () => {
    const value = post(shintouPostText, shintouOverrides)
    const request = createDetectionRequest(value)
    expect(() =>
      evaluateDetection(value, request, response(request, { category: choice('acsta', { acsta: 0.95, other: 0.03 }) }))
    ).toThrow('Invalid detection choice')
  })
  test('旧版が保存した全選択肢の category 回答も、下書きと表示でそのまま扱える', () => {
    const value = post(shintouPostText, shintouOverrides)
    const answers = { category: choice('acsta', { acsta: 0.62, ackey: 0.2, other: 0.1 }) }
    expect(buildDetectionDraft(value, answers)).toMatchObject({
      category: 'acsta',
      title: '新東たん アクリルスタンド配布'
    })
  })
  test('「限定カード」だけの書き方は根拠語が無く、限定名刺は選択肢に出ない（other に落ちる）', () => {
    expect(keysOf('限定カードを配布')).toEqual(['other', 'none'])
  })
})

describe('Webhook status question compares the post date with the start date', () => {
  const request = createDetectionRequest(post(shintouPostText, shintouOverrides))
  const status = choiceQuestionOf(request, 'status')

  test('質問文は「投稿日」の行と配布の「開始日」を比べる手順と、告知・開始・継続・終了の対応を示す', () => {
    for (const word of ['投稿日', '開始日', '告知', '開始', '継続', '終了'])
      expect(status.instructions, word).toContain(word)
    // 比べる相手は今日の日付ではなく投稿日。
    expect(status.instructions).toContain('今日の日付とは比べません')
    // 開始日と投稿日の前後ごとに、選ぶ状態を明記する。
    expect(status.instructions).toContain('開始日が投稿日より後: 配布開始前の告知（announce）')
    expect(status.instructions).toContain('開始日が投稿日と同じ日')
    expect(status.instructions).toContain('開始（start）')
    expect(status.instructions).toContain('開始日が投稿日より前: 告知ではありません')
    expect(status.instructions).toContain('継続（ongoing）')
    expect(status.instructions).toContain('終了（end）')
  })
  test('選択肢は従来どおり（announce / start / ongoing / end / none）で、説明も STATUS_CRITERIA のまま', () => {
    expect(Object.keys(status.criteria)).toEqual(['announce', 'start', 'ongoing', 'end', 'none'])
    expect(status.criteria).toEqual({ ...STATUS_CRITERIA })
  })
  test('質問の位置と、状態の質問文以外の共通質問は変えない', () => {
    expect(Object.keys(request.questions).slice(0, 4)).toEqual(['is_event', 'status', 'category', 'single_event'])
    expect(ClefRequestSchema.safeParse(request).success).toBe(true)
  })
  test('どの投稿でも同じ質問文になり、投稿日は buildState が渡す「投稿日」の行から読ませる', () => {
    const other = choiceQuestionOf(createDetectionRequest(post()), 'status')
    expect(other.instructions).toBe(status.instructions)
    expect(request.state).toContain('投稿日: 2026-10-16（金）')
  })
  test('CLI 共用の baseQuestions の状態の質問文は従来のまま', () => {
    const base = baseQuestions().status
    if (base?.type !== 'choice') throw new Error('Missing base status question')
    expect(base.instructions).toBe('この投稿が伝えている配布イベントの状態はどれですか？')
    expect(base.instructions).not.toContain('投稿日')
  })
})

describe('Field thresholds', () => {
  test('対象は9項目で、is_event と対象外は含まない', () => {
    expect([...FIELD_THRESHOLD_KEYS]).toEqual([
      'single_event',
      'status',
      'category',
      'store',
      'start_date',
      'end_date',
      'quantity',
      'condition',
      'purchase_amount'
    ])
    expect(STATUS_DEFAULT_THRESHOLD).toBe(0.8)
  })

  describe('resolveFieldThresholds', () => {
    test('overrides なしは status が min(共通値, 0.8)、他の8項目は共通値', () => {
      const result = resolveFieldThresholds(0.9)
      expect(result.status).toBe(0.8)
      for (const key of FIELD_THRESHOLD_KEYS) if (key !== 'status') expect(result[key], key).toBe(0.9)
      expect(Object.keys(result).sort()).toEqual([...FIELD_THRESHOLD_KEYS].sort())
      expect(FieldThresholdsSchema.safeParse(result).success).toBe(true)
    })

    test('共通値が 0.8 未満なら status も共通値に揃う（0.7 なら 0.7）', () => {
      const result = resolveFieldThresholds(0.7)
      for (const key of FIELD_THRESHOLD_KEYS) expect(result[key], key).toBe(0.7)
      expect(resolveFieldThresholds(0.8).status).toBe(0.8)
    })

    test('共通値が変わると status 以外の既定値が追従する', () => {
      const result = resolveFieldThresholds(0.95)
      expect(result.status).toBe(0.8)
      expect(result.category).toBe(0.95)
      expect(result.purchase_amount).toBe(0.95)
    })

    test('overrides のある項目はその値、無い項目は既定値', () => {
      const result = resolveFieldThresholds(0.9, { status: 0.6, start_date: 0.99 })
      expect(result.status).toBe(0.6)
      expect(result.start_date).toBe(0.99)
      expect(result.category).toBe(0.9)
      expect(resolveFieldThresholds(0.9, {})).toEqual(resolveFieldThresholds(0.9))
    })
  })

  describe('thresholdOf', () => {
    const base = { eventThreshold: 0.93, fieldThreshold: 0.91, ignoreThreshold: 0.5 }

    test('is_event は eventThreshold', () => {
      expect(thresholdOf(base, 'is_event')).toBe(0.93)
      expect(thresholdOf({ ...base, fieldThresholds: { status: 0.1 } }, 'is_event')).toBe(0.93)
    })

    test('9項目は項目別の有効値（上書きがあればそれ、無ければ既定値）', () => {
      expect(thresholdOf(base, 'status')).toBe(0.8)
      for (const key of FIELD_THRESHOLD_KEYS) if (key !== 'status') expect(thresholdOf(base, key), key).toBe(0.91)
      const overridden = { ...base, fieldThresholds: { status: 0.55, end_date: 0.66 } }
      expect(thresholdOf(overridden, 'status')).toBe(0.55)
      expect(thresholdOf(overridden, 'end_date')).toBe(0.66)
      expect(thresholdOf(overridden, 'store')).toBe(0.91)
    })

    test('未知のキーは共通値（fieldThreshold）', () => {
      expect(thresholdOf(base, 'future_question')).toBe(0.91)
      expect(thresholdOf({ ...base, fieldThresholds: { status: 0.1 } }, 'future_question')).toBe(0.91)
    })
  })

  describe('DetectionThresholdsSchema', () => {
    const base = { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 }

    test('fieldThresholds は任意で、3値だけの呼び出しもそのまま通る', () => {
      expect(DetectionThresholdsSchema.safeParse(base).success).toBe(true)
      expect(DetectionThresholdsSchema.safeParse(DEFAULT_DETECTION_THRESHOLDS).success).toBe(true)
      expect(DetectionThresholdsSchema.safeParse({ ...base, fieldThresholds: { status: 0.5 } }).success).toBe(true)
    })

    test('範囲外・未知のキーは不正', () => {
      for (const fieldThresholds of [{ status: 0 }, { status: 1.1 }, { unknown: 0.5 }, { status: Number.NaN }]) {
        expect(DetectionThresholdsSchema.safeParse({ ...base, fieldThresholds }).success).toBe(false)
      }
    })
  })

  describe('FieldThresholdsSchema', () => {
    const full = resolveFieldThresholds(0.9)

    test('9項目すべて必須で、範囲は 0 を含まず 1 以下', () => {
      expect(FieldThresholdsSchema.safeParse(full).success).toBe(true)
      expect(FieldThresholdsSchema.safeParse({ ...full, status: 1 }).success).toBe(true)
      expect(FieldThresholdsSchema.safeParse({ ...full, status: 0 }).success).toBe(false)
      expect(FieldThresholdsSchema.safeParse({ ...full, status: 1.1 }).success).toBe(false)
      expect(FieldThresholdsSchema.safeParse({ ...full, status: '0.9' }).success).toBe(false)
      const { status: _status, ...missing } = full
      expect(FieldThresholdsSchema.safeParse(missing).success).toBe(false)
      expect(FieldThresholdsSchema.safeParse({ ...full, extra: 0.9 }).success).toBe(false)
    })
  })

  describe('evaluateDetection', () => {
    // 新東たんの実投稿に近い回答。store は質問されない（アカウントの店舗から補う）。
    const shintou = post(shintouPostText, shintouOverrides)
    const request = createDetectionRequest(shintou)
    const answersWith = (overrides: Record<string, ClefAnswer> = {}) =>
      response(request, {
        is_event: { type: 'noul', noul: 0.9641 },
        status: choice('announce', { announce: 0.8536, start: 0.1 }),
        category: choice('other', { other: 0.97 }),
        single_event: { type: 'noul', noul: 0.9339 },
        start_date: choice('d20261019', { d20261019: 0.9787 }),
        end_date: choice('none', { none: 0.9976 }),
        quantity: choice('q60', { q60: 0.965 }),
        condition: choice('purchase', { purchase: 0.9865 }),
        purchase_amount: choice('p5000', { p5000: 0.9719 }),
        ...overrides
      })
    const evaluate = (
      overrides: Record<string, ClefAnswer> = {},
      fieldThresholds?: Partial<Record<(typeof FIELD_THRESHOLD_KEYS)[number], number>>
    ) =>
      evaluateDetection(shintou, request, answersWith(overrides), {
        ...DEFAULT_DETECTION_THRESHOLDS,
        ...(fieldThresholds === undefined ? {} : { fieldThresholds })
      })

    test('既定値のままでも status announce 0.8536 は通り、登録される（category は other）', () => {
      const result = evaluate()
      expect(result.status).toBe('register')
      expect(result.reasons).toEqual(['store_inferred_from_account'])
      if (result.status !== 'register') throw new Error('Expected candidate')
      expect(result.candidate.category).toBe('other')
      expect(result.candidate.stores).toEqual(['shintou'])
    })

    test('status は 0.8 未満なら not_new_event_announcement で保留、ちょうど 0.8 は通る', () => {
      expect(evaluate({ status: choice('announce', { announce: 0.79, start: 0.1 }) })).toMatchObject({
        status: 'held',
        reasons: ['not_new_event_announcement']
      })
      expect(evaluate({ status: choice('announce', { announce: 0.8, start: 0.1 }) }).status).toBe('register')
    })

    test('status を 0.5 に下げれば 0.6 でも通り、0.9 に上げれば 0.8536 でも保留になる', () => {
      const low = { status: choice('announce', { announce: 0.6, start: 0.3 }) }
      expect(evaluate(low).status).toBe('held')
      expect(evaluate(low, { status: 0.5 }).status).toBe('register')
      expect(evaluate({}, { status: 0.9 })).toMatchObject({ status: 'held', reasons: ['not_new_event_announcement'] })
    })

    test('start_date を 0.99 にすると 0.9787 は start_date_unconfirmed で保留する', () => {
      expect(evaluate({}, { start_date: 0.99 })).toMatchObject({ status: 'held', reasons: ['start_date_unconfirmed'] })
    })

    test('category・single_event・quantity・condition・purchase_amount も項目ごとの値で効く', () => {
      expect(evaluate({}, { category: 0.98 })).toMatchObject({ status: 'held', reasons: ['category_unconfirmed'] })
      expect(evaluate({}, { single_event: 0.95 })).toMatchObject({
        status: 'held',
        reasons: ['multiple_or_ambiguous_events']
      })
      expect(evaluate({}, { quantity: 0.97 })).toMatchObject({ status: 'held', reasons: ['quantity_unconfirmed'] })
      expect(evaluate({}, { condition: 0.99 })).toMatchObject({
        status: 'held',
        reasons: ['distribution_condition_unconfirmed']
      })
      expect(evaluate({}, { purchase_amount: 0.98 })).toMatchObject({
        status: 'held',
        reasons: ['purchase_amount_unconfirmed']
      })
    })

    test('下げた項目だけが通り、他の項目は既定値のまま判定される', () => {
      const answers = { category: choice('other', { other: 0.7 }), start_date: choice('d20261019', { d20261019: 0.7 }) }
      expect(evaluate(answers).status).toBe('held')
      expect(evaluate(answers, { category: 0.7 })).toMatchObject({
        status: 'held',
        reasons: ['start_date_unconfirmed']
      })
      expect(evaluate(answers, { category: 0.7, start_date: 0.7 }).status).toBe('register')
    })

    test('end_date: none が最有力なら項目別のしきい値に関わらず確定し、日付が最有力ならしきい値を要求する', () => {
      const none = { end_date: choice('none', { none: 0.6, d20261019: 0.3 }) }
      expect(evaluate(none).status).toBe('register')
      expect(evaluate(none, { end_date: 0.99 }).status).toBe('register')
      const date = { end_date: choice('d20261019', { d20261019: 0.95, none: 0.04 }) }
      expect(evaluate(date).status).toBe('register')
      expect(evaluate(date, { end_date: 0.99 })).toMatchObject({ status: 'held', reasons: ['end_date_unconfirmed'] })
      const low = { end_date: choice('d20261019', { d20261019: 0.6, none: 0.3 }) }
      expect(evaluate(low).status).toBe('held')
      expect(evaluate(low, { end_date: 0.5 }).status).toBe('register')
    })

    test('store は項目別のしきい値で回答を採用するか決める（補完できない投稿では届かなければ保留）', () => {
      // 本文に他店の名前があり、アカウントから店舗を補えない投稿。store は質問され、回答だけが店舗の根拠になる。
      const value = post('ビックカメラ秋葉原店で限定名刺を2026年11月3日から先着100枚配布します')
      const asked = createDetectionRequest(value)
      const run = (fieldThresholds?: { store: number }) =>
        evaluateDetection(value, asked, response(asked, { store: choice('abeno', { abeno: 0.99 }) }), {
          ...DEFAULT_DETECTION_THRESHOLDS,
          ...(fieldThresholds === undefined ? {} : { fieldThresholds })
        })
      expect(run()).toMatchObject({ status: 'register', reasons: [] })
      expect(run({ store: 0.995 })).toMatchObject({ status: 'held', reasons: ['store_unconfirmed'] })
    })

    test('is_event は fieldThresholds を下げても eventThreshold のまま判定する', () => {
      const all = Object.fromEntries(FIELD_THRESHOLD_KEYS.map((key) => [key, 0.1]))
      expect(
        evaluateDetection(shintou, request, answersWith({ is_event: { type: 'noul', noul: 0.8 } }), {
          ...DEFAULT_DETECTION_THRESHOLDS,
          fieldThresholds: all
        })
      ).toMatchObject({ status: 'held', reasons: ['event_confidence_below_threshold'] })
    })

    test('共通値 fieldThreshold を上げても status の既定値は 0.8 のまま、他の項目は追従する', () => {
      const answers = answersWith({ category: choice('other', { other: 0.92 }) })
      expect(evaluateDetection(shintou, request, answers, DEFAULT_DETECTION_THRESHOLDS).status).toBe('register')
      // 共通値 0.93 では category 0.92 が届かない。一方 status 0.8536 は既定値 0.8 のままなので通る。
      const strict = { ...DEFAULT_DETECTION_THRESHOLDS, fieldThreshold: 0.93 }
      expect(evaluateDetection(shintou, request, answers, strict)).toMatchObject({
        status: 'held',
        reasons: ['category_unconfirmed']
      })
    })

    test('不正な fieldThresholds は検証で投げる', () => {
      expect(() =>
        evaluateDetection(shintou, request, answersWith(), {
          ...DEFAULT_DETECTION_THRESHOLDS,
          fieldThresholds: { status: 0 }
        })
      ).toThrow('Invalid detection thresholds')
    })
  })

  test('下書きは最有力候補（argmax）で作り、項目別のしきい値に影響されない', () => {
    const shintou = post(shintouPostText, shintouOverrides)
    const request = createDetectionRequest(shintou)
    const answers = {
      ...response(request).answers,
      status: choice('announce', { announce: 0.3, start: 0.2 }),
      category: choice('other', { other: 0.62, acsta: 0.2 })
    }
    expect(buildDetectionDraft(shintou, answers)).toMatchObject({ category: 'other', stores: ['shintou'] })
  })
})
