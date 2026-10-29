import { describe, expect, test } from 'bun:test'
import { describeAnswers } from './answer-view'
import { thresholds } from './answer-view-test-fixtures'
import type { ClefRequest } from './clef'
import {
  buildDetectionDraft,
  categoryOfChoice,
  createDetectionRequests,
  DEFAULT_DETECTION_THRESHOLDS,
  type DetectionThresholds,
  GIFT_CARD_CHOICE
} from './detection'
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
import { EVENT_CONTEXT_ITEM, eventContextPost } from './extraction-context'
import type { DetectPost } from './post'
import { webhookPromptDefinition } from './prompt-definitions'

// v19: 配布物（category）の選択肢に gift_card を足した。出す条件は本文の語ではなく、抽出された物品の名前（extractionContext.item）。
// 質問文は v18 から一字も変えない（変えると gift_card を出さない投稿の出力まで揺れる）。変わるのは選択肢だけで、
// gift_card を出さない投稿の category の質問は v18 の版定義と完全に同一。
const GIFT_TEXT = 'あべのたんのギフトカードを2026年11月3日から1,000円以上お買い上げの方に先着100枚配布します'
const GIFT_CARD_DESCRIPTION =
  'ギフトカード（記念・限定デザインのギフトカード、店舗・フェア特典のギフトカードなど）。通常の汎用ギフトカードの販売・チャージ案内は含まない'
const OTHER_WITHOUT_GIFT_CARD =
  '缶バッジ・ステッカー・ポストカード・アクリルコースター・アクリルプレートなど、名刺・アクキー・アクスタ・ギフトカード以外（アクリル製でもキーホルダーとスタンド以外はこちら）'
// gift_card を出さない投稿の other は、v18 までと一字も違わない（ギフトカードを含む）。
const OTHER_WITH_GIFT_CARD =
  '缶バッジ・ステッカー・ポストカード・ギフトカード・アクリルコースター・アクリルプレートなど、名刺・アクキー・アクスタ以外（ギフトカードを名刺に分類しない。アクリル製でもキーホルダーとスタンド以外はこちら）'
// v18 の category の質問文（生成済みの版定義の文と同じ。ここに直接書いて、版定義と食い違っても気づけるようにする）。
const CATEGORY_INSTRUCTIONS =
  '本文で企画の対象として明示されている物品は、どの種類ですか？ ここでは物品の種別だけを分類します。無料か有料か、配布・販売・頒布の違い、購入・入金などの条件、対象イベントかどうかを理由にnoneを選ばないでください。イベントの適否は別のis_event質問に任せます。ギフトカードと明記された対象物はotherであり、販売品でもnoneにしません。noneは対象となる物品の記載がない、または物品種別を特定できない場合だけです。別の商品を買う際の決済手段として言及されるだけのカードは対象物に数えません。'
const V18 = 'v5-webhook-v18-store-confirm-default'
const v18Category = () => {
  const question = webhookPromptDefinition(V18)?.questions.find((entry) => entry.key === 'category')
  if (question === undefined) throw new Error('Missing v18 category question')
  return question
}

/** 抽出後の物品（kind が item）を持つ投稿。item の名前だけで gift_card を出すかが決まる。 */
const itemPost = (item: string, text: string = GIFT_TEXT, kind: 'item' | 'event' = 'item'): DetectPost =>
  post(text, { extractionContext: { kind, item, evidence: [text], originalText: text } })
const giftPost = itemPost('ギフトカード')
const keysOf = (value: DetectPost) => Object.keys(categoryCriteria(requestWithAssociations(value)))

