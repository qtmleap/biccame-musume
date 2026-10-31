import { expect, test } from 'bun:test'
import {
  type BackfillEvent,
  buildBackfillStatements,
  countInsertRows,
  countSkipped,
  describePlan,
  groupEventRows,
  planEventCharacterBackfill
} from '../scripts/lib/backfill-event-characters'

const event = (eventId: string, storeKeys: string[], characterCount = 0): BackfillEvent => ({
  eventId,
  title: `title-${eventId}`,
  storeKeys,
  characterCount
})

test('1店舗のイベントは、その店舗の娘を1件入れる', () => {
  const plan = planEventCharacterBackfill([event('e1', ['akiba'])])
  expect(plan.inserts).toEqual([{ eventId: 'e1', title: 'title-e1', characterIds: ['akiba'] }])
  expect(plan.skipped).toEqual([])
  expect(plan.invalidStoreKeys).toEqual([])
  expect(countInsertRows(plan)).toBe(1)
})

test('複数店舗のイベントは、店舗ごとの娘を全部入れる（昇順）', () => {
  const plan = planEventCharacterBackfill([event('e1', ['shinyoko', 'akiba', 'chiba'])])
  expect(plan.inserts[0]?.characterIds).toEqual(['akiba', 'chiba', 'shinyoko'])
  expect(countInsertRows(plan)).toBe(3)
})

test('同じ店舗キーが重複していても、娘は重複なしで入れる', () => {
  const plan = planEventCharacterBackfill([event('e1', ['akiba', 'akiba', 'chiba', 'akiba'])])
  expect(plan.inserts[0]?.characterIds).toEqual(['akiba', 'chiba'])
})

test('店舗が0件のイベントは対象外で、理由 no-stores として数える', () => {
  const plan = planEventCharacterBackfill([event('e1', [])])
  expect(plan.inserts).toEqual([])
  expect(plan.skipped).toEqual([{ eventId: 'e1', title: 'title-e1', reason: 'no-stores' }])
  expect(countSkipped(plan)).toEqual({ 'has-characters': 0, 'no-stores': 1, 'no-valid-stores': 0 })
})

test('不正な店舗キーは書かずに報告し、有効なキーだけを入れる', () => {
  const plan = planEventCharacterBackfill([event('e1', ['akiba', 'not-a-store', 'other', 'secret'])])
  expect(plan.inserts[0]?.characterIds).toEqual(['akiba'])
  expect(plan.invalidStoreKeys.map((item) => item.storeKey)).toEqual(['not-a-store', 'other', 'secret'])
  expect(plan.invalidStoreKeys.every((item) => item.eventId === 'e1')).toBe(true)
})

test('有効な店舗キーが1つも無いイベントは、書かずに no-valid-stores で数える', () => {
  const plan = planEventCharacterBackfill([event('e1', ['not-a-store', ''])])
  expect(plan.inserts).toEqual([])
  expect(plan.skipped[0]?.reason).toBe('no-valid-stores')
  expect(plan.invalidStoreKeys).toHaveLength(2)
})

test('すでに娘のあるイベントは、店舗があっても対象外', () => {
  const plan = planEventCharacterBackfill([event('e1', ['akiba'], 1), event('e2', ['chiba'])])
  expect(plan.inserts.map((item) => item.eventId)).toEqual(['e2'])
  expect(plan.skipped).toEqual([{ eventId: 'e1', title: 'title-e1', reason: 'has-characters' }])
})

test('JOIN した行を、イベントごとに店舗をまとめて、店舗の無いイベントも残す', () => {
  const events = groupEventRows([
    { event_id: 'e1', title: 'one', store_key: 'akiba', character_count: 0 },
    { event_id: 'e1', title: 'one', store_key: 'chiba', character_count: 0 },
    { event_id: 'e2', title: 'two', store_key: null, character_count: 0 },
    { event_id: 'e3', title: 'three', store_key: 'honten', character_count: 2 }
  ])
  expect(events).toEqual([
    { eventId: 'e1', title: 'one', storeKeys: ['akiba', 'chiba'], characterCount: 0 },
    { eventId: 'e2', title: 'two', storeKeys: [], characterCount: 0 },
    { eventId: 'e3', title: 'three', storeKeys: ['honten'], characterCount: 2 }
  ])
})

test('SQL はイベントごとに1文で、ガードは1文に1回だけ、events には触れない', () => {
  const issued: string[] = []
  const newId = () => {
    const id = `id-${issued.length + 1}`
    issued.push(id)
    return id
  }
  const statements = buildBackfillStatements(
    [
      { eventId: 'e1', title: 't1', characterIds: ['akiba', 'chiba'] },
      { eventId: 'e2', title: 't2', characterIds: ['honten'] }
    ],
    { now: '2026-10-31T00:00:00.000+00:00', newId }
  )
  expect(statements).toHaveLength(2)
  for (const statement of statements) {
    expect(statement).not.toContain('\n')
    expect(statement.match(/NOT EXISTS/g)).toHaveLength(1)
    expect(statement).toContain('ON CONFLICT(event_id,character_id) DO NOTHING;')
    expect(statement).not.toMatch(/(UPDATE|DELETE)\s/i)
    expect(statement).not.toMatch(/INTO\s+events\b/i)
  }
  expect(statements[0]).toContain("('id-1','akiba'),('id-2','chiba')")
  expect(statements[0]).toContain("WHERE event_id='e1'")
  expect(statements[1]).toContain("('id-3','honten')")
})

test('SQL に埋め込めない文字を含む値は拒否する', () => {
  const context = { now: '2026-10-31T00:00:00.000+00:00', newId: () => 'id-1' }
  expect(() =>
    buildBackfillStatements([{ eventId: "e1'; DROP TABLE events;--", title: '', characterIds: ['akiba'] }], context)
  ).toThrow()
  expect(() =>
    buildBackfillStatements([{ eventId: 'e1', title: '', characterIds: ['akiba'] }], { ...context, now: "x'" })
  ).toThrow()
})

test('報告は件数・理由別の内訳・サンプルを含む', () => {
  const plan = planEventCharacterBackfill([
    event('e1', ['akiba', 'chiba']),
    event('e2', []),
    event('e3', ['akiba'], 1),
    event('e4', ['bad'])
  ])
  const report = describePlan(plan, 4).join('\n')
  expect(report).toContain('Events read: 4')
  expect(report).toContain('Targets (no characters, valid stores): 1')
  expect(report).toContain('Rows to insert into event_characters: 2')
  expect(report).toContain('Skipped: 3')
  expect(report).toContain('has-characters: 1')
  expect(report).toContain('no-stores: 1')
  expect(report).toContain('no-valid-stores: 1')
  expect(report).toContain('"title-e1": akiba->akiba, chiba->chiba')
})
