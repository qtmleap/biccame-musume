import { expect, test } from 'bun:test'
import { duplicateWebhookEvents, validateWebhookEvent } from '@api/services/webhook-jobs'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import dayjs from 'dayjs'
import {
  DATETIME_COLUMNS,
  nonCanonicalDateTimes,
  normalize,
  request,
  snapshot
} from './fixtures/social-event-datetimes'
import { insert, uuid, withDatabase } from './fixtures/social-event-selection-db'

test('datetime normalization migration rewrites legacy integer rows to Prisma text idempotently', async () => {
  await withDatabase(async (env, select) => {
    const legacy = {
      start: dayjs('2026-10-12T10:00:00.123+09:00').valueOf(),
      end: dayjs('2026-10-18T23:59:59.999+09:00').valueOf(),
      judged: dayjs('2026-10-11T00:00:00.456Z').valueOf(),
      stamp: dayjs('2026-10-11T12:34:56.007Z').valueOf()
    }
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO events (id,category,title,start_date,end_date,is_verified,clef_judged_at,created_at,updated_at)
        VALUES (?,'limited_card','旧形式',?,?,1,?,?,?)`).bind(
        uuid(1),
        legacy.start,
        legacy.end,
        legacy.judged,
        legacy.stamp,
        legacy.stamp
      ),
      env.DB.prepare(
        "INSERT INTO event_conditions (id,event_id,type,created_at,updated_at) VALUES (?,?,'everyone',?,?)"
      ).bind(crypto.randomUUID(), uuid(1), legacy.stamp, legacy.stamp),
      env.DB.prepare(
        "INSERT INTO event_reference_urls (id,event_id,type,url,created_at,updated_at) VALUES (?,?,'announce','https://example.com/legacy',?,?)"
      ).bind(crypto.randomUUID(), uuid(1), legacy.stamp, legacy.stamp),
      env.DB.prepare(
        "INSERT INTO event_stores (id,event_id,store_key,created_at,updated_at) VALUES (?,?,'akiba',?,?)"
      ).bind(crypto.randomUUID(), uuid(1), legacy.stamp, legacy.stamp)
    ])
    await insert(env, { id: 2, start: '2026-10-12T00:00:00+09:00' })
    const textRow = (await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(uuid(2)).all()).results
    // 変換前は INTEGER < TEXT の型順序で、本日開始の範囲検索から外れる。
    expect(await select('starting', { now: '2026-10-12T09:00:00+09:00' })).toEqual([uuid(2)])

    await normalize(env)
    expect(
      (
        await env.DB.prepare(
          'SELECT start_date AS startDate,end_date AS endDate,ended_at AS endedAt,clef_judged_at AS judgedAt,created_at AS createdAt,updated_at AS updatedAt FROM events WHERE id=?'
        )
          .bind(uuid(1))
          .all()
      ).results
    ).toEqual([
      {
        startDate: '2026-10-12T01:00:00.123+00:00',
        endDate: '2026-10-18T14:59:59.999+00:00',
        endedAt: null,
        judgedAt: '2026-10-11T00:00:00.456+00:00',
        createdAt: '2026-10-11T12:34:56.007+00:00',
        updatedAt: '2026-10-11T12:34:56.007+00:00'
      }
    ])
    // マイグレーションの出力とアプリ側ヘルパーの出力がバイト単位で一致すること。
    expect(
      await env.DB.prepare('SELECT start_date FROM events WHERE id=?').bind(uuid(1)).first<string>('start_date')
    ).toBe(toD1DateTime(legacy.start))
    for (const table of ['event_conditions', 'event_reference_urls', 'event_stores']) {
      expect(
        (
          await env.DB.prepare(`SELECT created_at AS createdAt,updated_at AS updatedAt FROM ${table} WHERE event_id=?`)
            .bind(uuid(1))
            .all()
        ).results
      ).toEqual([{ createdAt: toD1DateTime(legacy.stamp), updatedAt: toD1DateTime(legacy.stamp) }])
    }
    expect(await nonCanonicalDateTimes(env)).toEqual([])
    expect((await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(uuid(2)).all()).results).toEqual(textRow)

    const converted = await snapshot(env)
    await normalize(env)
    expect(await snapshot(env)).toEqual(converted)
    expect(await select('starting', { now: '2026-10-12T09:00:00+09:00' })).toEqual([uuid(2), uuid(1)])
  })
}, 60000)

test('datetime text normalization rewrites Z, offset, second-only and space-separated values to the Prisma form', async () => {
  await withDatabase(async (env, select) => {
    const insertRaw = (
      id: number,
      dates: { start: string; end: string; judged: string | null; created: string; updated: string }
    ) => [
      env.DB.prepare(`INSERT INTO events (id,category,title,start_date,end_date,is_verified,clef_judged_at,created_at,updated_at)
        VALUES (?,'limited_card','旧文字列形式',?,?,1,?,?,?)`).bind(
        uuid(id),
        dates.start,
        dates.end,
        dates.judged,
        dates.created,
        dates.updated
      ),
      env.DB.prepare(
        "INSERT INTO event_conditions (id,event_id,type,created_at,updated_at) VALUES (?,?,'everyone',?,?)"
      ).bind(crypto.randomUUID(), uuid(id), dates.created, dates.updated),
      env.DB.prepare(
        "INSERT INTO event_reference_urls (id,event_id,type,url,created_at,updated_at) VALUES (?,?,'announce',?,?,?)"
      ).bind(crypto.randomUUID(), uuid(id), `https://example.com/legacy/${id}`, dates.created, dates.updated),
      env.DB.prepare(
        "INSERT INTO event_stores (id,event_id,store_key,created_at,updated_at) VALUES (?,?,'akiba',?,?)"
      ).bind(crypto.randomUUID(), uuid(id), dates.created, dates.updated)
    ]
    // ローカルの seed が書いていた Z 付きの形式
    const zulu = {
      start: '2026-10-19T15:00:00.000Z',
      end: '2026-10-25T14:59:59.000Z',
      judged: null,
      created: '2026-10-09T03:00:00.000Z',
      updated: '2026-10-09T03:00:00.000Z'
    }
    // +09:00 のオフセット付き、秒まで、CURRENT_TIMESTAMP の空白区切り。clef_judged_at は読めない文字列のまま残る
    const mixed = {
      start: '2026-10-12T20:00:00+09:00',
      end: '2026-10-18T14:59:59Z',
      judged: 'not a date',
      created: '2026-10-11 12:34:56',
      updated: '2026-10-11T12:34:56Z'
    }
    await env.DB.batch([...insertRaw(1, zulu), ...insertRaw(2, mixed)])
    await insert(env, { id: 3, start: '2026-10-12T00:00:00+09:00' })
    const canonicalRows = async () =>
      Promise.all(
        Object.keys(DATETIME_COLUMNS).map(
          async (table) =>
            (
              await env.DB.prepare(
                `SELECT * FROM ${table} WHERE ${table === 'events' ? 'id' : 'event_id'}=? ORDER BY id`
              )
                .bind(uuid(3))
                .all()
            ).results
        )
      )
    const canonicalBefore = await canonicalRows()
    const incoming = validateWebhookEvent(
      { ...request(9, { startDate: '2026-10-20', characterIds: [] }), shouldTweet: false },
      uuid(9)
    )
    const sourceUrl = 'https://x.com/bic_akiba/status/2109221721773576999'
    // 変換前は文字列の比較で、Z 付きの行は重複検索に当たらず、+09:00 の行は本日開始の範囲から外れる。
    expect(await duplicateWebhookEvents(env, incoming, sourceUrl)).toEqual([])
    expect(await select('starting', { now: '2026-10-12T09:00:00+09:00' })).toEqual([uuid(3)])

    await normalize(env)
    const row = async (id: number) =>
      (
        await env.DB.prepare(
          'SELECT start_date AS startDate,end_date AS endDate,clef_judged_at AS judgedAt,created_at AS createdAt,updated_at AS updatedAt FROM events WHERE id=?'
        )
          .bind(uuid(id))
          .all()
      ).results
    expect(await row(1)).toEqual([
      {
        startDate: '2026-10-19T15:00:00.000+00:00',
        endDate: '2026-10-25T14:59:59.000+00:00',
        judgedAt: null,
        createdAt: '2026-10-09T03:00:00.000+00:00',
        updatedAt: '2026-10-09T03:00:00.000+00:00'
      }
    ])
    expect(await row(2)).toEqual([
      {
        startDate: toD1DateTime(mixed.start),
        endDate: '2026-10-18T14:59:59.000+00:00',
        judgedAt: 'not a date',
        createdAt: '2026-10-11T12:34:56.000+00:00',
        updatedAt: '2026-10-11T12:34:56.000+00:00'
      }
    ])
    expect(toD1DateTime(mixed.start)).toBe('2026-10-12T11:00:00.000+00:00')
    // 読めない文字列だけが残り、それ以外はすべて正規形になる。
    expect(await nonCanonicalDateTimes(env)).toEqual([
      { table: 'events', column: 'clef_judged_at', value: 'not a date' }
    ])
    // 正規形だった行は 1 列も変わらない。
    expect(await canonicalRows()).toEqual(canonicalBefore)
    const converted = await snapshot(env)
    await normalize(env)
    expect(await snapshot(env)).toEqual(converted)
    expect(await duplicateWebhookEvents(env, incoming, sourceUrl)).toEqual([uuid(1)])
    expect(await select('starting', { now: '2026-10-12T09:00:00+09:00' })).toEqual([uuid(3), uuid(2)])
  })
}, 60000)
