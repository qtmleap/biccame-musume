import { describe, expect, test } from 'bun:test'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import {
  analyze,
  coverageGaps,
  eventSummaries,
  eventWindow,
  excludeStats,
  filterStages,
  keywordStats,
  missingGold,
  postStats,
  relatedPosts,
  rescueStats
} from '../../scripts/lib/event-detect/analysis'
import { buildGoldIndex, type GoldEvent, parseStatusUrl, snowflakeTime } from '../../scripts/lib/event-detect/gold'

const accounts = [
  { storeId: 'example', name: '例たん', screenName: 'Bic_Example' },
  { storeId: 'other', name: '他たん', screenName: 'bic_other' }
]

const characterNames = ['例たん', '他たん']

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
  const analysis = analyze({ posts, events: [event()], accounts, characterNames })

  test('段階ごとに除外が積み上がり、正解の残存を数える', () => {
    const stages = filterStages(analysis)
    expect(stages.map((stage) => [stage.key, stage.posts, stage.gold])).toEqual([
      ['all', 6, 1],
      ['retweet', 5, 1],
      ['reply_to_other', 5, 1],
      ['non_store_account', 5, 1],
      ['no_keyword', 4, 1],
      ['excluded_keyword', 4, 1],
      ['unique', 3, 1],
      ['strong', 3, 1]
    ])
  })

  test('同じ文面の投稿は最初の投稿を代表にまとめる', () => {
    expect(analysis.rowById.get('4')?.cluster).toEqual({ id: '1', size: 2 })
  })

  test('他店舗のイベントに使われたアカウントはその店舗の担当にも数える', () => {
    const shared = event({ stores: ['example', 'third'] })
    const result = analyze({ posts, events: [shared], accounts, characterNames })
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
    const ended = analyze({ posts, events: [event({ endedAt: '2026-06-25T00:00:00.000Z' })], accounts, characterNames })
    expect(eventSummaries(ended)[0].endCandidate).toBe(false)
  })

  test('アーカイブに無い正解投稿は期間内か外かを区別する', () => {
    const outside = event({
      referenceUrls: [{ type: 'end', url: 'https://x.com/bic_example/status/2108126811892957663' }]
    })
    const result = analyze({ posts, events: [outside], accounts, characterNames })
    expect(missingGold(result, { from: Date.parse('2026-01-01'), until: Date.parse('2026-12-31') })).toEqual([
      { id: '2108126811892957663', refs: [expect.objectContaining({ type: 'end' })], inRange: true }
    ])
  })

  test('語を無効にすると判定と単独件数に反映される', () => {
    const disabled = analyze({ posts, events: [event()], accounts, characterNames, disabled: ['配布'] })
    const stat = keywordStats(disabled).find((entry) => entry.keyword === '名刺')
    // 投稿 5 は「終了」にも当たるので、名刺だけで通過しているのは 1・4・6
    expect(stat).toMatchObject({ disabled: false, posts: 4, onlyPosts: 3 })
    expect(disabled.rowById.get('1')?.hits.map((hit) => hit.keyword)).toEqual(['名刺'])
  })

  test('除外語で落ちた投稿は段に数え、除外語ごとの寄与を返す', () => {
    const extra = [
      post('7', '新製品の体験会でステッカー配布', { createdAt: '2026-06-02T01:00:00.000Z' }),
      post('8', '体験会で例たんのステッカー配布', { createdAt: '2026-06-03T01:00:00.000Z' })
    ]
    const result = analyze({ posts: [...posts, ...extra], events: [event()], accounts, characterNames })
    expect(result.rowById.get('7')?.reason).toBe('excluded_keyword')
    expect(result.rowById.get('8')?.reason).toBeUndefined()
    // キーワードを通過した 6 件（1・4・5・6・7・8）から 7 だけが落ちる
    expect(filterStages(result).find((stage) => stage.key === 'excluded_keyword')?.posts).toBe(5)
    const stat = excludeStats(result).find((entry) => entry.keyword === '体験会')
    expect(stat).toMatchObject({ posts: 1, onlyPosts: 0, droppedGold: 0 })
    const disabled = analyze({
      posts: [...posts, ...extra],
      events: [event()],
      accounts,
      characterNames,
      disabledExcludes: ['製品', '新製品', '体験会']
    })
    expect(disabled.rowById.get('7')?.reason).toBeUndefined()
  })

  test('終了日の無いイベントは開始から 120 日後まで期間に含める', () => {
    const open = eventWindow(event({ endDate: undefined }))
    expect(open.until - Date.parse(event().startDate)).toBe(120 * 86_400_000)
  })
})

