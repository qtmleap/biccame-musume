import type { EmulatedEventRow, EventView, PostView } from '@biccame/shared/event-detect/viewer'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { events, now } from '@/stories/catalogue-fixtures'
import type { client } from '../utils/client/index'

// 実在の投稿・ユーザー・秘密を含まない表示専用データ。変更操作もローカルの合成応答だけを返す。
export const detectionPost: PostView = {
  id: '1000000000000000001',
  createdAt: now,
  screenName: 'storybook_fixture',
  kind: 'original',
  text: '合成展示イベント：限定カードを配布します。',
  url: 'https://example.invalid/posts/1000000000000000001',
  media: [],
  hits: [{ keyword: '限定カード', group: 'item' }],
  excludeHits: [],
  rescueHits: [],
  strong: true,
  gold: [{ eventId: events[0].uuid, type: 'announce', title: '合成展示イベント' }],
  cluster: { id: 'synthetic-cluster', size: 1 },
  nearbyEvents: 1,
  label: { verdict: 'event', type: 'announce', updatedAt: now },
  llm: 0.93,
  clef: 0.88
}
export const detectionEvent: EventView = {
  uuid: events[0].uuid,
  title: '合成展示イベント',
  category: 'limited_card',
  stores: ['abeno'],
  startDate: now,
  refs: { announce: 1, start: 0, end: 0 },
  archived: 1,
  related: 1,
  endCandidate: false
}
export const emulatedEvent: EmulatedEventRow = {
  id: 'abeno-1',
  store: 'abeno',
  item: '合成限定カード',
  category: 'limited_card',
  status: 'announce',
  startDate: '2026-10-02',
  startUnknown: false,
  firstSeen: now,
  lastSeen: now,
  year: 2026,
  mentions: 1,
  ended: false,
  d1: [{ eventId: events[0].uuid, title: detectionEvent.title }]
}
export const webhookJob: WebhookJob = {
  postId: detectionPost.id,
  post: detectionPost,
  sourceUrl: detectionPost.url,
  eventUUID: events[0].uuid,
  status: 'held',
  reasons: ['合成データ：配布条件を管理者が確認してください'],
  candidate: null,
  confidence: 0.72,
  model: 'clef',
  questionVersion: 'synthetic-v1',
  eventId: null,
  eventTitle: null,
  postStatus: 'announce',
  attempts: 1,
  notificationStatus: 'unknown',
  notificationId: null,
  notificationError: 'Synthetic delivery result unavailable',
  notificationAttempts: 1,
  lastError: null,
  createdAt: now,
  updatedAt: now,
  judgedAt: now
}
const counts = { posts: 1, candidates: 1, goldPosts: 1, events: 1, emulated: 1, emulatedEnded: 0 }
const judgments = { llm: 1, llmJudged: 1, clef: 1, clefJudged: 1 }
const bins = Array.from({ length: 10 }, (_, index) => ({
  label: `${(index / 10).toFixed(1)}–${((index + 1) / 10).toFixed(1)}`,
  count: index === 9 ? 1 : 0
}))
const keywords = {
  keywords: [{ keyword: '限定カード', group: 'item', disabled: false, posts: 1, gold: 1, onlyPosts: 1, onlyGold: 1 }],
  excludes: [
    {
      keyword: 'セール',
      group: 'sales',
      disabled: false,
      posts: 0,
      gold: 0,
      rescuedGold: 0,
      onlyPosts: 0,
      droppedGold: 0
    }
  ],
  rescues: [{ keyword: '配布', kind: 'keyword', posts: 1, onlyPosts: 1, gold: 1 }]
} as const

