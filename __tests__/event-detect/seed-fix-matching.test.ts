import { afterEach, describe, expect, test } from 'bun:test'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { matchEvents, readFixSnapshot } from '../../scripts/lib/event-detect/seed-fix'
import { createSeedFixFixture } from './seed-fix-fixtures'
import { autoSpecs, emulatedEvents, reportFor, SEEDED_AT } from './seed-fix-scenarios'

const { cleanup, setup } = createSeedFixFixture()
afterEach(cleanup)
const MATCHED = autoSpecs.length

describe('matchEvents（1 対 1 の対応）', () => {
  const entriesOf = () => reportFor(SEEDED_AT).events.map((entry) => ({ ...entry, generatedAt: SEEDED_AT }))
  const emulatedOf = () =>
    emulatedEvents.map((event) => ({ ...event, posts: event.posts.map(({ postId, status }) => ({ postId, status })) }))

  test('作成時刻・店舗・開始日・題が全部一致するときだけ対応する。emulate の店舗か開始日が違えば対応しない', async () => {
    const { db } = await setup()
    const snapshot = readFixSnapshot(db)
    db.close()
    const entries = entriesOf()
    const emulated = emulatedOf()
    const ok = matchEvents(snapshot.events, entries, emulated)
    expect(ok.matched).toHaveLength(MATCHED)
    expect(ok.unmatched.map(({ reason }) => reason)).toEqual(['no_report_row', 'no_report_row'])

    // レポートの generatedAt が違う（別の実行で作った行を取り違えない）
    const later = matchEvents(
      snapshot.events,
      entries.map((entry) => ({ ...entry, generatedAt: '2026-10-09T14:48:52.679Z' })),
      emulated
    )
    expect(later.matched).toHaveLength(0)

    // emulate のイベントの開始日がレポートと違う（emulate をやり直して ID がずれた）
    const shifted = emulated.map((event) => (event.id === 'kashiwa-1' ? { ...event, startDate: '2026-07-02' } : event))
    const mismatch = matchEvents(snapshot.events, entries, shifted)
    expect(mismatch.unmatched.find(({ event }) => event.id === 'e-del-announce')?.reason).toBe('emulated_mismatch')
    const missing = matchEvents(
      snapshot.events,
      entries,
      emulated.filter((event) => event.id !== 'kashiwa-1')
    )
    expect(missing.unmatched.find(({ event }) => event.id === 'e-del-announce')?.reason).toBe('emulated_missing')
  })

  test('レポートに同じ組で別の emulatedId が 2 行あれば対応しない。D1 に同じ組が 2 件あっても対応しない', async () => {
    const { db } = await setup()
    const snapshot = readFixSnapshot(db)
    db.close()
    const entries = entriesOf()
    const emulated = emulatedOf()
    const twin = entries.find((entry) => entry.emulatedId === 'kashiwa-1')
    if (twin === undefined) throw new Error('no twin')
    const ambiguous = matchEvents(snapshot.events, [...entries, { ...twin, emulatedId: 'kashiwa-99' }], emulated)
    expect(ambiguous.unmatched.find(({ event }) => event.id === 'e-del-announce')?.reason).toBe('ambiguous_report')
    // 同じレポートを 2 回渡しても（同じ emulatedId なので）曖昧にはならない
    expect(matchEvents(snapshot.events, [...entries, ...entries], emulated).matched).toHaveLength(MATCHED)
    const copy = snapshot.events.find((event) => event.id === 'e-del-announce')
    if (copy === undefined) throw new Error('no event')
    const duplicated = matchEvents([...snapshot.events, { ...copy, id: 'e-copy' }], entries, emulated)
    expect(
      duplicated.unmatched
        .filter(({ reason }) => reason === 'ambiguous_d1')
        .map(({ event }) => event.id)
        .sort()
    ).toEqual(['e-copy', 'e-del-announce'])
  })

  test('D1 の created_at が +00:00 の形式に揃えられていても、Z 付きの generatedAt と同じ時刻なら対応する。読めない値は文字列のまま比べる', async () => {
    const { db } = await setup()
    const snapshot = readFixSnapshot(db)
    db.close()
    const entries = entriesOf()
    const emulated = emulatedOf()
    // 日時を揃えるマイグレーションの後と同じく、D1 側の created_at だけを Prisma の形式にする
    const normalized = snapshot.events.map((event) => ({ ...event, createdAt: toD1DateTime(event.createdAt) }))
    expect(normalized.every((event) => event.createdAt.endsWith('+00:00'))).toBe(true)
    expect(entries.every((entry) => entry.generatedAt.endsWith('Z'))).toBe(true)
    const ok = matchEvents(normalized, entries, emulated)
    expect(ok.matched).toHaveLength(MATCHED)
    expect(ok.unmatched.map(({ reason }) => reason)).toEqual(['no_report_row', 'no_report_row'])
    // 1 ミリ秒でもずれていれば別の実行の行として対応しない
    const later = matchEvents(
      normalized,
      entries.map((entry) => ({ ...entry, generatedAt: '2026-10-09T13:24:28.131Z' })),
      emulated
    )
    expect(later.matched).toHaveLength(0)

    // 時刻として読めない作成時刻は例外にせず、元の文字列どうしで比べる
    const unreadable = normalized.map((event) =>
      event.id === 'e-del-announce' ? { ...event, createdAt: 'not a date' } : event
    )
    const twin = entries.find((entry) => entry.emulatedId === 'kashiwa-1')
    if (twin === undefined) throw new Error('no twin')
    const withRaw = (generatedAt: string) =>
      matchEvents(
        unreadable,
        entries.map((entry) => (entry === twin ? { ...entry, generatedAt } : entry)),
        emulated
      )
    expect(withRaw('not a date').matched.some(({ event }) => event.id === 'e-del-announce')).toBe(true)
    expect(withRaw('NOT A DATE').unmatched.find(({ event }) => event.id === 'e-del-announce')?.reason).toBe(
      'no_report_row'
    )
  })
})
