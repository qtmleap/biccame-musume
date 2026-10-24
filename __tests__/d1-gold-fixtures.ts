import type { ClefAnswer, ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import type { GoldCase, GoldEvent } from '../scripts/lib/event-detect/d1-gold-schema'
import type { GoalPipelineModule } from '../scripts/lib/event-detect/goal-pipeline-module'

export const SENTINEL = 'GOLD_SENTINEL_NEVER_SEND_TO_MODEL_71207'

export const goldEvent = (overrides: Partial<GoldEvent> = {}): GoldEvent => ({
  uuid: '11111111-1111-4111-8111-111111111111',
  title: '限定名刺',
  stores: ['yuurakuchou'],
  characterIds: [],
  category: 'limited_card',
  startDateJst: '2026-03-16',
  endDateJst: '2026-03-31',
  conditions: [{ type: 'everyone' }],
  isVerified: true,
  isPreliminary: false,
  ...overrides
})

export const goldCase = (index: number, overrides: Partial<GoldCase> = {}): GoldCase => {
  const id = `10000000000000${String(index).padStart(5, '0')}`
  return {
    caseId: `d1-gold-${id}`,
    postId: id,
    bucket: 'main',
    flags: [],
    post: {
      id,
      createdAt: '2026-03-10T00:00:00.000Z',
      screenName: 'bic_yuurakuchou',
      kind: 'original',
      text: `有楽町たん名刺を配布します。${index}`,
      url: `https://x.com/bic_yuurakuchou/status/${id}`,
      media: []
    },
    postCreatedAtJst: '2026-03-10 09:00',
    events: [goldEvent({ uuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` })],
    ...overrides
  }
}

const answerFor = (question: ClefRequest['questions'][string]): ClefAnswer => {
  if (question.type === 'noul') return { type: 'noul', noul: 0.97 }
  if (question.type === 'choice') {
    const keys = Object.keys(question.criteria)
    const first = keys[0]
    return {
      type: 'choice',
      choice: first,
      probabilities: Object.fromEntries(keys.map((key) => [key, key === first ? 0.9 : 0.1 / (keys.length - 1)]))
    }
  }
  return { type: 'score', score: 1 }
}
export const answerAll = (request: ClefRequest): ClefResponse => ({
  answers: Object.fromEntries(Object.entries(request.questions).map(([key, question]) => [key, answerFor(question)]))
})

const request = (state: string): ClefRequest => ({
  model: 'clef',
  state,
  questions: {
    is_event: { type: 'noul', instructions: '企画か' },
    store: { type: 'choice', instructions: '店舗', criteria: { yuurakuchou: '有楽町', none: 'なし' } },
    character: { type: 'choice', instructions: '娘', criteria: { yuurakuchou: '有楽町', none: 'なし' } }
  }
})

// 実AIも凍結bundleも使わない、runGoalPipeline 用のスタブモジュール。
export const stubModule = (eventsPerPost = 1): GoalPipelineModule => ({
  sha256: 'stub-module',
  DETECTION_VERSION: 'stub-version',
  EXTRACTION_VERSION: 'stub-extraction',
  createItemCountRequest: (post) => request(post.text),
  createDetectionRequests: (post, _model, storeKey) => [
    request(`${post.text}${storeKey === null ? '' : `\n抽出段階の開催店舗候補（未確定）: ${storeKey}`}`)
  ],
  extractWebhookEvents: async (_env, post, fetcher) =>
    await (await fetcher('https://benchmark.invalid', { method: 'POST', body: JSON.stringify({ post }) })).json(),
  validateEventExtraction: (_post, raw) => raw,
  auditItemCount: (events) => ({
    version: 'stub',
    expected: eventsPerPost,
    probability: 0.99,
    threshold: 0.9,
    extracted: events.length,
    candidates: events.length,
    status: 'matched'
  }),
  extractedPost: (post, event) => ({ ...post, text: event.evidence.join('\n') }),
  evaluateDetection: () => ({ status: 'held', confidence: 0.97, reasons: ['stub_reason'] }),
  buildDetectionDraft: () => ({})
})

export const stubExtractionBody = (eventsPerPost: number) => ({
  events: Array.from({ length: eventsPerPost }, (_, index) => ({
    item: `物品${index + 1}`,
    stores: ['yuurakuchou'],
    characterIds: ['yuurakuchou'],
    evidence: [`根拠${index + 1}`]
  }))
})
