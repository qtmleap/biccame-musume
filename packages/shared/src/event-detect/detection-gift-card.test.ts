import { describe, expect, test } from 'bun:test'
import { EventCategorySchema } from '../schemas/event.dto'
import { baseQuestions } from './decide'
import { filterWebhookPost } from './detection'
import {
  associationAnswers,
  categoryCriteria,
  choice,
  choiceQuestionOf,
  evaluateWithStore,
  post,
  requestWithAssociations,
  response
} from './detection-test-fixtures'

describe('ギフトカードの配布判定', () => {
  test.each(['配布', 'プレゼント'])('%sするギフトカードを検出し、その他として登録する', (give) => {
    const value = post(`あべのたんのギフトカードを2026年11月3日から1,000円以上お買い上げの方に先着100枚${give}します`)
    expect(filterWebhookPost(value).reason).toBeUndefined()
    expect(filterWebhookPost(value).hits).toContainEqual({ keyword: 'ギフトカード', group: 'item' })
    const request = requestWithAssociations(value)
    // 抽出された物品の名前（extractionContext）が無い投稿は gift_card を選択肢に出さず、other の説明にギフトカードを含む（v18 までと同じ）。
    expect(Object.keys(categoryCriteria(request))).toEqual(['other', 'none'])
    expect(categoryCriteria(request).other).toContain('ギフトカード')
    const decision = evaluateWithStore(
      value,
      request,
      response(request, { category: choice('other', { other: 0.99 }) })
    )
    expect(decision.status).toBe('register')
    if (decision.status !== 'register') throw new Error('Expected gift card registration')
    expect(decision.candidate.category).toBe('other')
    expect(decision.candidate.characterIds).toEqual(['abeno'])
  })

  test.each(['配布', 'プレゼント'])(
    '物品名にギフトカードを含む投稿は gift_card を選択肢に出し、gift_card の回答も other として登録する（%s）',
    (give) => {
      const text = `あべのたんのギフトカードを2026年11月3日から1,000円以上お買い上げの方に先着100枚${give}します`
      const value = post(text, {
        extractionContext: { kind: 'item', item: 'あべのたんギフトカード', evidence: [text], originalText: text }
      })
      const request = requestWithAssociations(value)
      expect(Object.keys(categoryCriteria(request))).toEqual(['gift_card', 'other', 'none'])
      expect(categoryCriteria(request).gift_card).toContain('ギフトカード')
      expect(categoryCriteria(request).other).toContain('ギフトカード以外')
      const decision = evaluateWithStore(
        value,
        request,
        response(request, { category: choice('gift_card', { gift_card: 0.99 }) })
      )
      expect(decision.status).toBe('register')
      if (decision.status !== 'register') throw new Error('Expected gift card registration')
      expect(decision.candidate.category).toBe('other')
      expect(decision.candidate.characterIds).toEqual(['abeno'])
    }
  )

  test('イベント検索などのカテゴリは既存の5種類のまま増やさない（gift_card は質問にだけある選択肢）', () => {
    expect(EventCategorySchema.options).toEqual(['limited_card', 'regular_card', 'ackey', 'acsta', 'other'])
    expect(baseQuestions().category).toMatchObject({ criteria: { other: expect.stringContaining('ギフトカード') } })
  })

  test.each(['ギフトカードを販売中です', 'ギフトカードの価格をご案内します'])(
    '非配布の販売案内を除外する: %s',
    (text) => {
      expect(filterWebhookPost(post(text)).reason).toBe('excluded_keyword')
    }
  )

  test.each(['ギフトカードでお支払いいただけます', 'ギフトカードをご購入いただけます'])(
    'キーワードを通過しても、店舗とビッカメ娘の両方が none なら登録しない: %s',
    (text) => {
      const value = post(text)
      const request = requestWithAssociations(value)
      // is_event は参考値なので、高くても登録の根拠にしない。対象外にするのは店舗とビッカメ娘の none。
      const decision = evaluateWithStore(
        value,
        request,
        response(request, { is_event: { type: 'noul', noul: 0.99 }, ...associationAnswers('none', 'none') })
      )
      expect(decision).toMatchObject({ status: 'ignored', reasons: ['not_distribution_event'] })
      expect(decision).not.toHaveProperty('candidate')
    }
  )

  test('通常販売・チャージ案内の除外条項は、is_event に加えて character の none の定義に入っている', () => {
    const request = requestWithAssociations(post('ギフトカードをご購入いただけます'))
    expect(request.questions.is_event.instructions).toContain(
      '汎用ギフトカードの通常販売・購入・残高チャージ方法・支払い方法の案内だけは含みません'
    )
    const character = choiceQuestionOf(request, 'character')
    for (const clause of [
      '汎用ギフトカードの通常販売・購入・残高チャージ方法・支払い方法の案内だけ',
      '通常の商品紹介・家電の宣伝・雑談',
      'ビッカメ娘と関係ない商品の購入特典・メーカーのキャンペーン'
    ])
      expect(character.instructions, clause).toContain(clause)
    // 記念・限定デザインの販売と入金・チャージ条件付き受取は none にしない。
    expect(character.instructions).toContain('ビッカメ娘の記念・限定デザインを対象にした販売・頒布')
    expect(character.instructions).toContain('入金・チャージ条件付き受取')
    expect(character.criteria.none).toContain('汎用ギフトカードの通常販売')
  })
})
