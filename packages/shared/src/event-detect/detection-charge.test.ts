import { describe, expect, test } from 'bun:test'
import { describeAnswers } from './answer-view'
import {
  buildDetectionDraft,
  createDetectionRequests,
  DEFAULT_DETECTION_THRESHOLDS,
  evaluateDetection
} from './detection'
import {
  associationAnswers,
  categoryCriteria,
  choice,
  post,
  requestWithAssociations,
  response
} from './detection-test-fixtures'
import { createItemCountRequest, extractionSystem, validateEventExtraction } from './extraction'

const chargePost = post(
  'あべのたん周年記念デザインギフトカードを2026年11月3日から入金金額1,000円以上で先着100名に数量限定販売します'
)
const chargeAnswers = {
  category: choice('other', { other: 0.99 }),
  condition: choice('charge_first_come', { charge_first_come: 0.99 }),
  charge_amount: choice('p1000', { p1000: 0.99 })
}

describe('限定販売と入金・チャージ条件', () => {
  test('記念デザインの限定販売を含め、汎用カードの通常販売・決済方法とは区別して問う', () => {
    const request = requestWithAssociations(chargePost)
    expect(request.questions.is_event.instructions).toContain('記念・限定デザイン')
    expect(request.questions.is_event.instructions).toContain('汎用ギフトカードの通常販売')
    expect(request.questions.category.instructions).toContain('物品の種別だけを分類')
    expect(categoryCriteria(request)).toHaveProperty('other')
    expect(Object.keys(categoryCriteria(request))).toEqual(['other', 'none'])
    expect(createItemCountRequest(chargePost).questions.distribution_item_count.instructions).toContain(
      '入金・チャージ条件付き販売でも1種類'
    )
    expect(extractionSystem).toContain('記念・限定デザインの販売・頒布')
  })

  test.each(['入金金額1,000円以上', 'チャージ額1,000円以上', '1,000円以上の入金', '1,000円以上チャージ'])(
    '%sは独立した入金条件で、購入条件や購入額を生成しない',
    (condition) => {
      const value = post(`あべのたん記念ギフトカードを2026年11月3日から${condition}で先着100名に提供します`)
      const request = requestWithAssociations(value)
      expect(request.questions).not.toHaveProperty('purchase_amount')
      expect(request.questions.charge_amount).toMatchObject({ criteria: { p1000: '1000円' } })
      expect(request.questions.condition).toMatchObject({ criteria: { charge_first_come: expect.any(String) } })
      const result = evaluateDetection(value, request, response(request, chargeAnswers))
      expect(result.status).toBe('register')
      if (result.status !== 'register') throw new Error('Expected charge registration')
      expect(result.candidate.conditions).toEqual([
        { type: 'charge', chargeAmount: 1000 },
        { type: 'first_come', quantity: 100 }
      ])
      expect(result.candidate.category).toBe('other')
    }
  )

  test('購入と入金が併記されても金額を混ぜず両条件を保存する', () => {
    const value = post(
      'あべのたん記念ギフトカードを2026年11月3日から4,000円以上購入し、1,000円以上チャージした方に先着100枚提供します'
    )
    const request = requestWithAssociations(value)
    expect(request.questions.purchase_amount).toMatchObject({ criteria: { p4000: '4000円' } })
    expect(request.questions.charge_amount).toMatchObject({ criteria: { p1000: '1000円' } })
    const result = evaluateDetection(
      value,
      request,
      response(request, {
        ...chargeAnswers,
        condition: choice('purchase_charge_first_come', { purchase_charge_first_come: 0.99 }),
        purchase_amount: choice('p4000', { p4000: 0.99 })
      })
    )
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected combined registration')
    expect(result.candidate.conditions).toEqual([
      { type: 'purchase', purchaseAmount: 4000 },
      { type: 'charge', chargeAmount: 1000 },
      { type: 'first_come', quantity: 100 }
    ])
  })

  test('入金額が未確定なら保留し、購入額不足と誤表示しない', () => {
    const request = requestWithAssociations(chargePost)
    const result = evaluateDetection(
      chargePost,
      request,
      response(request, {
        ...chargeAnswers,
        charge_amount: choice('p1000', { p1000: 0.6, none: 0.4 })
      })
    )
    expect(result.status).toBe('held')
    expect(result.reasons).toContain('charge_amount_unconfirmed')
    expect(result.reasons).not.toContain('purchase_amount_unconfirmed')
    const draft = buildDetectionDraft(chargePost, response(request, chargeAnswers).answers)
    expect(draft.conditions).toContainEqual({ type: 'charge', chargeAmount: 1000 })
  })

  test('商品価格・決済方法だけの説明をイベントとして登録しない', () => {
    const value = post('ギフトカードは1,000円から入金できます。お支払い方法をご案内します')
    const request = requestWithAssociations(value)
    const result = evaluateDetection(value, request, response(request, associationAnswers('none', 'none')))
    expect(result).toMatchObject({ status: 'ignored', reasons: ['not_distribution_event'] })
  })

  test('用途不明の円以上を先着だけの無条件イベントへ変換しない', () => {
    const value = post('あべのたん名刺2026年11月3日から1,000円以上で先着100枚配布')
    const request = requestWithAssociations(value)
    expect(request.questions).not.toHaveProperty('purchase_amount')
    expect(request.questions).not.toHaveProperty('condition')
    expect(evaluateDetection(value, request, response(request)).reasons).toContain('distribution_condition_unspecified')
  })

  test('旧抽出と新抽出を区別しつつ入金付き限定販売の対象を受理する', () => {
    expect(
      validateEventExtraction(chargePost, {
        events: [{ item: '記念ギフトカード', stores: ['abeno'], characterIds: ['abeno'], evidence: [chargePost.text] }]
      }).events
    ).toHaveLength(1)
    const rows = describeAnswers(
      { charge_amount: choice('p1000', { p1000: 0.99 }), condition: chargeAnswers.condition },
      DEFAULT_DETECTION_THRESHOLDS
    )
    expect(rows).toContainEqual(expect.objectContaining({ label: '入金・チャージ額', answer: '1,000円' }))
    expect(rows).toContainEqual(expect.objectContaining({ label: '配布条件', answer: '入金・チャージ＋先着' }))
  })
})

