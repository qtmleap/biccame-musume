import { expect, test } from 'bun:test'
import { assertCoverage, socialEventView, splitSideRows, summaryPostText } from '@biccame/shared/domain/social-post'
import { weightedLength } from '@biccame/shared/domain/tweet-text'
import {
  MAX_IMAGES_PER_POST,
  type SocialRow,
  type SocialSnapshot,
  SocialSnapshotSchema,
  snapshotEventIds
} from '@biccame/shared/social'
import {
  daily,
  endingToday,
  event,
  MONDAY,
  minute,
  required,
  sideRows,
  startingToday,
  summaries,
  uuid,
  weekly
} from '../fixtures/social-post-domain'

test('events with the same title, dates and conditions become one row even at different stores', () => {
  const trip = (n: number, stores: string[], input: Record<string, unknown> = {}) =>
    startingToday(n, { title: 'ビッカメ娘旅', stores, endDate: '2026-10-31T23:59:59+09:00', ...input })
  const snapshot = required(
    daily(
      [
        trip(1, ['hachioji']),
        trip(2, ['shibuhachi', 'hachioji']),
        trip(3, ['yao']),
        // 対象の娘が明示されたものは、娘が違えば別の行
        trip(4, ['chofu'], { characterIds: ['seiseki'] }),
        trip(5, ['chofu'], { characterIds: ['chofu'] }),
        // 限定数が違えば別の行
        trip(6, ['akiba'], { limitedQuantity: 100 })
      ],
      []
    )
  )
  const [rows] = sideRows(snapshot, 'starting')
  expect(rows.map((row) => row.eventIds)).toEqual([[uuid(1), uuid(2), uuid(3)], [uuid(4)], [uuid(5)], [uuid(6)]])
  expect(rows[0].stores).toEqual(['JR八王子駅店', '渋谷ハチ公口店', 'アリオ八尾店'])
  expect(rows[0].avatars).toEqual(['akiba'])
  expect(rows[1].avatars).toEqual(['seiseki'])
  expect(rows[1].target).toBe('せいせきたん')
  expect(rows[2].target).toBe('調布たん')
  expect(summaries(snapshot, 'starting')[0].total).toBe(6)
})

test('merge key ignores the order of conditions that D1 returns', () => {
  const everyone = { uuid: crypto.randomUUID(), type: 'everyone' }
  const purchase = { uuid: crypto.randomUUID(), type: 'purchase', purchaseAmount: 1000 }
  const snapshot = required(
    daily(
      [
        startingToday(1, { title: '同じ', conditions: [everyone, purchase] }),
        startingToday(2, { title: '同じ', conditions: [purchase, everyone] })
      ],
      []
    )
  )
  expect(sideRows(snapshot, 'starting')[0]).toHaveLength(1)
})

test('rows are split 4 / 4 + rest / 4 + 4 with the hidden events counted by original events', () => {
  const split = (count: number) => {
    const snapshot = required(
      daily(
        Array.from({ length: count }, (_, index) => startingToday(index + 1)),
        []
      )
    )
    return summaries(snapshot, 'starting')
  }
  expect(split(1).map((image) => image.rows.length)).toEqual([1])
  expect(split(4).map((image) => image.rows.length)).toEqual([4])
  expect(split(5).map((image) => image.rows.length)).toEqual([4, 1])
  expect(split(8).map((image) => image.rows.length)).toEqual([4, 4])
  expect(split(8).every((image) => image.more === undefined)).toBe(true)
  const nine = split(9)
  expect(nine.map((image) => image.rows.length)).toEqual([4, 4])
  expect(nine.map((image) => image.more)).toEqual([undefined, 1])
  expect(nine.map((image) => [image.page, image.pageCount])).toEqual([
    [1, 2],
    [2, 2]
  ])
  expect(nine.every((image) => image.total === 9)).toBe(true)
  // 隠れた行の元イベント数: 8行の後ろに、3件と2件がまとまった行が続く。
  const merged = required(
    daily(
      [
        ...Array.from({ length: 8 }, (_, index) => startingToday(index + 1)),
        ...[11, 12, 13].map((n) =>
          startingToday(n, { title: 'まとめA', startDate: `2026-10-12T11:${minute(n)}:00+09:00` })
        ),
        ...[14, 15].map((n) => startingToday(n, { title: 'まとめB', startDate: `2026-10-12T12:${minute(n)}:00+09:00` }))
      ],
      []
    )
  )
  const [first, second] = summaries(merged, 'starting')
  expect(first.more).toBeUndefined()
  expect(second.more).toBe(5)
  expect(second.hiddenEventIds).toEqual([11, 12, 13, 14, 15].map(uuid))
  expect(second.total).toBe(13)
})

