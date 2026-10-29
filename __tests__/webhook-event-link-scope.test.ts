import { describe, expect, test } from 'bun:test'
import type { Event } from '@biccame/shared/schemas/event.dto'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import {
  linkableWebhookEvents,
  webhookLinkScopeDescription,
  webhookLinkStores
} from '@/components/admin/webhook-event-link-scope'
import { STORE_NAME_LABELS } from '@/locales/app.content'
import { baseJob, candidateOf, eventOf, firstUuid, secondUuid } from './fixtures/webhook-detail-link'

const draftOf = (stores: string[]): NonNullable<WebhookJob['draft']> => ({ stores, characterIds: [], conditions: [] })
const candidateWith = (stores: Event['stores']) => ({ ...eventOf('登録候補', firstUuid), stores })
const accountPost = (screenName: string): WebhookJob['post'] => ({ ...baseJob.post, screenName })

describe('webhookLinkStores（連携先を探す店舗）', () => {
  test('1. 判定で採用した登録候補の店舗が最優先（抽出段階の店舗・下書き・投稿アカウントより先）', () => {
    const active = candidateOf('名刺', firstUuid, {
      candidate: candidateWith(['funabashi', 'akiba']),
      storeKey: 'chiba',
      draft: draftOf(['kyoto']),
      post: accountPost('bic_tachikawa')
    })
    expect(webhookLinkStores({ ...baseJob, post: active.post }, active)).toEqual(['funabashi', 'akiba'])
  })

  test('候補を選んでいれば候補を、選んでいなければジョブ全体を見る（候補の外のジョブの登録候補は見ない）', () => {
    const job: WebhookJob = { ...baseJob, candidate: candidateWith(['kyoto']), draft: draftOf(['nagoya']) }
    expect(webhookLinkStores(job, undefined)).toEqual(['kyoto'])
    const active = candidateOf('名刺', firstUuid, { storeKey: 'chiba' })
    expect(webhookLinkStores(job, active)).toEqual(['chiba'])
    // 選んだ候補が登録候補を持たず、storeKey も下書きも無ければ、ジョブの登録候補ではなく投稿アカウントの店舗に進む。
    const bare = candidateOf('名刺', secondUuid)
    expect(webhookLinkStores({ ...job, post: accountPost('bic_tachikawa') }, bare)).toEqual(['tachikawa'])
  })

  test('2. 登録候補が無ければ、候補の抽出段階の店舗(storeKey)。下書き・投稿アカウントより先', () => {
    const active = candidateOf('名刺', firstUuid, {
      storeKey: 'akiba',
      draft: draftOf(['chiba']),
      post: accountPost('bic_tachikawa')
    })
    expect(webhookLinkStores({ ...baseJob, post: active.post }, active)).toEqual(['akiba'])
  })

  test('3. 登録候補も storeKey も無ければ、保留の下書きの店舗。投稿アカウントより先', () => {
    const job: WebhookJob = { ...baseJob, draft: draftOf(['chiba', 'akiba']), post: accountPost('bic_tachikawa') }
    expect(webhookLinkStores(job, undefined)).toEqual(['chiba', 'akiba'])
    const active = candidateOf('名刺', firstUuid, { storeKey: null, draft: draftOf(['chiba']) })
    expect(webhookLinkStores(job, active)).toEqual(['chiba'])
  })

  test('下書きの店舗が空なら、次の投稿アカウントに進む', () => {
    const job: WebhookJob = { ...baseJob, draft: draftOf([]), post: accountPost('bic_tachikawa') }
    expect(webhookLinkStores(job, undefined)).toEqual(['tachikawa'])
  })

  test('4. 上のどれも無ければ、投稿アカウントの店舗(大文字小文字は区別しない)', () => {
    expect(webhookLinkStores({ ...baseJob, post: accountPost('bic_tachikawa') }, undefined)).toEqual(['tachikawa'])
    expect(webhookLinkStores({ ...baseJob, post: accountPost('Bic_Tachikawa') }, undefined)).toEqual(['tachikawa'])
  })

  test('5. どれも決まらなければ空（店舗以外のアカウントは店舗にしない）', () => {
    expect(webhookLinkStores(baseJob, undefined)).toEqual([])
    expect(webhookLinkStores(baseJob, candidateOf('名刺', firstUuid))).toEqual([])
  })

  test('返す配列は元の登録候補の配列と別物（呼び出し側が変更しても元を壊さない）', () => {
    const candidate = candidateWith(['akiba'])
    const stores = webhookLinkStores({ ...baseJob, candidate }, undefined)
    expect(stores).not.toBe(candidate.stores)
  })
})

