import { expect, test } from 'bun:test'
import dayjs from 'dayjs'
import {
  conditionLabels,
  eventRow,
  formatPeriod,
  groupRows,
  type ImageEvent,
  sinceLabel,
  splitByPhase,
  splitTitle,
  takeRows,
  untilLabel
} from '../../workers/app/src/images/format'

const jst = (day: string) => dayjs(`${day}T00:00:00+09:00`).toDate()

const event = (overrides: Partial<ImageEvent> = {}): ImageEvent => ({
  uuid: crypto.randomUUID(),
  title: 'バレンタイン名刺',
  category: 'limited_card',
  stores: ['kawasaki'],
  startDate: jst('2026-02-14'),
  endDate: jst('2026-03-14'),
  conditions: [],
  ...overrides
})

test('conditions_use_site_wording', () => {
  const uuid = crypto.randomUUID()
  expect(
    conditionLabels({
      conditions: [
        { uuid, type: 'purchase', purchaseAmount: 3000 },
        { uuid, type: 'first_come', quantity: 50 }
      ]
    })
  ).toEqual(['3,000円以上購入', '先着50名'])
  expect(conditionLabels({ conditions: [{ uuid, type: 'everyone' }], limitedQuantity: 100 })).toEqual([
    '全員配布',
    '限定100個'
  ])
  // 人数が分かっていれば限定数は重ねない
  expect(conditionLabels({ conditions: [{ uuid, type: 'lottery', quantity: 10 }], limitedQuantity: 10 })).toEqual([
    '抽選10名'
  ])
})

test('period_omits_year_unless_it_changes', () => {
  expect(formatPeriod(jst('2026-10-03'), jst('2026-10-31'))).toBe('10/3(土)〜10/31(土)')
  expect(formatPeriod(jst('2026-12-26'), jst('2027-01-05'))).toBe('12/26(土)〜2027/1/5(火)')
  expect(formatPeriod(jst('2026-02-14'), undefined)).toBe('2/14(土)〜')
})

test('same_campaign_across_stores_becomes_one_row', () => {
  const rows = groupRows(
    [
      event({ stores: ['chiba'] }),
      event({ stores: ['funabashi'] }),
      event({ stores: ['kashiwa'] }),
      event({ stores: ['hachioji'] }),
      event({ title: '夏名刺', stores: ['tenjin'] })
    ],
    () => '3/14(土)まで'
  )
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({
    title: 'バレンタイン名刺',
    stores: ['千葉駅前店', '船橋駅FACE店'],
    otherStoreCount: 2,
    portraits: ['chiba', 'funabashi', 'kashiwa'],
    note: '3/14(土)まで'
  })
})

test('differing_periods_and_conditions_are_not_merged_into_one_value', () => {
  const uuid = crypto.randomUUID()
  const [row] = groupRows(
    [
      event({ stores: ['ikenishi'], conditions: [{ uuid, type: 'first_come', quantity: 50 }] }),
      event({ stores: ['kawasaki'], conditions: [{ uuid, type: 'first_come', quantity: 70 }], endDate: undefined })
    ],
    (member) => (member.endDate ? 'まで' : '終了日未定')
  )
  expect(row.conditions).toEqual([])
  expect(row.note).toBe('店舗により異なる')
})

test('target_character_and_other_category', () => {
  const row = eventRow(
    event({ title: '缶バッジで繋ぐビッカメ娘旅', category: 'other', stores: ['chofu'], characterId: 'seiseki' })
  )
  expect(row.category).toBeNull()
  expect(row.character).toBe('せいせきたん')
  expect(row.portraits).toEqual(['seiseki'])
  expect(eventRow(event({ stores: ['chofu'], characterId: 'chofu' })).character).toBeNull()
  expect(eventRow(event({ stores: ['chofu'], characterId: 'secret' })).portraits).toEqual(['chofu'])
})

test('titles_break_at_natural_points', () => {
  expect(splitTitle('夏名刺', 11)).toEqual(['夏名刺'])
  expect(splitTitle('缶バッジで繋ぐビッカメ娘旅', 11)).toEqual(['缶バッジで', '繋ぐビッカメ娘旅'])
  expect(splitTitle('ビッカメ娘11周年記念名刺', 11)).toEqual(['ビッカメ娘', '11周年記念名刺'])
  expect(splitTitle('バレンタインデー&ホワイトデーコラボ名刺', 11)).toEqual([
    'バレンタインデー&',
    'ホワイトデーコラボ名刺'
  ])
  for (const title of ['スマホ用カードケース+擬人化10周年記念アクキー', '店舗誕生25周年記念アクスタ(再配布)']) {
    const lines = splitTitle(title, 13)
    expect(lines.join('')).toBe(title)
    expect(lines.every((line) => [...line].length <= 13)).toBe(true)
  }
})

test('events_are_split_into_starting_ongoing_and_ending', () => {
  const starting = event({ title: '今日から', startDate: jst('2026-02-14'), endDate: jst('2026-02-28') })
  const oneDay = event({ title: '今日だけ', startDate: jst('2026-02-14'), endDate: jst('2026-02-14') })
  const ending = event({ title: '今日まで', startDate: jst('2026-02-01'), endDate: jst('2026-02-14') })
  const later = event({ title: '月末まで', startDate: jst('2026-02-01'), endDate: jst('2026-02-28') })
  const sooner = event({ title: '来週まで', startDate: jst('2026-02-01'), endDate: jst('2026-02-20') })
  const open = event({ title: '終了日未定', startDate: jst('2026-01-01'), endDate: undefined })
  const stopped = event({
    title: '早期終了',
    startDate: jst('2026-02-01'),
    endDate: undefined,
    endedAt: jst('2026-02-10')
  })
  const future = event({ title: '来月', startDate: jst('2026-03-01'), endDate: jst('2026-03-31') })
  const phases = splitByPhase(
    [starting, oneDay, ending, later, sooner, open, stopped, future],
    '2026-02-14',
    '2026-02-14'
  )
  const titles = (list: ImageEvent[]) => list.map((item) => item.title)
  expect(titles(phases.starting)).toEqual(['今日から', '今日だけ'])
  expect(titles(phases.ongoing)).toEqual(['来週まで', '月末まで', '終了日未定'])
  expect(titles(phases.ending)).toEqual(['今日だけ', '今日まで'])
})

test('weekly_rows_respect_day_and_total_limits', () => {
  expect(takeRows([[1, 2, 3, 4], [5], [6, 7, 8]], 3, 5)).toEqual({ shown: [[1, 2, 3], [5], [6]], hidden: 3 })
  expect(takeRows([[1], [2]], 3, 7)).toEqual({ shown: [[1], [2]], hidden: 0 })
})

test('dates_outside_the_reference_year_carry_the_year', () => {
  const reference = jst('2026-06-26')
  expect(untilLabel({ endDate: jst('2026-07-26') }, reference)).toBe('7/26(日)まで')
  expect(untilLabel({ endDate: jst('2027-04-25') }, reference)).toBe('2027/4/25(日)まで')
  expect(untilLabel({ endDate: undefined }, reference)).toBe('終了日未定')
  expect(sinceLabel({ startDate: jst('2025-12-20') }, reference)).toBe('2025/12/20(土)から')
})