test('splitSideRows hides everything after the eighth row', () => {
  const rows = Array.from(
    { length: 11 },
    (_, index): SocialRow => ({
      eventIds: [uuid(index + 1)],
      title: `行${index}`,
      stores: ['AKIBA店'],
      avatars: ['akiba'],
      target: null,
      period: null,
      date: null
    })
  )
  const { pages, hidden } = splitSideRows(rows)
  expect(pages.map((page) => page.length)).toEqual([4, 4])
  expect(hidden.map((row) => row.title)).toEqual(['行8', '行9', '行10'])
})

test('a side without events gets one text-only image and posts with no events are not created', () => {
  const oneSide = required(daily([startingToday(1), startingToday(2)], []))
  expect(oneSide.images.map((image) => image.type)).toEqual(['summary', 'empty'])
  expect(oneSide.images[1]).toEqual({ type: 'empty', side: 'ending', headline: '2026年10月12日(月)' })
  expect(oneSide.text.split('\n')[0]).toBe('本日開始 2件・本日最終日 0件')
  const otherSide = required(daily([], [endingToday(1)]))
  expect(otherSide.images.map((image) => image.type)).toEqual(['empty', 'summary'])
  expect(daily([], [])).toBeNull()
  expect(weekly([], [])).toBeNull()
  // 公開されていないイベントだけなら、どちらも0件として扱う。
  expect(daily([startingToday(1, { isVerified: false })], [endingToday(2, { isVerified: false })])).toBeNull()
})

test('post text counts original events and has the same shape as the approved prototype', () => {
  const snapshot = required(
    daily(
      [startingToday(1, { title: '同じ' }), startingToday(2, { title: '同じ' }), startingToday(3)],
      [endingToday(4)]
    )
  )
  expect(snapshot.text).toBe(
    '本日開始 3件・本日最終日 1件\n2026-10-12\nhttps://biccame-musume.com/events\n#ビッカメ娘 #ビックカメラ'
  )
  expect(sideRows(snapshot, 'starting')[0]).toHaveLength(2)
  const week = required(weekly([startingToday(1)], []))
  expect(week.text).toBe(
    '今週開始 1件・今週終了 0件\n2026-10-12 〜 2026-10-18\nhttps://biccame-musume.com/events\n#ビッカメ娘 #ビックカメラ'
  )
  expect(week.key).toBe('weekly:2026-10-12')
  expect(snapshot.key).toBe('daily:2026-10-12')
  expect(snapshot.scheduledAt).toBe(MONDAY)
  expect(summaryPostText('daily', '2026-04-29', 4, 2)).toBe(
    '本日開始 4件・本日最終日 2件\n2026-04-29\nhttps://biccame-musume.com/events\n#ビッカメ娘 #ビックカメラ'
  )
  expect(weightedLength(snapshot.text)).toBeLessThanOrEqual(280)
})

test('every input event is covered exactly once by shown rows and hidden rows', () => {
  const starting = Array.from({ length: 13 }, (_, index) => startingToday(index + 1))
  const ending = Array.from({ length: 6 }, (_, index) => endingToday(index + 21))
  const snapshot = required(daily(starting, ending))
  expect(snapshot.images).toHaveLength(4)
  expect(snapshot.images.length).toBeLessThanOrEqual(MAX_IMAGES_PER_POST)
  assertCoverage({ side: 'starting', inputIds: starting.map((value) => value.uuid), images: snapshot.images })
  assertCoverage({ side: 'ending', inputIds: ending.map((value) => value.uuid), images: snapshot.images })
  expect(snapshotEventIds(snapshot).toSorted()).toEqual([...starting, ...ending].map((value) => value.uuid).toSorted())
})