describe('物品の種別とイベント適否の責務分離', () => {
  test.each(['プレゼントします', '数量限定販売します', '入金1,000円以上で提供します'])(
    '入手方法が%sでも物品の分類定義は同じ',
    (method) => {
      const request = requestWithAssociations(post(`周年記念デザインギフトカードを${method}`))
      const category = request.questions.category
      expect(category.instructions).toContain('物品の種別だけを分類')
      expect(category.instructions).toContain('イベントの適否は別のis_event質問')
      expect(category.instructions).toContain('販売品でもnoneにしません')
      expect(categoryCriteria(request).none).toBe(
        '企画の対象となる物品が記載されていない、または物品種別を特定できない'
      )
      expect(categoryCriteria(request).none).not.toContain('イベント')
    }
  )

  test('通常販売の物品がotherでも、店舗とビッカメ娘の none を優先して登録しない', () => {
    const value = post('汎用ギフトカードをご購入いただけます')
    const request = requestWithAssociations(value)
    const answers = response(request, {
      ...associationAnswers('none', 'none'),
      category: choice('other', { other: 0.99 })
    })
    expect(answers.answers.category).toMatchObject({ choice: 'other' })
    expect(evaluateDetection(value, request, answers).status).toBe('ignored')
  })
})

describe('開催店舗・ビッカメ娘は選ばれた1件だけを採用する', () => {
  test('確定した店舗と娘を採用し、次点の確率では取り消さない', () => {
    const request = requestWithAssociations(chargePost)
    const result = evaluateDetection(
      chargePost,
      request,
      response(request, {
        ...chargeAnswers,
        store: choice('abeno', { abeno: 0.95, takatsuki: 0.03 }),
        character: choice('abeno', { abeno: 0.95, shinyoko: 0.03 })
      })
    )
    expect(result.status).toBe('register')
    if (result.status !== 'register') throw new Error('Expected confirmed associations')
    expect(result.candidate.stores).toEqual(['abeno'])
    expect(result.candidate.characterIds).toEqual(['abeno'])
  })

  test('しきい値未満の選択は保留のまま、採用しない', () => {
    const request = requestWithAssociations(chargePost)
    const result = evaluateDetection(
      chargePost,
      request,
      response(request, {
        ...chargeAnswers,
        store: choice('abeno', { abeno: 0.75, takatsuki: 0.2 }),
        character: choice('abeno', { abeno: 0.75, shinyoko: 0.2 })
      })
    )
    expect(result.status).toBe('held')
    expect(result.reasons).toContain('store_unconfirmed')
    expect(result.reasons).toContain('character_unconfirmed')
    expect(createDetectionRequests(chargePost).every((batch) => Object.keys(batch.questions).length <= 64)).toBe(true)
  })
})
