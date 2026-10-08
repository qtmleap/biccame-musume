import { describe, expect, test } from 'bun:test'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import {
  analyze,
  coverageGaps,
  eventSummaries,
  eventWindow,
  funnel,
  keywordStats,
  missingGold,
  relatedPosts
} from '../../scripts/lib/event-detect/analysis'
import { buildGoldIndex, type GoldEvent, parseStatusUrl, snowflakeTime } from '../../scripts/lib/event-detect/gold'

const accounts = [
  { storeId: 'example', name: '例たん', screenName: 'Bic_Example' },
  { storeId: 'other', name: '他たん', screenName: 'bic_other' }
]

const post = (id: string, text: string, overrides: Partial<DetectPost> = {}): DetectPost => ({
  id,
  createdAt: '2026-06-01T01:00:00.000Z',
  screenName: 'bic_example',
  kind: 'original',
  text,
  url: `https://x.com/bic_example/status/${id}`,
  media: [],
  ...overrides
})

const event = (overrides: Partial<GoldEvent> = {}): GoldEvent => ({
  uuid: '00000000-0000-4000-8000-000000000001',
  title: '夏名刺',
  category: 'limited_card',
  stores: ['example'],
  startDate: '2026-06-10T15:00:00.000Z',
  endDate: '2026-06-30T15:00:00.000Z',
  conditions: [{ type: 'everyone' }],
  isPreliminary: false,
  referenceUrls: [{ type: 'announce', url: 'https://x.com/Bic_Example/status/1' }],
  ...overrides
})

describe('gold', () => {
  test('X の投稿 URL から screen_name と ID を取り出す', () => {
    expect(parseStatusUrl('https://x.com/bic_example/status/123?s=20')).toEqual({
      screenName: 'bic_example',
      id: '123'
    })
    expect(parseStatusUrl('https://twitter.com/bic_example/status/123')).toEqual({
      screenName: 'bic_example',
      id: '123'
    })
    expect(parseStatusUrl('https://www.biccamera.com/bc/c/info/')).toBeUndefined()
  })

  test('1 つの投稿が複数イベントに使われていれば全部を対応づける', () => {
    const second = event({ uuid: '00000000-0000-4000-8000-000000000002', stores: ['other'] })
    const index = buildGoldIndex([event(), second])
    expect(index.get('1')?.map((ref) => ref.eventId)).toEqual([event().uuid, second.uuid])
  })

  test('Snowflake ID からミリ秒単位の投稿時刻を復元する', () => {
    // アーカイブの createdAt は秒単位（2026-10-08T09:26:13.000Z）
    expect(snowflakeTime('2108126811892957663')).toBe(Date.parse('2026-10-08T09:26:13.714Z'))
  })
})

describe('analyze', () => {
  const posts = [
    post('1', '6/11から夏名刺を配布します'),
    post('2', 'RT @x: 名刺配布', { kind: 'retweet' }),
    post('3', 'おはようございます'),
    post('4', '6/11から夏名刺を配布します', { screenName: 'bic_other', createdAt: '2026-06-01T02:00:00.000Z' }),
    post('5', '名刺の配布は終了しました', { createdAt: '2026-06-25T01:00:00.000Z' }),
    post('6', '12/1からクリスマス名刺を配布します', { createdAt: '2025-11-20T01:00:00.000Z' })
  ]
  const analysis = analyze({ posts, events: [event()], accounts })

  test('段階ごとに除外が積み上がり、正解の残存を数える', () => {
    const stages = funnel(analysis)
    expect(stages.map((stage) => [stage.key, stage.posts, stage.gold])).toEqual([
      ['all', 6, 1],
      ['retweet', 5, 1],
      ['reply_to_other', 5, 1],
      ['non_store_account', 5, 1],
      ['no_keyword', 4, 1],
      ['unique', 3, 1],
      ['strong', 3, 1]
    ])
  })

  test('同じ文面の投稿は最初の投稿を代表にまとめる', () => {
    expect(analysis.rowById.get('4')?.cluster).toEqual({ id: '1', size: 2 })
  })

  test('他店舗のイベントに使われたアカウントはその店舗の担当にも数える', () => {
    const shared = event({ stores: ['example', 'third'] })
    const result = analyze({ posts, events: [shared], accounts })
    expect(result.accountStores.get('bic_example')).toEqual(new Set(['example', 'third']))
  })

  test('期間内に D1 イベントが無い強シグナル投稿を登録漏れ候補にする', () => {
    const gaps = coverageGaps(analysis)
    expect(gaps.map((gap) => [gap.account, gap.posts.map((row) => row.post.id)])).toEqual([['bic_example', ['6']]])
  })

  test('イベントの関連投稿は担当アカウントの期間内の通過投稿と正解投稿', () => {
    expect(relatedPosts(analysis, event().uuid).map((row) => row.post.id)).toEqual(['1', '5'])
  })

  test('終了の参考 URL が無く、開始後に終了報告がある場合に終了の登録漏れ候補にする', () => {
    expect(eventSummaries(analysis)[0]).toMatchObject({ archived: 1, related: 2, endCandidate: true })
    const ended = analyze({ posts, events: [event({ endedAt: '2026-06-25T00:00:00.000Z' })], accounts })
    expect(eventSummaries(ended)[0].endCandidate).toBe(false)
  })

  test('アーカイブに無い正解投稿は期間内か外かを区別する', () => {
    const outside = event({
      referenceUrls: [{ type: 'end', url: 'https://x.com/bic_example/status/2108126811892957663' }]
    })
    const result = analyze({ posts, events: [outside], accounts })
    expect(missingGold(result, { from: Date.parse('2026-01-01'), until: Date.parse('2026-12-31') })).toEqual([
      { id: '2108126811892957663', refs: [expect.objectContaining({ type: 'end' })], inRange: true }
    ])
  })

  test('語を無効にすると判定と単独件数に反映される', () => {
    const disabled = analyze({ posts, events: [event()], accounts, disabled: ['配布'] })
    const stat = keywordStats(disabled).find((entry) => entry.keyword === '名刺')
    // 投稿 5 は「終了」にも当たるので、名刺だけで通過しているのは 1・4・6
    expect(stat).toMatchObject({ disabled: false, posts: 4, onlyPosts: 3 })
    expect(disabled.rowById.get('1')?.hits.map((hit) => hit.keyword)).toEqual(['名刺'])
  })

  test('終了日の無いイベントは開始から 120 日後まで期間に含める', () => {
    const open = eventWindow(event({ endDate: undefined }))
    expect(open.until - Date.parse(event().startDate)).toBe(120 * 86_400_000)
  })
})