describe('gift_card を選択肢に出す条件（物品名にギフトカードを含むときだけ）', () => {
  test.each([
    '4店舗特典ギフトカード',
    'ギフトカード',
    'あべのたんギフトカード',
    // 全角・半角の表記ゆれは正規化してから探す。
    'ｷﾞﾌﾄｶｰﾄﾞ'
  ])('物品名「%s」: gift_card が出て、other の説明からギフトカードが外れる', (item) => {
    const criteria = categoryCriteria(requestWithAssociations(itemPost(item)))
    expect(Object.keys(criteria)).toEqual(['gift_card', 'other', 'none'])
    expect(criteria.gift_card).toBe(GIFT_CARD_DESCRIPTION)
    expect(criteria.other).toBe(OTHER_WITHOUT_GIFT_CARD)
    expect(criteria.none).toBe('企画の対象となる物品が記載されていない、または物品種別を特定できない')
  })

  test.each([
    ['アクリルキーホルダー', 'ギフトカードの入金1,000円以上でアクリルキーホルダーを配布します'],
    ['限定名刺', 'ギフトカードで4,000円以上お支払いの方に限定名刺を配布します']
  ])('物品名「%s」は別の物で、本文にギフトカードの語があっても gift_card を出さない', (item, text) => {
    const keys = keysOf(itemPost(item, text))
    expect(keys).not.toContain(GIFT_CARD_CHOICE)
    expect(categoryCriteria(requestWithAssociations(itemPost(item, text))).other).toBe(OTHER_WITH_GIFT_CARD)
  })

  test('抽出文脈が無い投稿は、本文にギフトカードがあっても gift_card を出さず、other は v18 までと同じ', () => {
    const value = post(GIFT_TEXT)
    expect(value.extractionContext).toBeUndefined()
    const criteria = categoryCriteria(requestWithAssociations(value))
    expect(Object.keys(criteria)).toEqual(['other', 'none'])
    expect(criteria.other).toBe(OTHER_WITH_GIFT_CARD)
  })

  test('引用元の本文にギフトカードがあっても、物品名に無ければ出さない', () => {
    const value = itemPost('アクリルコースター', '本日からアクリルコースターを配布します', 'item')
    const quoted = { ...value, quoted: { id: '2109221721773576391', text: 'ギフトカードの配布は終了致しました！' } }
    expect(keysOf(quoted)).toEqual(['other', 'none'])
  })

  test.each([
    [
      '物品の抽出ではない文脈（kind が event）で、物品名にギフトカードを含む',
      itemPost('ギフトカード', GIFT_TEXT, 'event')
    ],
    ['投稿全体の関連性確認（配布物未抽出）の文脈', eventContextPost(post(GIFT_TEXT))]
  ])('%s: gift_card を出さない', (_label, value) => {
    expect(value.extractionContext?.kind).toBe('event')
    const criteria = categoryCriteria(requestWithAssociations(value))
    expect(Object.keys(criteria)).toEqual(['other', 'none'])
    expect(criteria.other).toBe(OTHER_WITH_GIFT_CARD)
  })

  test('文脈の物品名は定数どおり（関連性確認の文脈の item にギフトカードは含まれない）', () => {
    expect(EVENT_CONTEXT_ITEM).not.toContain('ギフトカード')
  })

  test('根拠語による名刺・アクキー・アクスタの絞り込みと併用でき、キーの並びは gift_card が other の直前', () => {
    const value = itemPost('4店舗特典ギフトカード', '名刺・アクキー・アクスタ・ギフトカードを配布')
    expect(keysOf(value)).toEqual(['limited_card', 'regular_card', 'ackey', 'acsta', 'gift_card', 'other', 'none'])
  })
})

describe('質問文は v18 から変わらず全投稿で同じ（版定義と完全一致しないと保存できないため）', () => {
  const cases: [string, DetectPost][] = [
    ['物品名にギフトカード', giftPost],
    ['物品名が別の物', itemPost('アクリルキーホルダー', 'アクリルキーホルダーを配布')],
    ['抽出文脈なし', post(GIFT_TEXT)],
    ['kind が event', eventContextPost(post(GIFT_TEXT))],
    ['名刺・アクキー・アクスタ・ギフトカード', itemPost('ギフトカード', '名刺・アクキー・アクスタ・ギフトカードを配布')]
  ]

  test('前提: 書き写した v18 の文は、生成済みの v18 の版定義の文と一字も違わない', () => {
    expect(v18Category().instructions).toBe(CATEGORY_INSTRUCTIONS)
  })

  test.each(cases)('%s: category の instructions は v18 と同一', (_label, value) => {
    const { instructions } = choiceQuestionOf(requestWithAssociations(value), 'category')
    expect(instructions).toBe(CATEGORY_INSTRUCTIONS)
    expect(instructions).toBe(v18Category().instructions)
    // v19 で文を変えていない（gift_card を出す／出さないで言い換える一文は入れない）。
    expect(instructions).not.toContain('選択肢にgift_card')
  })

  test('どの投稿でも、category 以外の質問は gift_card の有無に影響されない', () => {
    const withGift = createDetectionRequests(giftPost)[0]
    const without = createDetectionRequests(post(GIFT_TEXT))[0]
    const rest = (request: ClefRequest) => Object.entries(request.questions).filter(([key]) => key !== 'category')
    expect(Object.keys(withGift.questions)).toEqual(Object.keys(without.questions))
    expect(rest(withGift).map(([key]) => key)).toEqual(rest(without).map(([key]) => key))
    for (const [key, question] of rest(without)) expect(withGift.questions[key], key).toEqual(question)
  })
})

