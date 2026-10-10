import { expect, test } from 'bun:test'
import { EventSearchSchema } from '../workers/app/src/schemas/event-search'
import * as eventStatus from '../workers/app/src/utils/event-status'

test('old events are hidden by default, while an explicit opt-out survives URL parsing', () => {
  // 省略は undefined のまま(既定の true は合成側で入れる)。不正値は「書かれている」まま既定の true に戻す。
  for (const [input, expected] of [
    [{}, undefined],
    [{ hideOldEvents: 'false' }, false],
    [{ hideOldEvents: 'invalid' }, true]
  ] as const) {
    const result = EventSearchSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.hideOldEvents).toBe(expected)
  }
})

test.each([
  ['2026-09-03T00:00:00+09:00', '2026-10-02', false],
  ['2026-09-03T23:59:59+09:00', '2026-10-03', true],
  ['2026-09-03T14:59:59Z', '2026-10-03', true],
  ['2026-09-03T15:00:00Z', '2026-10-03', false],
  ['2026-01-31T00:00:00+09:00', '2026-02-27', false],
  ['2026-01-31T00:00:00+09:00', '2026-02-28', true],
  ['2026-10-10T00:00:00+09:00', '2026-10-03', false]
] as const)('one calendar month in JST: %s at %s', (startDate, dateKey, expected) => {
  expect(eventStatus.hasEventStartedOneMonthAgo(startDate, dateKey)).toBe(expected)
})
