import { expect, test } from 'bun:test'
import dayjs from 'dayjs'
import {
  conditionLabels,
  eventRow,
  formatPeriod,
  groupRows,
  type ImageEvent,
  splitTitle
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