describe('gift_card を出さない投稿の category の質問は、v18 の版定義と完全に同一', () => {
  const plainCases: [string, DetectPost][] = [
    ['抽出文脈なし（本文にギフトカード）', post(GIFT_TEXT)],
    [
      '物品名が別の物（アクキー。本文にギフトカード）',
      itemPost('アクリルキーホルダー', 'ギフトカードの入金でアクリルキーホルダーを配布')
    ],
    [
      '物品名が別の物（限定名刺。本文にギフトカード）',
      itemPost('限定名刺', 'ギフトカードで4,000円以上お支払いの方に限定名刺を配布')
    ],
    ['kind が event', eventContextPost(post(GIFT_TEXT))],
    ['物品名にギフトカード無し・根拠語なし', itemPost('缶バッジ', '缶バッジを配布します')]
  ]

  test.each(plainCases)(
    '%s: 型・質問文・選択肢・各説明が v18 と一致（選択肢は v18 の並びの部分集合）',
    (_label, value) => {
      const question = choiceQuestionOf(requestWithAssociations(value), 'category')
      const before = v18Category()
      expect(question.type).toBe('choice')
      expect(before.type).toBe('choice')
      expect(question.instructions).toBe(before.instructions)
      const keys = Object.keys(question.criteria)
      expect(keys).not.toContain(GIFT_CARD_CHOICE)
      // 選択肢は v18 の定義に載る選択肢だけで、並びも v18 のまま（根拠語の絞り込みで減るだけ）。
      expect(keys).toEqual(Object.keys(before.criteria).filter((key) => keys.includes(key)))
      for (const [key, label] of Object.entries(question.criteria)) expect(before.criteria[key], key).toBe(label)
      // other は v18 の説明（ギフトカードを含む）のまま。
      expect(question.criteria.other).toBe(before.criteria.other)
      expect(question.criteria.other).toBe(OTHER_WITH_GIFT_CARD)
    }
  )

  test('gift_card を出す投稿でも、変わるのは gift_card の追加と other の説明だけ（他の選択肢は v18 と同一）', () => {
    const question = choiceQuestionOf(requestWithAssociations(giftPost), 'category')
    const before = v18Category()
    expect(question.instructions).toBe(before.instructions)
    for (const [key, label] of Object.entries(question.criteria)) {
      if (key === GIFT_CARD_CHOICE || key === 'other') continue
      expect(before.criteria[key], key).toBe(label)
    }
    expect(question.criteria.other).not.toBe(before.criteria.other)
    expect(Object.keys(before.criteria)).not.toContain(GIFT_CARD_CHOICE)
  })
})

describe('categoryOfChoice: 質問にだけある gift_card を、保存するカテゴリ other に対応づける', () => {
  test.each([
    ['gift_card', 'other'],
    ['other', 'other'],
    ['limited_card', 'limited_card'],
    ['regular_card', 'regular_card'],
    ['ackey', 'ackey'],
    ['acsta', 'acsta'],
    ['none', 'none'],
    [undefined, undefined]
  ])('%s -> %s', (input, expected) => {
    expect(categoryOfChoice(input)).toBe(expected)
  })
})

