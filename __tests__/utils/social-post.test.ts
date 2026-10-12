import { expect, test } from 'bun:test'
import {
  assertCoverage,
  buildSummarySnapshot,
  eventPeriodText,
  omitRepeatedDates,
  rowPeriodText,
  socialDayWindow,
  socialEventView,
  socialPostKey,
  socialWeekWindow,
  sortSideEvents,
  splitSideRows,
  summaryPostText
} from '@biccame/shared/domain/social-post'
import { SPECIAL_CHARACTER_NAMES } from '@biccame/shared/domain/special-character-names'
import { weightedLength } from '@biccame/shared/domain/tweet-text'
import { type Event, EventSchema } from '@biccame/shared/schemas/event.dto'
import {
  MAX_IMAGES_PER_POST,
  type SocialRow,
  type SocialSnapshot,
  SocialSnapshotSchema,
  type SocialSummaryImage,
  snapshotEventIds
} from '@biccame/shared/social'
import { storeCharacterContent } from '@/locales/app-dictionary/store-character-labels'

const MONDAY = '2026-10-12T00:00:00.000Z'
const uuid = (n: number) => `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`
const minute = (index: number) => String(index).padStart(2, '0')
const event = (n: number, input: Record<string, unknown> = {}): Event => {
  const parsed = EventSchema.safeParse({
    uuid: uuid(n),
    title: `イベント${n}`,
    category: 'limited_card',
    stores: ['akiba'],
    startDate: '2026-10-12T10:00:00+09:00',
    endDate: '2026-10-18T23:59:59+09:00',
    isVerified: true,
    isPreliminary: false,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    conditions: [],
    status: 'ongoing',
    daysUntil: 0,
    interestedCount: 0,
    completedCount: 0,
    ...input
  })
  if (!parsed.success) throw new Error('Invalid fixture')
  return parsed.data
}
/** 今日（2026-10-12 JST）に開始するイベント。時刻をずらして並びを決定的にする。 */
const startingToday = (n: number, input: Record<string, unknown> = {}) =>
  event(n, { title: `開始${n}`, startDate: `2026-10-12T10:${minute(n % 60)}:00+09:00`, ...input })
/** 今日（2026-10-12 JST）に終了するイベント。 */
const endingToday = (n: number, input: Record<string, unknown> = {}) =>
  event(n, {
    title: `終了${n}`,
    startDate: '2026-10-01T10:00:00+09:00',
    endDate: `2026-10-12T20:${minute(n % 60)}:00+09:00`,
    ...input
  })
const required = <Value>(value: Value | null): Value => {
  if (value === null) throw new Error('Expected a snapshot')
  return value
}
const daily = (starting: Event[], ending: Event[]) =>
  buildSummarySnapshot({ kind: 'daily', scheduledAt: MONDAY, starting, ending })
const weekly = (starting: Event[], ending: Event[]) =>
  buildSummarySnapshot({ kind: 'weekly', scheduledAt: MONDAY, starting, ending })
const summaries = (snapshot: SocialSnapshot, side: 'starting' | 'ending') =>
  snapshot.images.filter((image): image is SocialSummaryImage => image.type === 'summary' && image.side === side)
const sideRows = (snapshot: SocialSnapshot, side: 'starting' | 'ending') =>
  summaries(snapshot, side).map((image) => image.rows)

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
        trip(4, ['chofu'], { characterId: 'seiseki' }),
        trip(5, ['chofu'], { characterId: 'chofu' }),
        // 限定数が違えば別の行
        trip(6, ['akiba'], { limitedQuantity: 100 })
      ],
      []
    )
  )
  const [rows] = sideRows(snapshot, 'starting')
  expect(rows.map((row) => row.eventIds)).toEqual([[uuid(1), uuid(2), uuid(3)], [uuid(4)], [uuid(5)], [uuid(6)]])
  expect(rows[0].stores).toEqual(['JR八王子駅店', '渋谷ハチ公口店', 'アリオ八尾店'])
  expect(rows[0].avatar).toBe('hachioji')
  expect(rows[1].avatar).toBe('seiseki')
  expect(rows[1].target).toBe('せいせきたん')
  expect(rows[2].target).toBeNull()
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
      avatar: 'akiba',
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

