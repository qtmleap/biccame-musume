import { expect, test } from 'bun:test'
import type { ClefResponse } from './clef'
import { createDetectionRequests } from './detection'
import {
  auditItemCount,
  createItemCountRequest,
  extractedPost,
  extractionCandidateInputs,
  extractionSystem,
  itemCountReviewReasons,
  validateEventExtraction
} from './extraction'
import { extractionContextState } from './extraction-context'
import { type DetectPost, DetectPostSchema } from './post'

const post: DetectPost = {
  id: '2109941892930814125',
  screenName: 'bic_abeno',
  kind: 'original',
  createdAt: '2026-10-11T00:00:00Z',
  url: 'https://x.com/bic_abeno/status/2109941892930814125',
  text: '10/16から3,000円以上購入であべのたんアクキーをプレゼント。\n限定名刺も用意しています。',
  quoted: { id: '2109941892930814126', text: '配布場所はあべの店です。' },
  media: []
}
const extraction = () =>
  validateEventExtraction(post, {
    events: [
      {
        item: 'あべのたんアクキー',
        stores: ['abeno'],
        characterIds: ['abeno'],
        evidence: ['10/16から3,000円以上購入であべのたんアクキーをプレゼント。']
      },
      {
        item: '限定名刺',
        stores: [],
        characterIds: [],
        evidence: ['限定名刺も用意しています。']
      }
    ]
  })
const countResponse = (count: string, probability: number): ClefResponse => ({
  answers: {
    distribution_item_count: {
      type: 'choice',
      choice: count,
      probabilities: { [count]: probability, unknown: 1 - probability }
    }
  }
})

test('物品根拠と原文参考を分け、他物品の金額を質問候補へ流用しない', () => {
  const [key, card] = extractionCandidateInputs(post, extraction())
  expect(key.post.text).toContain('3,000円')
  expect(card.post.text).not.toContain('3,000円')
  expect(card.post.extractionContext).toEqual({
    kind: 'item',
    item: '限定名刺',
    evidence: ['限定名刺も用意しています。'],
    originalText: post.text,
    quotedId: post.quoted?.id,
    quotedText: post.quoted?.text
  })
  expect(card.post).not.toHaveProperty('quoted')
  const requests = createDetectionRequests(card.post)
  expect(requests[0].questions.purchase_amount).toBeUndefined()
  expect(requests[0].state).toContain('限定名刺')
  expect(requests[0].state).toContain(post.text)
  expect(requests[0].state).toContain('配布場所はあべの店です。')
})

test('quoteの根拠をfocusに使っても引用と元投稿の参考文脈を失わない', () => {
  const value = extractedPost(post, {
    item: '企画の場所案内',
    stores: [],
    characterIds: [],
    evidence: ['配布場所はあべの店です。']
  })
  expect(value.text).toBe('配布場所はあべの店です。')
  expect(value.extractionContext?.originalText).toBe(post.text)
  expect(value.extractionContext?.quotedText).toBe('配布場所はあべの店です。')
})

test('保存・読取schemaを通しても対象物と原文・引用文脈を保持する', () => {
  const focused = extractedPost(post, extraction().events[1])
  const parsed = DetectPostSchema.safeParse(focused)
  expect(parsed.success).toBe(true)
  if (!parsed.success) throw new Error('Invalid focused post')
  expect(parsed.data.extractionContext).toEqual(focused.extractionContext)
  const state = extractionContextState(parsed.data).join('\n')
  expect(state).toContain('判定対象の物品（この1件だけ）:')
  expect(state).toContain('限定名刺')
  expect(state).toContain(post.text)
  expect(state).toContain('配布場所はあべの店です。')
  expect(state).toContain('別の配布物の開始日・条件・金額・数量・対象を流用しない')
})

test('参考原文が長い場合は明示的に省略し、保存された原文や対象根拠は変更しない', () => {
  const original = { ...post, text: `対象根拠${'参考'.repeat(12_000)}` }
  const focused = extractedPost(original, { item: '限定名刺', stores: [], characterIds: [], evidence: ['対象根拠'] })
  const state = extractionContextState(focused).join('\n')
  expect(state.length).toBeLessThan(10_000)
  expect(state).toContain('参考文脈は長いため以降省略')
  expect(focused.text).toBe('対象根拠')
  expect(focused.extractionContext.originalText).toBe(original.text)
  expect(focused.extractionContext.evidence).toEqual(['対象根拠'])
  const requests = createDetectionRequests(focused)
  expect(requests[0].state.length).toBeLessThanOrEqual(20_000)
  expect(requests[0].state).toContain('参考文脈は長いため以降省略')
})