describe('gift_card の判定: しきい値は最上位の選択肢の確率で比べ、gift_card と other は合算しない', () => {
  const request = requestWithAssociations(giftPost)
  const evaluateCategory = (category: ReturnType<typeof choice>, thresholdSettings?: DetectionThresholds) =>
    evaluateWithStore(
      giftPost,
      request,
      response(request, { ...associationAnswers('abeno', 'abeno'), category }),
      thresholdSettings
    )

  test('gift_card が最上位でしきい値以上なら、category は other で登録に進める', () => {
    const decision = evaluateCategory(choice('gift_card', { gift_card: 0.95, other: 0.03, none: 0.01 }))
    expect(decision.status).toBe('register')
    if (decision.status !== 'register') throw new Error('Expected gift card registration')
    expect(decision.candidate.category).toBe('other')
    expect(decision.reasons).toEqual([])
    // 題は other と同じ扱い（categoryLabels に gift_card は足さない）。
    expect(decision.candidate.title).toBe('ビックカメラあべのキューズモール店 ノベルティ配布')
  })

  test('しきい値ちょうど（既定 0.9）は採用し、わずかに下回れば category_unconfirmed で保留する', () => {
    const exact = evaluateCategory(choice('gift_card', { gift_card: 0.9, other: 0.05 }))
    expect(exact.status).toBe('register')
    const below = evaluateCategory(choice('gift_card', { gift_card: 0.89, other: 0.05 }))
    expect(below).toMatchObject({ status: 'held', reasons: ['category_unconfirmed'] })
  })

  test('管理画面で保存したしきい値（category）も、gift_card の確率に適用される', () => {
    const lowered: DetectionThresholds = { ...DEFAULT_DETECTION_THRESHOLDS, fieldThresholds: { category: 0.5 } }
    const answer = choice('gift_card', { gift_card: 0.6, other: 0.3 })
    expect(evaluateCategory(answer).reasons).toContain('category_unconfirmed')
    expect(evaluateCategory(answer, lowered).status).toBe('register')
  })

  test('none が最上位なら distribution_item_unspecified（今までどおり。category_unconfirmed ではない）', () => {
    const decision = evaluateCategory(choice('none', { none: 0.95, gift_card: 0.03, other: 0.01 }))
    expect(decision.status).toBe('held')
    expect(decision.reasons).toContain('distribution_item_unspecified')
    expect(decision.reasons).not.toContain('category_unconfirmed')
  })

  test.each([
    [0.54, 0.32],
    // 合算すれば 0.95 でしきい値 0.9 を超えるが、合算しないので未確定のまま。
    [0.5, 0.45]
  ])('gift_card %f と other %f が割れたときは未確定（合算しない）', (giftCard, other) => {
    const decision = evaluateCategory(choice('gift_card', { gift_card: giftCard, other }))
    expect(decision).toMatchObject({ status: 'held', reasons: ['category_unconfirmed'] })
    expect(decision).not.toHaveProperty('candidate')
  })

  test('other が最上位でしきい値以上なら、今までどおり other で登録に進める', () => {
    const decision = evaluateCategory(choice('other', { other: 0.95, gift_card: 0.03 }))
    expect(decision.status).toBe('register')
    if (decision.status !== 'register') throw new Error('Expected registration')
    expect(decision.candidate.category).toBe('other')
  })

  test('gift_card を出していない投稿が gift_card と答えた応答は、不正な選択として投げる', () => {
    const plain = post(GIFT_TEXT)
    const plainRequest = requestWithAssociations(plain)
    expect(() =>
      evaluateWithStore(
        plain,
        plainRequest,
        response(plainRequest, { category: choice('gift_card', { gift_card: 0.95 }) })
      )
    ).toThrow('Invalid detection choice')
  })
})

describe('gift_card の下書き: 最上位が過半数なら other（gift_card と other は合算しない）', () => {
  const draftOf = (category: ReturnType<typeof choice>) =>
    buildDetectionDraft(giftPost, { ...response(requestWithAssociations(giftPost)).answers, category })

  test('gift_card が過半数なら下書きのカテゴリは other', () => {
    expect(draftOf(choice('gift_card', { gift_card: 0.6, other: 0.3 })).category).toBe('other')
    expect(draftOf(choice('gift_card', { gift_card: 0.54, other: 0.32 })).category).toBe('other')
  })
  test('gift_card が過半数に届かなければ、other を足して過半数にはせず、カテゴリを入れない', () => {
    expect(draftOf(choice('gift_card', { gift_card: 0.49, other: 0.45 })).category).toBeUndefined()
  })
  test('下書きの題は other と同じ「ノベルティ」', () => {
    const draft = draftOf(choice('gift_card', { gift_card: 0.9, other: 0.05 }))
    expect(draft.title).toContain('ノベルティ配布')
  })
})

describe('画面: 配布物の行が「ギフトカード」と表示される', () => {
  const rows = describeAnswers(
    { category: choice('gift_card', { gift_card: 0.9532, other: 0.0301, none: 0.0102 }) },
    thresholds
  )
  const row = rows.find((entry) => entry.key === 'category')

  test('回答・確率・次点がギフトカード表記になる', () => {
    expect(row).toMatchObject({ label: '配布物', answer: 'ギフトカード', probability: 0.9532 })
    expect(row?.alternatives).toEqual([
      { answer: 'その他', probability: 0.0301 },
      { answer: '配布物の話ではない', probability: 0.0102 }
    ])
  })
  test('other が最上位で gift_card が次点のときも、次点がギフトカード表記になる', () => {
    const [other] = describeAnswers({ category: choice('other', { other: 0.6, gift_card: 0.3 }) }, thresholds)
    expect(other).toMatchObject({ answer: 'その他', alternatives: [{ answer: 'ギフトカード', probability: 0.3 }] })
  })
  test('gift_card の確定表示は、他の選択肢と同じしきい値で決まる（合算しない）', () => {
    expect(row).toMatchObject({ threshold: 0.9, confirmed: true })
    const [split] = describeAnswers({ category: choice('gift_card', { gift_card: 0.5, other: 0.45 }) }, thresholds)
    expect(split.confirmed).toBe(false)
  })
})