test('period text distinguishes an open end, a one day event and an actual end', () => {
  const open = event(1, { endDate: undefined })
  expect(eventPeriodText(open)).toBe('10/12(月) 〜 終了日未定')
  expect(rowPeriodText(open, 'starting')).toBe('終了日未定')
  expect(rowPeriodText(open, 'ending')).toBeNull()
  const oneDay = event(2, { endDate: '2026-10-12T23:59:59+09:00' })
  expect(eventPeriodText(oneDay)).toBe('10/12(月) のみ')
  expect(rowPeriodText(oneDay, 'starting')).toBe('1日のみ')
  expect(rowPeriodText(oneDay, 'ending')).toBe('1日のみ')
  const normal = event(3)
  expect(eventPeriodText(normal)).toBe('10/12(月) 〜 10/18(日)')
  expect(rowPeriodText(normal, 'starting')).toBe('10/18(日)まで')
  expect(rowPeriodText(normal, 'ending')).toBeNull()
  // endedAt は endDate より優先する。
  const early = event(4, { endedAt: '2026-10-14T12:00:00+09:00' })
  expect(eventPeriodText(early)).toBe('10/12(月) 〜 10/14(水)')
  expect(rowPeriodText(early, 'starting')).toBe('10/14(水)まで')
  const sameDayEnd = event(5, { endedAt: '2026-10-12T18:00:00+09:00' })
  expect(rowPeriodText(sameDayEnd, 'starting')).toBe('1日のみ')
  // 同じ暦日でも JST で日付を判定する（UTC では前日になる 0 時台）。
  const midnight = event(6, { startDate: '2026-10-12T00:30:00+09:00', endDate: '2026-10-12T23:30:00+09:00' })
  expect(eventPeriodText(midnight)).toBe('10/12(月) のみ')
})

test('daily rows carry the period of the side and no left date', () => {
  const snapshot = required(
    daily(
      [
        startingToday(1),
        startingToday(2, { endDate: '2026-10-12T23:59:59+09:00' }),
        startingToday(3, { endDate: undefined })
      ],
      [endingToday(4), endingToday(5, { startDate: '2026-10-12T00:00:00+09:00' })]
    )
  )
  const [starting] = sideRows(snapshot, 'starting')
  expect(starting.map((row) => row.period)).toEqual(['10/18(日)まで', '1日のみ', '終了日未定'])
  const [ending] = sideRows(snapshot, 'ending')
  expect(ending.map((row) => row.period)).toEqual([null, '1日のみ'])
  expect([...starting, ...ending].every((row) => row.date === null)).toBe(true)
})

test('weekly rows keep the date at the left edge and omit it on following rows with the same date', () => {
  const at = (day: number, n: number) => startingToday(n, { startDate: `2026-10-${day}T10:${minute(n)}:00+09:00` })
  const snapshot = required(
    weekly(
      [at(12, 1), at(12, 2), at(13, 3), at(13, 4), at(13, 5), at(14, 6)],
      [
        endingToday(7, { endDate: '2026-10-13T12:00:00+09:00' }),
        endingToday(8, { endDate: '2026-10-13T13:00:00+09:00' }),
        endingToday(9, { endDate: '2026-10-18T13:00:00+09:00' })
      ]
    )
  )
  const [first, second] = sideRows(snapshot, 'starting')
  // 日付の省略は画像ごとに判定する。2枚目の先頭行は同じ火曜でも日付を再表示する。
  expect(first.map((row) => row.date)).toEqual(['10/12(月)', null, '10/13(火)', null])
  expect(second.map((row) => row.date)).toEqual(['10/13(火)', '10/14(水)'])
  const [ending] = sideRows(snapshot, 'ending')
  expect(ending.map((row) => row.date)).toEqual(['10/13(火)', null, '10/18(日)'])
  // 開始側の期間は右側の行に残り、終了側は期間を出さない。
  expect(first[0].period).toBe('10/18(日)まで')
  expect(ending[0].period).toBeNull()
  expect(snapshot.images.map((image) => image.type === 'summary' && image.headline)).toEqual(
    Array.from({ length: 3 }, () => '10/12(月)〜10/18(日)')
  )
})

test('omitRepeatedDates keeps null dates and only drops equal neighbours', () => {
  const row = (date: string | null): SocialRow => ({
    eventIds: [crypto.randomUUID()],
    title: 't',
    stores: ['AKIBA店'],
    avatar: 'akiba',
    target: null,
    period: null,
    date
  })
  expect(
    omitRepeatedDates([row('1/1(月)'), row('1/1(月)'), row('1/2(火)'), row('1/1(月)'), row(null)]).map((r) => r.date)
  ).toEqual(['1/1(月)', null, '1/2(火)', '1/1(月)', null])
})

test('ending rows are ordered by the actual end first and then by uuid', () => {
  const late = endingToday(1, { endDate: '2026-10-12T23:59:59+09:00', endedAt: '2026-10-12T10:00:00+09:00' })
  const mid = endingToday(2, { endDate: '2026-10-12T12:00:00+09:00' })
  const tie = endingToday(3, { endDate: '2026-10-12T12:00:00+09:00' })
  expect(sortSideEvents('ending', [tie, mid, late]).map((value) => value.uuid)).toEqual([uuid(1), uuid(2), uuid(3)])
  const starts = [startingToday(3), startingToday(2, { startDate: '2026-10-12T00:00:00+09:00' }), startingToday(1)]
  expect(sortSideEvents('starting', starts).map((value) => value.uuid)).toEqual([uuid(2), uuid(1), uuid(3)])
  const snapshot = required(daily([], [tie, mid, late]))
  expect(sideRows(snapshot, 'ending')[0].map((row) => row.eventIds[0])).toEqual([uuid(1), uuid(2), uuid(3)])
})