const POSTED_AT = '2026-10-10T03:00:00.000Z' // 日本時間 2026/10/10 12:00
const at = (iso: string) => dayjs(iso).toDate()

const eventWith = (uuid: string, overrides: Partial<Event> = {}): Event => ({
  uuid,
  title: `イベント ${uuid.slice(-3)}`,
  category: 'limited_card',
  stores: ['akiba'],
  characterIds: ['akiba'],
  startDate: at('2026-10-01T00:00:00+09:00'),
  conditions: [],
  isVerified: true,
  isPreliminary: false,
  status: 'ongoing',
  daysUntil: 0,
  interestedCount: 0,
  completedCount: 0,
  createdAt: at('2026-09-30T03:00:00Z'),
  updatedAt: at('2026-09-30T03:00:00Z'),
  ...overrides
})
const id = (n: number) => `550e8400-e29b-41d4-a716-44665544${String(n).padStart(4, '0')}`
const idsOf = (events: readonly Event[], stores: readonly string[] = []) =>
  linkableWebhookEvents(events, { stores, postedAt: POSTED_AT }).map((event) => event.uuid)

describe('linkableWebhookEvents（連携先の選択肢）', () => {
  test('終了日時も終了日も無いイベントは残る', () => {
    expect(idsOf([eventWith(id(1))])).toEqual([id(1)])
  })

  test('終了日時が投稿より前のイベントは除き、投稿ちょうど・投稿後に終わったイベントは残す', () => {
    const events = [
      eventWith(id(1), { endedAt: at('2026-10-10T02:59:59Z') }),
      eventWith(id(2), { endedAt: at(POSTED_AT) }),
      eventWith(id(3), { endedAt: at('2026-10-12T00:00:00Z') })
    ]
    expect(idsOf(events)).toEqual([id(2), id(3)])
  })

  test('終了日が投稿日の前日(日本時間)なら除き、当日なら残す', () => {
    const events = [
      eventWith(id(1), { endDate: at('2026-10-09T00:00:00+09:00') }),
      eventWith(id(2), { endDate: at('2026-10-09T23:59:59+09:00') }),
      eventWith(id(3), { endDate: at('2026-10-10T00:00:00+09:00') }),
      eventWith(id(4), { endDate: at('2026-10-10T09:00:00+09:00') }),
      eventWith(id(5), { endDate: at('2026-10-11T00:00:00+09:00') })
    ]
    expect(idsOf(events)).toEqual([id(3), id(4), id(5)])
  })

  test('日の境目は UTC ではなく日本時間で見る（投稿が日本時間の深夜 0 時台でも前日に倒れない）', () => {
    // 2026/10/10 00:30 JST = 2026/10/09 15:30 UTC。UTC の日の始まり(10/09 00:00Z)で見ると 10/09 9:00 JST 終了のイベントが残ってしまう。
    const postedAt = '2026-10-09T15:30:00.000Z'
    const events = [
      eventWith(id(1), { endDate: at('2026-10-09T09:00:00+09:00') }),
      eventWith(id(2), { endDate: at('2026-10-10T00:00:00+09:00') })
    ]
    expect(linkableWebhookEvents(events, { stores: [], postedAt }).map((event) => event.uuid)).toEqual([id(2)])
  })

  test('基準は今ではなく投稿日時（過去の投稿でも、その時点で開催していたイベントに連携できる）', () => {
    const past = eventWith(id(1), { endDate: at('2026-10-20T00:00:00+09:00') })
    expect(linkableWebhookEvents([past], { stores: [], postedAt: '2026-10-15T03:00:00.000Z' })).toEqual([past])
    expect(linkableWebhookEvents([past], { stores: [], postedAt: '2026-10-21T03:00:00.000Z' })).toEqual([])
  })

  test('開始前のイベントは除かない（告知の投稿を、登録済みの開始前のイベントへ連携することがある）', () => {
    const upcoming = eventWith(id(1), { startDate: at('2026-11-01T00:00:00+09:00'), status: 'upcoming', daysUntil: 22 })
    expect(idsOf([upcoming])).toEqual([id(1)])
  })

  test('店舗が決まるときは、その店舗のイベントだけ。他店のイベントは除く', () => {
    const events = [
      eventWith(id(1), { stores: ['akiba'] }),
      eventWith(id(2), { stores: ['funabashi'] }),
      eventWith(id(3), { stores: ['chiba'] })
    ]
    expect(idsOf(events, ['akiba'])).toEqual([id(1)])
    expect(idsOf(events, ['akiba', 'chiba'])).toEqual([id(1), id(3)])
  })

  test('複数店舗のイベントは、対象の店舗を1つでも含めば残す', () => {
    const events = [
      eventWith(id(1), { stores: ['funabashi', 'akiba'] }),
      eventWith(id(2), { stores: ['funabashi', 'chiba'] })
    ]
    expect(idsOf(events, ['akiba'])).toEqual([id(1)])
  })

  test('店舗が決まらなければ、全店舗の終わっていないイベント（終わったイベントは店舗によらず除く）', () => {
    const events = [
      eventWith(id(1), { stores: ['akiba'] }),
      eventWith(id(2), { stores: ['funabashi'], endedAt: at('2026-10-01T00:00:00Z') }),
      eventWith(id(3), { stores: ['chiba'], endDate: at('2026-10-09T00:00:00+09:00') }),
      eventWith(id(4), { stores: ['kyoto'] })
    ]
    expect(idsOf(events, [])).toEqual([id(1), id(4)])
  })

  test('終了と店舗の条件は両方満たすものだけ。元の配列は変更しない', () => {
    const events = [
      eventWith(id(1), { stores: ['akiba'], endedAt: at('2026-10-01T00:00:00Z') }),
      eventWith(id(2), { stores: ['funabashi'] }),
      eventWith(id(3), { stores: ['akiba'] })
    ]
    expect(idsOf(events, ['akiba'])).toEqual([id(3)])
    expect(events.map((event) => event.uuid)).toEqual([id(1), id(2), id(3)])
  })
})

describe('webhookLinkScopeDescription（説明の先頭の一文）', () => {
  test('店舗が決まるときは、その店舗名で範囲を伝える', () => {
    expect(webhookLinkScopeDescription(['akiba'])).toBe(
      `${STORE_NAME_LABELS.akiba}で、投稿の時点で終わっていないイベントから選んでください。`
    )
  })

  test('複数の店舗は読点でつなぐ', () => {
    expect(webhookLinkScopeDescription(['akiba', 'chiba'])).toBe(
      `${STORE_NAME_LABELS.akiba}、${STORE_NAME_LABELS.chiba}で、投稿の時点で終わっていないイベントから選んでください。`
    )
  })

  test('店舗キーでない値(下書きの未知の ID)はそのまま出す', () => {
    expect(webhookLinkScopeDescription(['unknown_store'])).toContain('unknown_store')
  })

  test('店舗が決まらないときは、全店舗を表示している旨を伝える', () => {
    expect(webhookLinkScopeDescription([])).toBe(
      '店舗が決まらないため、全店舗の、投稿の時点で終わっていないイベントを表示しています。'
    )
  })
})