test('低確度の件数一致でも抽出候補を破棄せず確認理由を保持する', () => {
  const value = extraction()
  const audit = auditItemCount(value.events, countResponse('2', 0.82), 0.9)
  expect(audit.status).toBe('low_confidence')
  expect(audit.expected).toBe(audit.extracted)
  expect(extractionCandidateInputs(post, value)).toHaveLength(2)
  expect(itemCountReviewReasons(audit)).toEqual(['distribution_item_count_low_confidence'])
})

test('件数不一致でも確認対象を残し、監査に合格したように扱わない', () => {
  const value = extraction()
  const audit = auditItemCount(value.events, countResponse('3', 0.99), 0.9)
  expect(audit.status).toBe('mismatch')
  expect(extractionCandidateInputs(post, value)).toHaveLength(2)
  expect(itemCountReviewReasons(audit)).toEqual(['distribution_item_count_mismatch'])
  expect(itemCountReviewReasons(auditItemCount(value.events, countResponse('2', 0.99), 0.9))).toEqual([])
})

test('配布物ゼロの展示終了も登録不可の企画文脈候補として残す', () => {
  const value = { ...post, quoted: undefined, text: 'あべのたんの展示パネルは本日で展開終了です。' }
  const candidates = extractionCandidateInputs(value, validateEventExtraction(value, { events: [] }))
  expect(candidates).toHaveLength(1)
  expect(candidates[0].post.extractionContext.kind).toBe('event')
  expect(candidates[0].post.text).toBe(value.text)
  expect(candidates[0].stores).toEqual([])
  expect(candidates[0].characterIds).toEqual([])
})

test('物品ゼロの通常販促と展示終了のどちらにも企画存在を前提にしないstateを使う', () => {
  for (const text of ['テレビをお買い得価格で販売中です。', 'あべのたんの展示パネルは本日で展開終了です。']) {
    const original = { ...post, quoted: undefined, text }
    const candidate = extractionCandidateInputs(original, { events: [] })[0]
    const input = {
      ...candidate.post,
      expected: 'PRIVATE_EXPECTED_LABEL',
      stageGold: 'PRIVATE_STAGE_GOLD',
      case: 'PRIVATE_CASE_LABEL'
    }
    const state = createDetectionRequests(input)[0].state
    expect(state).toContain('投稿全体の関連性確認（配布物未抽出・企画の存在は未確定）:')
    expect(state).toContain('企画の存在も不在も確定しません')
    expect(state).toContain(text)
    expect(state).not.toContain('企画情報（配布物未特定）')
    expect(state).not.toContain('PRIVATE_EXPECTED_LABEL')
    expect(state).not.toContain('PRIVATE_STAGE_GOLD')
    expect(state).not.toContain('PRIVATE_CASE_LABEL')
  }
})

test('同じitem名でも各eventの店舗・日付・条件を順序どおり独立したinputへ保持する', () => {
  const first = '11/1からAKIBAで1,000円以上購入の限定名刺を配布します。'
  const second = '11/2からあべので3,000円以上購入の限定名刺を配布します。'
  const original = { ...post, text: `${first}\n${second}` }
  const extracted = validateEventExtraction(original, {
    events: [
      { item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [first] },
      { item: '限定名刺', stores: ['abeno'], characterIds: ['abeno'], evidence: [second] }
    ]
  })
  const inputs = extractionCandidateInputs(original, extracted)
  expect(inputs).toHaveLength(extracted.events.length)
  expect(inputs.map((input) => input.item)).toEqual(['限定名刺', '限定名刺'])
  expect(inputs.map((input) => input.stores)).toEqual([['akiba'], ['abeno']])
  expect(inputs.map((input) => input.post.text)).toEqual([first, second])
  expect(inputs.map((input) => (input.stores.length === 1 ? input.stores[0] : null))).toEqual(['akiba', 'abeno'])
  expect(JSON.stringify(inputs)).toBe(
    JSON.stringify(extracted.events.map((event) => ({ ...event, post: extractedPost(original, event) })))
  )
  expect(inputs[0].stores).not.toBe(extracted.events[0].stores)
  inputs[0].stores.push('kashiwa')
  expect(extracted.events[0].stores).toEqual(['akiba'])
  expect(inputs[1].stores).toEqual(['abeno'])
})

test('セットの物品・別デザインと個数を同じ監査単位で定義する', () => {
  const request = createItemCountRequest(post)
  expect(request.questions.distribution_item_count.instructions).toContain('ステッカーと名刺のセット')
  expect(request.questions.distribution_item_count.instructions).toContain('2種類')
  expect(extractionSystem).toContain('共同絵柄1個に複数の娘')
  expect(extractionSystem).toContain('開催・配布店舗')
})