type ResponseFixtures = {
  [Key in keyof typeof client]?: (typeof client)[Key] extends (...args: never[]) => infer Result
    ? () => Awaited<Result>
    : never
}
export const adminResponses = {
  getAdminBotStatus: () => ({
    botConnected: true,
    error: null,
    fetchedAt: now,
    webhook: {
      configured: true,
      queueConfigured: true,
      model: 'clef',
      eventThreshold: 0.9,
      ignoreThreshold: 0.1,
      choiceThreshold: 0.8
    },
    discord: {
      configured: { token: true, channel: true },
      configFingerprint: 'a'.repeat(64),
      settings: { token: 'valid', channel: 'valid' },
      notificationsEnabled: true,
      xPostingEnabled: false,
      timelineNotificationsEnabled: false,
      connection: 'unchecked',
      bot: null,
      channel: null,
      sendPermission: 'unknown',
      errorKind: null,
      fetchedAt: now
    }
  }),
  checkAdminBotConnection: () => ({
    botConnected: true,
    error: null,
    fetchedAt: now,
    webhook: {
      configured: true,
      queueConfigured: true,
      model: 'clef',
      eventThreshold: 0.9,
      ignoreThreshold: 0.1,
      choiceThreshold: 0.8
    },
    discord: {
      configured: { token: true, channel: true },
      configFingerprint: 'a'.repeat(64),
      settings: { token: 'valid', channel: 'valid' },
      notificationsEnabled: true,
      xPostingEnabled: false,
      timelineNotificationsEnabled: false,
      connection: 'connected',
      bot: { id: '10001', username: 'synthetic-bot' },
      channel: { id: '10002', name: 'synthetic-notifications' },
      sendPermission: 'unknown',
      errorKind: null,
      fetchedAt: now
    }
  }),
  saveAdminBotConfiguration: () => ({ model: 'clef-flash' }),
  testAdminBotNotification: () => ({ status: 'sent', messageId: '10003' }),
  listAdminWebhookJobs: () => ({ jobs: [webhookJob], nextCursor: null }),
  getAdminWebhookJob: () => webhookJob,
  retryAdminWebhookJob: () => ({ ...webhookJob, notificationStatus: 'pending' }),
  resolveAdminWebhookJob: () => ({ ...webhookJob, status: 'ignored', notificationStatus: 'skipped' }),
  getEventDetectSummary: () => ({
    source: {
      archive: 'synthetic-storybook',
      posts: 1,
      oldest: now,
      newest: now,
      complete: true,
      pages: 1,
      goldFetchedAt: now,
      events: 1,
      emulatedAt: now
    },
    totals: { ...counts, ...judgments, accounts: 1, storeAccounts: 1 },
    years: [{ ...counts, ...judgments, year: 2026 }],
    accounts: [{ ...counts, screenName: detectionPost.screenName, store: 'abeno' }],
    labels: { total: 1, event: 1, notEvent: 0, unsure: 0 }
  }),
  getEventDetectAccounts: () => ({
    accounts: [{ screenName: detectionPost.screenName, stores: ['abeno'], total: 1, passed: 1, gold: 1 }]
  }),
  getEventDetectCharts: () => ({
    llmProbability: { all: bins, gold: bins },
    clefProbability: bins,
    monthlyEvents: [{ month: '2026-10', llm: 1, llmEnded: 0, d1: 1 }],
    monthlyPosts: [{ month: '2026-10', posts: 1, candidates: 1 }],
    stores: [{ store: 'abeno', count: 1 }]
  }),
  getEventDetectPosts: () => ({ total: 1, posts: [detectionPost] }),
  getEventDetectEvents: () => ({ events: [detectionEvent] }),
  getEventDetectEvent: () => ({
    event: { ...detectionEvent, referenceUrls: [{ type: 'announce', url: detectionPost.url, archived: true }] },
    posts: [detectionPost]
  }),
  getEventDetectGaps: () => ({
    generatedAt: now,
    verify: { model: 'synthetic-clef', threshold: 0.8 },
    ignored: 0,
    pending: [],
    events: [
      {
        ...emulatedEvent,
        statusCounts: { announce: 1, start: 0, ongoing: 0, end: 0 },
        posts: [{ status: 'announce', post: detectionPost }]
      }
    ]
  }),
  getEventDetectEmulated: () => ({
    total: 1,
    events: [emulatedEvent],
    facets: { years: [{ year: 2026, count: 1 }], stores: [{ store: 'abeno', count: 1 }] },
    emulatedAt: now
  }),
  getEventDetectEmulatedEvent: () => ({
    event: emulatedEvent,
    posts: [{ status: 'announce', verify: { choice: 'new', probability: 0.93, merged: false }, post: detectionPost }]
  }),
  getEventDetectKeywords: () => ({
    keywords: [...keywords.keywords],
    excludes: [...keywords.excludes],
    rescues: [...keywords.rescues]
  }),
  setEventDetectKeywords: () => ({
    keywords: [...keywords.keywords],
    excludes: [...keywords.excludes],
    rescues: [...keywords.rescues]
  }),
  setEventDetectLabel: () => ({ label: { verdict: 'event', type: 'announce', updatedAt: now } }),
  deleteEventDetectLabel: () => ({ label: null })
} satisfies ResponseFixtures