describe('postStats', () => {
  // 2025-12-31T15:00:00Z は JST では 2026-01-01 00:00。UTC の暦年とずれる境界を投稿とイベントの両方に置く
  const posts = [
    post('1', '6/11から夏名刺を配布します', { screenName: 'Bic_Example', createdAt: '2025-12-31T14:59:59.000Z' }),
    post('2', 'おはようございます', { createdAt: '2025-12-31T15:00:00.000Z' }),
    post('3', 'RT @x: 名刺配布', { kind: 'retweet' }),
    post('4', '6/11から夏名刺を配布します', { screenName: 'bic_other', createdAt: '2026-06-01T02:00:00.000Z' }),
    post('5', 'おはようございます', { screenName: 'someone', createdAt: '2026-06-02T01:00:00.000Z' })
  ]
  const events = [
    event(),
    // 投稿の無い年でもイベントがあれば行に出る
    event({
      uuid: '00000000-0000-4000-8000-000000000002',
      stores: ['other'],
      startDate: '2024-05-01T00:00:00.000Z',
      referenceUrls: []
    }),
    event({
      uuid: '00000000-0000-4000-8000-000000000003',
      stores: ['example', 'other'],
      startDate: '2025-12-31T15:00:00.000Z',
      referenceUrls: []
    })
  ]
  const stats = postStats(analyze({ posts, events, accounts, characterNames }), accounts)

  test('年別は JST の暦年で投稿とイベントを数え、投稿の無い年も含めて昇順に返す', () => {
    // 判定の Map を渡さなければ、候補があっても llm・clef とその判定済みは 0。emulate の結果が無ければ emulated も 0
    const none = { llm: 0, llmJudged: 0, clef: 0, clefJudged: 0, emulated: 0, emulatedEnded: 0 }
    expect(stats.years).toEqual([
      { year: 2024, posts: 0, candidates: 0, goldPosts: 0, events: 1, ...none },
      { year: 2025, posts: 1, candidates: 1, goldPosts: 1, events: 0, ...none },
      { year: 2026, posts: 4, candidates: 1, goldPosts: 0, events: 2, ...none }
    ])
  })

  test('年別の llm・clef は、イベント候補のうち確率 0.5 以上の判定を数え、判定済みは確率によらず数える', () => {
    // 候補は投稿 1（2025 年）と投稿 4（2026 年）だけ。投稿 2・5 はキーワードなし、投稿 3 はリツイートで候補でない
    const judgements = {
      llm: new Map([
        ['1', 0.5],
        ['4', 0.49],
        ['2', 0.99],
        ['3', 0.99],
        ['404', 0.99]
      ]),
      clef: new Map([
        ['4', 1],
        ['5', 1],
        ['3', 1],
        ['404', 1]
      ])
    }
    const years = postStats(analyze({ posts, events, accounts, characterNames }), accounts, judgements).years
    expect(
      years.map(({ year, llm, llmJudged, clef, clefJudged }) => ({ year, llm, llmJudged, clef, clefJudged }))
    ).toEqual([
      { year: 2024, llm: 0, llmJudged: 0, clef: 0, clefJudged: 0 },
      // 0.5 ちょうどはイベントと数える
      { year: 2025, llm: 1, llmJudged: 1, clef: 0, clefJudged: 0 },
      // 0.49 は判定済みだがイベントではない。Clef は判定がある候補だけ
      { year: 2026, llm: 0, llmJudged: 1, clef: 1, clefJudged: 1 }
    ])
  })

  test('判定を渡してもアカウント別と年別の他の件数は変わらない', () => {
    const judgements = { llm: new Map([['1', 1]]), clef: new Map([['1', 1]]) }
    const analysis = analyze({ posts, events, accounts, characterNames })
    const judged = postStats(analysis, accounts, judgements)
    const plain = postStats(analysis, accounts)
    expect(judged.accounts).toEqual(plain.accounts)
    expect(judged.range).toEqual(plain.range)
    expect(judged.years.map(({ llm, llmJudged, clef, clefJudged, ...counts }) => counts)).toEqual(
      plain.years.map(({ llm, llmJudged, clef, clefJudged, ...counts }) => counts)
    )
  })

  describe('emulate の結果', () => {
    const at = (iso: string) => Date.parse(iso)
    // 年は startDate の年、無ければ firstSeen の JST 年。2025/2026 の境界は JST の 2026-01-01 0:00（= UTC 2025-12-31 15:00）
    const entries = [
      // startDate が 2025 年。最初の言及が 2026 年でも startDate の年に数える。終了報告と終了予定日の両方があっても 1 回だけ数える
      {
        store: 'example',
        startDate: '2025-12-31',
        endDate: '2026-01-04',
        endedAt: '2026-01-05',
        firstSeen: at('2026-03-01T00:00:00+09:00')
      },
      // startDate が 2026 年。最初の言及が 2025 年でも startDate の年に数える。終了報告も終了予定日も無いので終了は追えていない
      { store: 'example', startDate: '2026-01-01', firstSeen: at('2025-12-31T00:00:00+09:00') },
      // 開始日が無いので firstSeen の JST 年。JST ではまだ 2025-12-31 23:59:59。終了予定日だけあり、終了報告はまだ
      { store: 'other', endDate: '2026-01-31', firstSeen: at('2025-12-31T14:59:59.000Z') },
      // 開始日が無く、firstSeen は JST で 2026-01-01 0:00 ちょうど。開始を見ていない（startUnknown）イベントも数える。終了報告だけある
      { store: 'other', endedAt: '2026-02-01', firstSeen: at('2025-12-31T15:00:00.000Z') },
      // アカウントの無い店舗のイベント。年別には数えるが、どのアカウントにも載らない
      { store: 'ghost', startDate: '2027-02-03', endedAt: '2027-02-10', firstSeen: at('2027-01-20T00:00:00+09:00') }
    ]
    const emulated = postStats(analyze({ posts, events, accounts, characterNames }), accounts, undefined, entries)

    test('年別は startDate の年で数え、無ければ firstSeen の JST 年にして、開始を見ていないものも含める', () => {
      expect(emulated.years.map(({ year, emulated, emulatedEnded }) => [year, emulated, emulatedEnded])).toEqual([
        [2024, 0, 0],
        [2025, 2, 2],
        [2026, 2, 1],
        // 投稿が無い年でも、emulate のイベントがあれば行に含める
        [2027, 1, 1]
      ])
    })

    test('終了数は endedAt か endDate があるイベントを 1 回ずつ数え、emulated の内数になる', () => {
      for (const year of emulated.years) expect(year.emulatedEnded).toBeLessThanOrEqual(year.emulated)
      expect(emulated.years.reduce((total, year) => total + year.emulated, 0)).toBe(entries.length)
      // endedAt のみ・endDate のみ・両方・どちらも無しの 4 通り。両方あるイベントは二重に数えない
      expect(emulated.years.reduce((total, year) => total + year.emulatedEnded, 0)).toBe(4)
    })

    test('終了数は、endedAt だけ・endDate だけ・両方・どちらも無しを区別して数える', () => {
      const counted = (...rest: readonly { endDate?: string; endedAt?: string }[]) =>
        postStats(
          analyze({ posts, events, accounts, characterNames }),
          accounts,
          undefined,
          rest.map((dates) => ({
            store: 'example',
            startDate: '2026-03-01',
            firstSeen: at('2026-03-01T00:00:00+09:00'),
            ...dates
          }))
        ).years.find((year) => year.year === 2026)
      expect(counted({ endedAt: '2026-03-10' })).toMatchObject({ emulated: 1, emulatedEnded: 1 })
      expect(counted({ endDate: '2026-03-10' })).toMatchObject({ emulated: 1, emulatedEnded: 1 })
      expect(counted({ endDate: '2026-03-10', endedAt: '2026-03-11' })).toMatchObject({ emulated: 1, emulatedEnded: 1 })
      expect(counted({})).toMatchObject({ emulated: 1, emulatedEnded: 0 })
      // 予定日が未来でも終了に数える（過去かどうかは問わない）
      expect(counted({ endDate: '2099-12-31' })).toMatchObject({ emulated: 1, emulatedEnded: 1 })
    })

    test('アカウント別は、アカウントの店舗のイベントで数える', () => {
      expect(
        emulated.accounts.map((account) => [account.screenName, account.store, account.emulated, account.emulatedEnded])
      ).toEqual([
        ['Bic_Example', 'example', 2, 1],
        ['bic_other', 'other', 2, 2],
        // 店舗に対応しないアカウントは 0。アカウントの無い店舗（ghost）のイベントはどこにも載らない
        ['someone', null, 0, 0]
      ])
    })

    test('同じ店舗を担当するアカウントが複数あれば、どちらにも店舗のイベントを数える', () => {
      const shared = [...accounts, { storeId: 'example', name: '例たん', screenName: 'bic_example_sub' }]
      const sub = [...posts, post('7', 'おはようございます', { screenName: 'bic_example_sub' })]
      const counted = postStats(
        analyze({ posts: sub, events, accounts: shared, characterNames }),
        shared,
        undefined,
        entries
      )
      expect(
        counted.accounts
          .filter((account) => account.store === 'example')
          .map((account) => [account.screenName, account.emulated, account.emulatedEnded])
      ).toEqual([
        ['Bic_Example', 2, 1],
        ['bic_example_sub', 2, 1]
      ])
    })

    test('emulate の結果を渡しても、ほかの件数は変わらない', () => {
      const plain = postStats(analyze({ posts, events, accounts, characterNames }), accounts)
      const strip = <T extends { emulated: number; emulatedEnded: number }>({ emulated, emulatedEnded, ...rest }: T) =>
        rest
      expect(emulated.accounts.map(strip)).toEqual(plain.accounts.map(strip))
      expect(emulated.range).toEqual(plain.range)
      // 2027 年は emulate のイベントだけで増える行。ほかの年の件数は変わらない
      expect(emulated.years.filter((year) => year.year !== 2027).map(strip)).toEqual(plain.years.map(strip))
    })

    test('結果が無ければ年別もアカウント別も 0', () => {
      for (const year of stats.years) expect([year.emulated, year.emulatedEnded]).toEqual([0, 0])
      for (const account of stats.accounts) expect([account.emulated, account.emulatedEnded]).toEqual([0, 0])
    })
  })

  test('アカウントは大文字小文字をまとめ、表示は最初に見た綴りで、投稿数の降順に返す', () => {
    expect(stats.accounts.map((account) => [account.screenName, account.posts])).toEqual([
      ['Bic_Example', 3],
      ['bic_other', 1],
      ['someone', 1]
    ])
    expect(stats.accounts[0]).toMatchObject({ candidates: 1, goldPosts: 1 })
  })

  test('アカウントの行は最初・最新の投稿日時を持たない', () => {
    for (const account of stats.accounts) {
      expect(Object.keys(account).sort()).toEqual(
        ['candidates', 'emulated', 'emulatedEnded', 'events', 'goldPosts', 'posts', 'screenName', 'store'].sort()
      )
    }
  })

  test('range は全投稿の最古・最新を返し、アカウントや入力の順に依らない', () => {
    // 最古は Bic_Example の投稿 1、最新は someone の投稿 5。最新は投稿数の多いアカウント（Bic_Example）の最新ではない
    const expected = { oldest: '2025-12-31T14:59:59.000Z', newest: '2026-06-02T01:00:00.000Z' }
    expect(stats.range).toEqual(expected)
    const reversed = postStats(analyze({ posts: [...posts].reverse(), events, accounts, characterNames }), accounts)
    expect(reversed.range).toEqual(expected)
  })

  test('range は投稿が 1 件ならその投稿の日時、無ければ null', () => {
    const one = analyze({ posts: [posts[0]], events: [], accounts, characterNames })
    expect(postStats(one, accounts).range).toEqual({
      oldest: '2025-12-31T14:59:59.000Z',
      newest: '2025-12-31T14:59:59.000Z'
    })
    const empty = analyze({ posts: [], events: [], accounts, characterNames })
    expect(postStats(empty, accounts).range).toEqual({ oldest: null, newest: null })
  })

  test('アカウントのイベントは対応する 1 店舗を含むものを重複なく数える', () => {
    expect(stats.accounts.map((account) => [account.screenName, account.store, account.events])).toEqual([
      ['Bic_Example', 'example', 2],
      ['bic_other', 'other', 2],
      ['someone', null, 0]
    ])
  })

  test('正解データで他店舗のイベントに使われたアカウントでも、店舗は characters.json の 1 店舗だけで数える', () => {
    const crossStore = [
      event(),
      // Bic_Example が third のイベントを告知している。third は example とは別の店舗
      event({
        uuid: '00000000-0000-4000-8000-000000000004',
        stores: ['third'],
        referenceUrls: [{ type: 'announce', url: 'https://x.com/Bic_Example/status/9' }]
      }),
      // example と third の両方に紐づくイベントは example の分にも数える
      event({
        uuid: '00000000-0000-4000-8000-000000000005',
        stores: ['example', 'third'],
        referenceUrls: []
      })
    ]
    const analysis = analyze({ posts, events: crossStore, accounts, characterNames })
    // 前提: 関連投稿などが使う対応表には third が入っている
    expect(analysis.accountStores.get('bic_example')).toEqual(new Set(['example', 'third']))
    const account = postStats(analysis, accounts).accounts.find((entry) => entry.screenName === 'Bic_Example')
    expect(account?.store).toBe('example')
    expect(account?.events).toBe(2)
  })

  test('characters.json に無いアカウントは、他店舗のイベントを告知していても store が null で events は 0', () => {
    const guest = [
      ...posts,
      post('9', '6/11から夏名刺を配布します', { screenName: 'guest', createdAt: '2026-06-03T01:00:00.000Z' })
    ]
    const hosted = event({
      uuid: '00000000-0000-4000-8000-000000000006',
      stores: ['other'],
      referenceUrls: [{ type: 'announce', url: 'https://x.com/guest/status/9' }]
    })
    const analysis = analyze({ posts: guest, events: [event(), hosted], accounts, characterNames })
    expect(analysis.accountStores.get('guest')).toEqual(new Set(['other']))
    const account = postStats(analysis, accounts).accounts.find((entry) => entry.screenName === 'guest')
    expect(account).toMatchObject({ store: null, events: 0, goldPosts: 1 })
  })

  test('投稿が無ければ空で返す', () => {
    const empty = analyze({ posts: [], events: [], accounts, characterNames })
    expect(postStats(empty, accounts)).toEqual({ years: [], accounts: [], range: { oldest: null, newest: null } })
  })
})