test('assertCoverage fails when a row is lost, duplicated, miscounted or the post has too many images', () => {
  // 10件 → 4 + 4 行を表示し、残り2件は「ほか 2件」に隠れる。
  const starting = Array.from({ length: 10 }, (_, index) => startingToday(index + 1))
  const inputIds = starting.map((value) => value.uuid)
  const snapshot = required(daily(starting, []))
  const [first, second, empty] = snapshot.images
  if (first.type !== 'summary' || second.type !== 'summary') throw new Error('Unexpected fixture')
  expect(second.more).toBe(2)
  const check = (images: SocialSnapshot['images']) => () => assertCoverage({ side: 'starting', inputIds, images })
  expect(check(snapshot.images)).not.toThrow()
  // 分割のずれで2枚目の1行が取りこぼされた。
  expect(check([first, { ...second, rows: second.rows.slice(1) }, empty])).toThrow('do not match')
  // 同じ行が2回出る。
  expect(check([first, { ...second, rows: [first.rows[0], ...second.rows.slice(1)] }, empty])).toThrow('duplicated')
  // 「ほか N」が隠れた元イベント数と合わない。
  expect(check([first, { ...second, more: 1 }, empty])).toThrow('more')
  // 「ほか」が最後の画像以外に出る。
  expect(check([{ ...first, more: 1, hiddenEventIds: [uuid(1)] }, second, empty])).toThrow()
  // 見出しの件数が元イベント数と合わない。
  expect(check([{ ...first, total: 9 }, second, empty])).toThrow('total')
  // ページ番号が合わない。
  expect(check([first, { ...second, page: 1 }, empty])).toThrow('page')
  // 隠れた uuid が欠ける。
  expect(check([first, { ...second, hiddenEventIds: [] }, empty])).toThrow()
  // 画像が5枚以上。
  expect(check(Array.from({ length: 5 }, () => first))).toThrow('images')
  // 8行までに収まるのに隠している（隠してよいのは 4 + 4 行が埋まったときだけ）。
  const short = required(daily(starting.slice(0, 5), []))
  const [one, two, none] = short.images
  if (one.type !== 'summary' || two.type !== 'summary') throw new Error('Unexpected fixture')
  expect(() =>
    assertCoverage({
      side: 'starting',
      inputIds: inputIds.slice(0, 5),
      images: [one, { ...two, rows: [], more: 1, hiddenEventIds: [uuid(5)] }, none]
    })
  ).toThrow()
  // 0件側に画像が混ざる。
  expect(() => assertCoverage({ side: 'ending', inputIds: [], images: [first, second] })).toThrow()
})

test('assertCoverage accepts the empty side when the input is empty', () => {
  const snapshot = required(daily([startingToday(1)], []))
  expect(() => assertCoverage({ side: 'ending', inputIds: [], images: snapshot.images })).not.toThrow()
  expect(() => assertCoverage({ side: 'ending', inputIds: [uuid(2)], images: snapshot.images })).toThrow()
})

test('hidden events are public-checked too because snapshotEventIds includes them', () => {
  const starting = Array.from({ length: 10 }, (_, index) => startingToday(index + 1))
  const snapshot = required(
    daily(
      starting,
      [starting[9]].map((value) => endingToday(99, { uuid: value.uuid }))
    )
  )
  // 10件目は「ほか 1件」に隠れているが、公開確認の対象には含まれる。重複は取り除かれる。
  expect(snapshotEventIds(snapshot)).toContain(uuid(10))
  expect(snapshotEventIds(snapshot)).toHaveLength(10)
})

test('snapshot survives a JSON round trip and rejects malformed image combinations', () => {
  const snapshot = required(daily([startingToday(1)], [endingToday(2)]))
  expect(SocialSnapshotSchema.safeParse(JSON.parse(JSON.stringify(snapshot))).success).toBe(true)
  const [starting, ending] = snapshot.images
  // 終了 → 開始の順、片側だけ、5枚はいずれも不正。
  expect(SocialSnapshotSchema.safeParse({ ...snapshot, images: [ending, starting] }).success).toBe(false)
  expect(SocialSnapshotSchema.safeParse({ ...snapshot, images: [starting] }).success).toBe(false)
  expect(
    SocialSnapshotSchema.safeParse({ ...snapshot, images: Array.from({ length: 5 }, () => starting) }).success
  ).toBe(false)
  // 追加・更新は1件表示の画像1枚だけ。
  const single = { type: 'event', event: socialEventView(event(1)) }
  expect(SocialSnapshotSchema.safeParse({ ...snapshot, kind: 'created', images: [single] }).success).toBe(true)
  expect(SocialSnapshotSchema.safeParse({ ...snapshot, kind: 'created', images: [single, single] }).success).toBe(false)
  expect(SocialSnapshotSchema.safeParse({ ...snapshot, kind: 'created', images: [starting] }).success).toBe(false)
  expect(SocialSnapshotSchema.safeParse({ ...snapshot, images: [single, ending] }).success).toBe(false)
  // 旧形式（events / page）は読み替えない。
  expect(
    SocialSnapshotSchema.safeParse({
      kind: 'created',
      key: 'k',
      scheduledAt: MONDAY,
      text: 't',
      page: 1,
      pageCount: 1,
      events: []
    }).success
  ).toBe(false)
})
