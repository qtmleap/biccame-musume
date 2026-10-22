import type { DetectPost } from '@biccame/shared/event-detect/post'
import type { EventCategory, EventConditionType } from '@biccame/shared/schemas/event.dto'

export type BenchmarkExpected = {
  isEvent?: boolean
  status?: 'register' | 'held' | 'ignored' | null
  category?: EventCategory | null
  stores?: string[] | null
  characterIds?: string[] | null
  startDate?: string | null
  conditions?: { type: EventConditionType; amount?: number; quantity?: number }[] | null
}

export type BenchmarkCase = {
  id: string
  source: 'public-post' | 'synthetic'
  description: string
  post: DetectPost
  expected: BenchmarkExpected
  rationale?: string
  tags?: string[]
  group?: string
  reviewStatus?: 'provisional'
}

// 公開公式投稿の必要な本文だけを保持し、利用者情報やDB行全体をfixtureにしない。
const post = (id: string, text: string): DetectPost => ({
  id,
  screenName: 'bic_yuurakuchou',
  kind: 'original',
  url: `https://x.com/bic_yuurakuchou/status/${id}`,
  text,
  createdAt: '2026-10-20T03:56:27.537Z',
  media: []
})
const positive: BenchmarkExpected = {
  status: 'register',
  category: 'other',
  stores: ['yuurakuchou'],
  characterIds: ['yuurakuchou'],
  startDate: '2026-10-24',
  conditions: [
    { type: 'charge', amount: 1000 },
    { type: 'first_come', quantity: 55 }
  ]
}
const negative: BenchmarkExpected = {
  status: 'ignored',
  category: 'other',
  stores: [],
  characterIds: [],
  startDate: null,
  conditions: []
}

export const eventBenchmarkCases: BenchmarkCase[] = [
  {
    id: 'yuurakuchou-limited-gift-card',
    source: 'public-post',
    description: '有楽町たん記念デザインの限定販売。入金条件は購入条件と区別する',
    post: post(
      '2112392477038780586',
      '✨有楽町25周年記念✨\n🦢有楽町たんデザインギフトカード　数量限定販売🦢\n日にち：2026年10月24日(土)～\n数量：先着55名様（お渡し会の参加人数によって配布数が増える可能性有り）\n条件：ギフトカードの入金金額1,000円以上\n場所：1階　総合案内カウンターにて販売'
    ),
    expected: positive
  },
  {
    id: 'commemorative-gift-card-giveaway',
    source: 'synthetic',
    description: '記念デザインのギフトカードを配布する告知',
    post: post('9000000000000000001', '有楽町たん25周年記念ギフトカードを10月24日から有楽町店で先着55名に配布します。'),
    expected: { ...positive, conditions: [{ type: 'first_come', quantity: 55 }] }
  },
  {
    id: 'generic-gift-card-sale',
    source: 'synthetic',
    description: '汎用ギフトカードの通常販売はキャラクター企画ではない',
    post: post(
      '9000000000000000002',
      'ビックカメラギフトカードを販売中。贈り物にどうぞ。1階総合案内カウンターでお求めください。'
    ),
    expected: negative
  },
  {
    id: 'generic-charge-instructions',
    source: 'synthetic',
    description: '汎用カードへのチャージ方法だけの案内',
    post: post(
      '9000000000000000003',
      'ギフトカードへの入金は1,000円以上から承ります。チャージ方法は総合案内カウンターでご確認ください。'
    ),
    expected: negative
  },
  {
    id: 'gift-card-payment-only',
    source: 'synthetic',
    description: '支払い手段としての言及を対象物にしない',
    post: post(
      '9000000000000000004',
      'お支払いにビックカメラギフトカードをご利用いただけます。残高は店頭で確認できます。'
    ),
    expected: negative
  }
]