describe('rescueStats', () => {
  // 10: 名刺だけで救済・正解 / 11: 名刺とアクキーの 2 語で救済 / 12: キャラクター名だけで救済
  // 20: 除外語なし / 21: 救済語なしで除外 / 22: リツイート / 23: 店舗外アカウント / 24: キーワードなし
  const posts = [
    post('10', '体験会で名刺を配布します'),
    post('11', '体験会でアクキーと名刺を配布します'),
    post('12', '体験会で例たんのステッカー配布'),
    post('20', '名刺を配布します'),
    post('21', '体験会でステッカー配布'),
    post('22', '体験会で名刺を配布します', { kind: 'retweet' }),
    post('23', '体験会で名刺を配布します', { screenName: 'someone' }),
    post('24', 'セールで例たんがお買い得')
  ]
  const gold = event({ referenceUrls: [{ type: 'announce', url: 'https://x.com/bic_example/status/10' }] })
  const stats = rescueStats(analyze({ posts, events: [gold], accounts, characterNames }))
  const statOf = (keyword: string) => stats.find((stat) => stat.keyword === keyword)

  test('除外語と救済語を両方含む通過投稿だけを数える', () => {
    // 20 は除外語なし、21 は救済語なしで除外、22〜24 は構造かキーワードで落ちている
    expect(statOf('名刺')).toMatchObject({ posts: 2 })
    expect(statOf('アクキー')).toMatchObject({ posts: 1 })
    expect(statOf('例たん')).toMatchObject({ posts: 1 })
    expect(stats.reduce((total, stat) => total + stat.posts, 0)).toBe(4)
  })

  test('救済語が 2 つ当たる投稿は単独に入らない', () => {
    // 11 は名刺とアクキーが当たる。どちらを外しても残るので、どちらの単独にも数えない
    expect(statOf('名刺')).toMatchObject({ posts: 2, onlyPosts: 1 })
    expect(statOf('アクキー')).toMatchObject({ posts: 1, onlyPosts: 0 })
    expect(statOf('例たん')).toMatchObject({ posts: 1, onlyPosts: 1 })
  })

  test('救済した投稿のうち正解を数える', () => {
    expect(statOf('名刺')).toMatchObject({ gold: 1 })
    expect(statOf('アクキー')).toMatchObject({ gold: 0 })
    expect(statOf('例たん')).toMatchObject({ gold: 0 })
  })

  test('固定の語は keyword、キャラクター名は character になり、当たらない語も 0 で含む', () => {
    expect(statOf('名刺')).toMatchObject({ kind: 'keyword' })
    expect(statOf('例たん')).toMatchObject({ kind: 'character' })
    expect(statOf('他たん')).toEqual({ keyword: '他たん', kind: 'character', posts: 0, onlyPosts: 0, gold: 0 })
    expect(statOf('ビッカメ娘')).toMatchObject({ kind: 'keyword', posts: 0 })
  })

  test('救済した投稿の降順、同数は語の昇順で並べる', () => {
    expect(stats.slice(0, 3).map((stat) => stat.keyword)).toEqual(['名刺', 'アクキー', '例たん'])
    const empty = stats.filter((stat) => stat.posts === 0).map((stat) => stat.keyword)
    expect(empty).toEqual([...empty].sort())
  })

  test('除外語を無効にすると、その語でしか除外語に当たらない投稿は数えない', () => {
    const disabled = analyze({ posts, events: [gold], accounts, characterNames, disabledExcludes: ['体験会'] })
    expect(rescueStats(disabled).reduce((total, stat) => total + stat.posts, 0)).toBe(0)
  })
})