test('week and day windows follow JST midnight and the Monday boundary', () => {
  const week = socialWeekWindow(MONDAY)
  expect(week).toEqual({
    monday: '2026-10-12',
    sunday: '2026-10-18',
    headline: '10/12(月)〜10/18(日)',
    from: '2026-10-11T15:00:00.000Z',
    until: '2026-10-18T15:00:00.000Z'
  })
  // 日曜 23:59:59 (JST) は同じ週、月曜 0:00:00 (JST) ちょうどは次の週。
  expect(socialWeekWindow('2026-10-18T14:59:59Z').monday).toBe('2026-10-12')
  expect(socialWeekWindow('2026-10-18T15:00:00Z').monday).toBe('2026-10-19')
  expect(socialWeekWindow('2026-10-11T14:59:59Z').monday).toBe('2026-10-05')
  expect(socialDayWindow('2026-10-11T15:00:00Z').day).toBe('2026-10-12')
  expect(socialDayWindow('2026-10-11T14:59:59Z').day).toBe('2026-10-11')
  expect(socialPostKey('daily', MONDAY)).toBe('daily:2026-10-12')
  expect(socialPostKey('weekly', '2026-10-15T00:00:00Z')).toBe('weekly:2026-10-12')
})

test('weekly accepts the Monday midnight start and the Sunday 23:59 end and rejects the next Monday', () => {
  const start = (iso: string) => weekly([startingToday(1, { startDate: iso })], [])
  expect(start('2026-10-12T00:00:00+09:00')).not.toBeNull()
  expect(() => start('2026-10-19T00:00:00+09:00')).toThrow('outside')
  expect(() => start('2026-10-11T23:59:59+09:00')).toThrow('outside')
  const end = (iso: string, endedAt?: string) =>
    weekly([], [endingToday(1, { endDate: iso, ...(endedAt === undefined ? {} : { endedAt }) })])
  expect(end('2026-10-18T23:59:59+09:00')).not.toBeNull()
  expect(() => end('2026-10-19T00:00:00+09:00')).toThrow('outside')
  // endedAt が優先: 予定は週内でも実際の終了が前の週なら範囲外、その逆なら範囲内。
  expect(() => end('2026-10-14T12:00:00+09:00', '2026-10-11T12:00:00+09:00')).toThrow('outside')
  expect(end('2026-10-25T12:00:00+09:00', '2026-10-14T12:00:00+09:00')).not.toBeNull()
  // 終了日が不明なイベントは終了の一覧に入れない。
  expect(() => weekly([], [endingToday(1, { endDate: undefined })])).toThrow('outside')
})

test('daily rejects events whose day is not today', () => {
  expect(() => daily([startingToday(1, { startDate: '2026-10-13T00:00:00+09:00' })], [])).toThrow('outside')
  expect(() => daily([], [endingToday(1, { endDate: '2026-10-11T23:59:59+09:00' })])).toThrow('outside')
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

test('single event view resolves stores, avatars, target, period and conditions', () => {
  const multi = socialEventView(
    event(1, {
      stores: ['hachioji', 'shibuhachi', 'yao', 'nagoya'],
      conditions: [
        { uuid: crypto.randomUUID(), type: 'lottery', quantity: 30 },
        { uuid: crypto.randomUUID(), type: 'purchase', purchaseAmount: 1500 }
      ],
      limitedQuantity: 50
    })
  )
  expect(multi.avatars).toEqual(['hachioji', 'shibuhachi', 'yao'])
  expect(multi.target).toBeNull()
  expect(multi.stores).toHaveLength(4)
  expect(multi.conditions).toEqual(['抽選30名', '1,500円以上購入', '限定50個'])
  expect(multi.period).toBe('10/12(月) 〜 10/18(日)')
  const explicit = socialEventView(event(2, { stores: ['chofu', 'hachioji'], characterId: 'seiseki' }))
  expect(explicit.avatars).toEqual(['seiseki'])
  expect(explicit.target).toBe('せいせきたん')
  const secret = socialEventView(event(3, { characterId: 'secret' }))
  expect(secret.avatars).toEqual(['secret'])
  expect(secret.target).toBe('シークレット')
  const other = socialEventView(event(4, { characterId: 'other' }))
  expect(other.avatars).toEqual(['other'])
  expect(other.target).toBe('その他')
  expect(socialEventView(event(5, { stores: ['akiba'], characterId: 'akiba' })).target).toBeNull()
})

test('special character names match the site badge labels', () => {
  expect(SPECIAL_CHARACTER_NAMES).toEqual(storeCharacterContent.special_character)
})

test('rows show a target only when every merged event points to the same character', () => {
  const snapshot = required(
    daily(
      [
        startingToday(1, { title: 'A', stores: ['chofu'], characterId: 'seiseki' }),
        startingToday(2, { title: 'A', stores: ['chofu'], characterId: 'seiseki' }),
        startingToday(3, { title: 'B', characterId: 'secret' }),
        startingToday(4, { title: 'C' })
      ],
      []
    )
  )
  const [rows] = sideRows(snapshot, 'starting')
  expect(rows.map((row) => row.target)).toEqual(['せいせきたん', 'シークレット', null])
  expect(rows.map((row) => row.avatar)).toEqual(['seiseki', 'secret', 'akiba'])
})
