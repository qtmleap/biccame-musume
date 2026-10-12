import { expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createEvent, updateEvent } from '@api/services/event-service'
import { resolveWebhookJob } from '@api/services/webhook-admin'
import {
  claimWebhookJob,
  duplicateWebhookEvents,
  getWebhookJob,
  insertWebhookJob,
  registerWebhookEvent,
  validateWebhookEvent
} from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { build } from 'esbuild'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { z } from 'zod'

const root = resolve(import.meta.dirname, '..')
const bundle = build({
  stdin: {
    contents: `
    import { createEvent,getEventsStartingToday,getEventsEndingToday,getEventsStartingInWeek,getEventsEndingInWeek } from './workers/web/src/api/services/event-service.ts'
    import dayjs from 'dayjs'
    export default { async fetch(request,env) {
      const url=new URL(request.url)
      if (url.pathname==='/create') return Response.json((await createEvent(env,await request.json())).event.uuid)
      const events=url.pathname==='/starting'
        ? await getEventsStartingToday(env,dayjs(url.searchParams.get('now')).toDate())
        : url.pathname==='/ending'
          ? await getEventsEndingToday(env,dayjs(url.searchParams.get('now')).toDate())
          : url.pathname==='/weekStarting'
            ? await getEventsStartingInWeek(env,url.searchParams.get('from'),url.searchParams.get('until'))
            : await getEventsEndingInWeek(env,url.searchParams.get('from'),url.searchParams.get('until'))
      return Response.json(events.map(event=>event.uuid))
    } }
  `,
    resolveDir: root,
    sourcefile: 'social-selection-entry.ts',
    loader: 'ts'
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  outdir: 'out',
  conditions: ['workerd', 'worker', 'browser'],
  mainFields: ['module', 'main'],
  jsx: 'automatic',
  external: ['fs', 'path', 'crypto', 'node:*'],
  alias: { '@': resolve(root, 'workers/web/src/app'), '@api': resolve(root, 'workers/web/src/api') },
  plugins: [
    {
      name: 'prisma-wasm-module',
      setup(builder) {
        builder.onResolve({ filter: /\/query_compiler_fast_bg\.wasm$/ }, () => ({
          path: './query_compiler_fast_bg.wasm',
          external: true
        }))
        builder.onResolve({ filter: /\.wasm\?module$/ }, (args) => ({
          path: resolve(args.resolveDir, args.path.replace(/\?module$/, '')),
          namespace: 'wasm-module'
        }))
        builder.onLoad({ filter: /.*/, namespace: 'wasm-module' }, (args) => ({
          contents: `import wasm from ${JSON.stringify(args.path)}; export default wasm;`,
          resolveDir: root,
          loader: 'js'
        }))
      }
    },
    {
      name: 'harfbuzz-workers',
      setup(builder) {
        builder.onResolve({ filter: /^harfbuzzjs$/ }, () => ({
          path: resolve(root, 'workers/web/src/api/lib/harfbuzz-workers.ts')
        }))
      }
    }
  ],
  loader: { '.wasm': 'file' },
  assetNames: '[name]'
})
type Select = (
  kind: 'starting' | 'ending' | 'weekStarting' | 'weekEnding',
  params: Record<string, string>
) => Promise<string[]>
/** Worker 内の Prisma 経路 (shouldTweet=false の createEvent) でイベントを作る。 */
type PrismaCreate = (request: EventRequest) => Promise<void>
const uuid = (id: number) => `550e8400-e29b-41d4-a716-${String(id).padStart(12, '0')}`
const migrationSql = async (name: string) =>
  (await readFile(resolve(root, 'prisma/migrations', name, 'migration.sql'), 'utf8'))
    .replace(/^--.*$/gm, '')
    .replace(/\n/g, ' ')
const withDatabase = async (run: (env: Bindings, select: Select, create: PrismaCreate) => Promise<void>) => {
  const result = await bundle
  const modules = result.outputFiles
    .slice()
    .sort((a, b) => Number(b.path.endsWith('.js')) - Number(a.path.endsWith('.js')))
    .map((file) => ({
      type: file.path.endsWith('.js') ? ('ESModule' as const) : ('CompiledWasm' as const),
      path: file.path,
      contents: file.path.endsWith('.js')
        ? file.text.replace(/var (\w+) = "\.\/(\w[\w.-]*\.wasm)";/g, 'import $1 from "./$2";')
        : file.contents
    }))
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'social-event-selection-test',
      modules: [
        ...modules,
        {
          type: 'CompiledWasm',
          path: resolve(root, 'out/query_compiler_fast_bg.wasm'),
          contents: await readFile(
            resolve(root, 'workers/web/src/api/db/generated/prisma/internal/query_compiler_fast_bg.wasm')
          )
        }
      ],
      compatibilityDate: '2026-05-11',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB']
    })
  )
  try {
    const env = await mf.getBindings<Bindings>()
    // 本番と同じ列型 (DATETIME) で検証するため、実際のマイグレーションを順に適用する。
    const migrations = (await readdir(resolve(root, 'prisma/migrations'), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations) await env.DB.exec(await migrationSql(name))
    await run(
      env,
      async (kind, params) => {
        const response = await mf.dispatchFetch(`http://localhost/${kind}?${new URLSearchParams(params)}`)
        if (!response.ok) throw new Error(await response.text())
        const parsed = z.array(z.uuid()).safeParse(await response.json())
        if (!parsed.success) throw new Error('Invalid event selection response')
        return parsed.data
      },
      async (request) => {
        const response = await mf.dispatchFetch('http://localhost/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
        if (!response.ok) throw new Error(await response.text())
      }
    )
  } finally {
    await mf.dispose()
  }
}
const insert = async (
  env: Bindings,
  input: {
    id: number
    start: string
    end?: string
    actual?: string
    verified?: boolean
    preliminary?: boolean
  }
) => {
  const now = toD1DateTime(dayjs())
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO events (id,category,title,start_date,end_date,ended_at,is_verified,is_preliminary,created_at,updated_at)
      VALUES (?,'limited_card','テストイベント',?,?,?,?,?,?,?)`).bind(
      uuid(input.id),
      toD1DateTime(input.start),
      input.end === undefined ? null : toD1DateTime(input.end),
      input.actual === undefined ? null : toD1DateTime(input.actual),
      input.verified === false ? 0 : 1,
      input.preliminary === true ? 1 : 0,
      now,
      now
    ),
    env.DB.prepare(
      "INSERT INTO event_stores (id,event_id,store_key,created_at,updated_at) VALUES (?,?,'akiba',?,?)"
    ).bind(crypto.randomUUID(), uuid(input.id), now, now)
  ])
}

test('starting selection keeps planned ends valid throughout the JST day and excludes all marked-ended events', async () => {
  await withDatabase(async (env, select) => {
    const start = '2026-10-12T00:00:00+09:00'
    await insert(env, { id: 1, start })
    await insert(env, { id: 2, start, end: '2026-10-12T08:59:59+09:00' })
    await insert(env, { id: 3, start, end: '2026-10-13T23:59:59+09:00', actual: '2026-10-12T08:00:00+09:00' })
    await insert(env, { id: 4, start, preliminary: true })
    await insert(env, { id: 5, start, verified: false })
    await insert(env, { id: 6, start: '2026-10-11T23:59:59+09:00' })
    await insert(env, { id: 7, start: '2026-10-13T00:00:00+09:00' })
    await insert(env, { id: 8, start, end: '2026-10-12T08:00:00+09:00', actual: '2026-10-12T10:00:00+09:00' })
    await insert(env, { id: 9, start, end: '2026-10-12T00:00:00+09:00' })
    await insert(env, { id: 10, start, end: '2026-10-11T23:59:59+09:00' })
    const events = await select('starting', { now: '2026-10-12T09:00:00+09:00' })
    expect(events.sort()).toEqual([uuid(1), uuid(2), uuid(4), uuid(9)])
  })
}, 60000)

test('ending selection prioritizes actual end and includes only the JST day even across UTC boundaries', async () => {
  await withDatabase(async (env, select) => {
    const start = '2026-10-01T00:00:00+09:00'
    await insert(env, { id: 1, start, end: '2026-10-18T23:59:59+09:00', actual: '2026-10-12T00:00:00+09:00' })
    await insert(env, { id: 2, start, end: '2026-10-12T23:59:59+09:00', actual: '2026-10-11T23:59:59+09:00' })
    await insert(env, { id: 3, start, end: '2026-10-12T23:59:59+09:00', actual: '2026-10-13T00:00:00+09:00' })
    await insert(env, { id: 4, start, end: '2026-10-12T23:59:59+09:00' })
    await insert(env, { id: 5, start, actual: '2026-10-12T23:59:59+09:00' })
    await insert(env, { id: 6, start, end: '2026-10-12T23:59:59+09:00', verified: false })
    await insert(env, { id: 7, start })
    const events = await select('ending', { now: '2026-10-12T09:00:00+09:00' })
    expect(events.sort()).toEqual([uuid(1), uuid(4), uuid(5)])
  })
}, 60000)

/** JST の月曜 0 時以上、翌月曜 0 時未満（2026-10-12 の週）。 */
const WEEK = { from: '2026-10-11T15:00:00.000Z', until: '2026-10-18T15:00:00.000Z' }

test('weekly start selection uses the JST Monday boundaries and only public events', async () => {
  await withDatabase(async (env, select) => {
    await insert(env, { id: 1, start: '2026-10-12T00:00:00+09:00' })
    await insert(env, { id: 2, start: '2026-10-11T23:59:59+09:00' })
    await insert(env, { id: 3, start: '2026-10-18T23:59:59+09:00' })
    await insert(env, { id: 4, start: '2026-10-19T00:00:00+09:00' })
    await insert(env, { id: 5, start: '2026-10-14T00:00:00+09:00', verified: false })
    await insert(env, { id: 6, start: '2026-10-14T00:00:00+09:00', preliminary: true })
    // 週の前に始まった継続中のイベントは、開始の一覧に入らない。
    await insert(env, { id: 7, start: '2026-10-01T00:00:00+09:00', end: '2026-10-30T23:59:59+09:00' })
    expect((await select('weekStarting', WEEK)).sort()).toEqual([uuid(1), uuid(3), uuid(6)])
  })
}, 60000)

test('weekly end selection prefers the actual end, uses the JST Monday boundaries and skips unknown ends', async () => {
  await withDatabase(async (env, select) => {
    const start = '2026-10-01T00:00:00+09:00'
    await insert(env, { id: 1, start, end: '2026-10-12T00:00:00+09:00' })
    await insert(env, { id: 2, start, end: '2026-10-11T23:59:59+09:00' })
    await insert(env, { id: 3, start, end: '2026-10-18T23:59:59+09:00' })
    await insert(env, { id: 4, start, end: '2026-10-19T00:00:00+09:00' })
    // endedAt が優先: 予定は週内でも実際の終了が前の週なら対象外、予定が週外でも実際の終了が週内なら対象。
    await insert(env, { id: 5, start, end: '2026-10-14T12:00:00+09:00', actual: '2026-10-11T12:00:00+09:00' })
    await insert(env, { id: 6, start, end: '2026-10-25T12:00:00+09:00', actual: '2026-10-14T12:00:00+09:00' })
    // 終了日不明は終了の一覧に入れない。
    await insert(env, { id: 7, start })
    await insert(env, { id: 8, start, end: '2026-10-14T12:00:00+09:00', verified: false })
    expect((await select('weekEnding', WEEK)).sort()).toEqual([uuid(1), uuid(3), uuid(6)])
  })
}, 60000)

// 週次の開始は日次の開始と違い、endedAt 付きや予定終了済みのイベントも除外しない。
// 週次は月曜朝に「これから始まる週」を出す用途で、週内に開始日があれば載せる意図的な差（日次は上の starting のテスト）。
test('weekly start selection intentionally keeps events with an actual end or a planned end already passed', async () => {
  await withDatabase(async (env, select) => {
    const start = '2026-10-14T00:00:00+09:00'
    await insert(env, { id: 1, start })
    await insert(env, { id: 2, start, end: '2026-10-14T08:00:00+09:00' })
    await insert(env, { id: 3, start, end: '2026-10-20T23:59:59+09:00', actual: '2026-10-14T09:00:00+09:00' })
    await insert(env, { id: 4, start, end: '2026-10-14T00:00:00+09:00', actual: '2026-10-14T00:00:00+09:00' })
    // 週外に開始したものは、終了の状態によらず対象外のまま。
    await insert(env, { id: 5, start: '2026-10-19T00:00:00+09:00', actual: '2026-10-19T09:00:00+09:00' })
    expect((await select('weekStarting', WEEK)).sort()).toEqual([uuid(1), uuid(2), uuid(3), uuid(4)])
  })
}, 60000)

/** 生SQLの保存経路が書く Prisma の DateTime 列。 */
const DATETIME_COLUMNS = {
  events: ['start_date', 'end_date', 'ended_at', 'clef_judged_at', 'created_at', 'updated_at'],
  event_conditions: ['created_at', 'updated_at'],
  event_reference_urls: ['created_at', 'updated_at'],
  event_stores: ['created_at', 'updated_at']
} as const
const request = (id: number, input: Partial<EventRequest> & Pick<EventRequest, 'startDate'>): EventRequest => ({
  uuid: uuid(id),
  category: 'limited_card',
  title: `テストイベント${id}`,
  isVerified: true,
  isPreliminary: false,
  shouldTweet: true,
  conditions: [{ uuid: crypto.randomUUID(), type: 'everyone' }],
  referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce', url: `https://example.com/events/${id}` }],
  stores: ['akiba'],
  ...input
})
const withPosting = (env: Bindings) =>
  Object.assign(env, { ENVIRONMENT: 'local', X_POSTING_ENABLED: 'true', DISCORD_POSTING_ENABLED: 'true' })
/** 受信→lease取得→判定→登録の実経路で Webhook 由来のイベントを登録し、そのUUIDを返す。 */
const registerFromWebhook = async (env: Bindings, id: number, dates: { startDate: string; endDate: string }) => {
  const postId = `21092217217735760${String(id).padStart(2, '0')}`
  const sourceUrl = `https://x.com/bic_akiba/status/${postId}`
  await insertWebhookJob(env, {
    id: postId,
    createdAt: '2026-10-11T00:00:00Z',
    screenName: 'bic_akiba',
    kind: 'original',
    text: `本日より限定名刺を配布 ${id}`,
    url: sourceUrl,
    media: []
  })
  const token = await claimWebhookJob(env, postId)
  if (token === null) throw new Error('Webhook job was not claimed')
  // webhook-process と同じくジョブ側の判定時刻はミリ秒で書き、イベント側 clef_judged_at への変換も通す。
  await env.DB.prepare(
    'UPDATE webhook_event_jobs SET judged_at=?,confidence=0.99,model=?,question_version=? WHERE post_id=?'
  )
    .bind(dayjs('2026-10-11T00:00:00.456Z').valueOf(), 'clef', 'test-v1', postId)
    .run()
  const job = await getWebhookJob(env, postId)
  const event = validateWebhookEvent(
    {
      ...request(id, dates),
      uuid: job.eventUUID,
      referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce', url: sourceUrl }]
    },
    job.eventUUID
  )
  await registerWebhookEvent(env, job, event, token)
  return job.eventUUID
}
/** Prisma の D1 アダプタの形式（例: 2026-10-12T00:00:00.123+00:00）ではない DateTime 列の値を集める。 */
const CANONICAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+00:00$/
const nonCanonicalDateTimes = async (env: Bindings) => {
  const found: { table: string; column: string; value: unknown }[] = []
  for (const [table, columns] of Object.entries(DATETIME_COLUMNS)) {
    for (const column of columns) {
      // D1 は LIKE / GLOB のパターン長に上限があるので、形式の判定は取得後に行う。
      const rows = await env.DB.prepare(
        `SELECT typeof(${column}) AS type, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`
      ).all<{ type: string; value: unknown }>()
      found.push(
        ...rows.results
          .filter((row) => row.type !== 'text' || !CANONICAL_PATTERN.test(String(row.value)))
          .map((row) => ({ table, column, value: row.value }))
      )
    }
  }
  return found
}
/** 本番と同じ順に、日時を揃えるデータ移行を流す。 */
const NORMALIZE_MIGRATIONS = [
  '20261012090000_normalize_event_datetimes',
  '20261012091000_normalize_event_datetime_text'
]
const normalize = async (env: Bindings) => {
  for (const name of NORMALIZE_MIGRATIONS) await env.DB.exec(await migrationSql(name))
}
const snapshot = async (env: Bindings) =>
  Promise.all(
    Object.keys(DATETIME_COLUMNS).map(
      async (table) => (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results
    )
  )

test('atomic manual saves and webhook registrations store Prisma DateTime text and match daily and weekly start and end selection', async () => {
  await withDatabase(async (env, select, create) => {
    const posting = withPosting(env)
    await createEvent(
      posting,
      request(1, { startDate: '2026-10-12T10:00:00+09:00', endDate: '2026-10-18T23:59:59+09:00' })
    )
    await createEvent(
      posting,
      request(2, { startDate: '2026-10-01T00:00:00+09:00', endDate: '2026-10-12T23:59:59+09:00' })
    )
    await create(request(3, { startDate: '2026-10-12T05:00:00+09:00', shouldTweet: false }))
    const startingHook = await registerFromWebhook(posting, 4, { startDate: '2026-10-12', endDate: '2026-10-25' })
    const endingHook = await registerFromWebhook(posting, 5, { startDate: '2026-10-05', endDate: '2026-10-12' })
    // atomic 更新も同じ形式で書き、文字列の updated_at を使う版の CAS が連続更新でも一致し続けることを確かめる。
    for (const title of ['更新後', '再更新']) {
      await updateEvent(
        posting,
        request(1, { title, startDate: '2026-10-12T10:00:00+09:00', endDate: '2026-10-18T23:59:59+09:00' })
      )
    }
    expect(await select('starting', { now: '2026-10-12T09:00:00+09:00' })).toEqual([startingHook, uuid(3), uuid(1)])
    expect(await select('ending', { now: '2026-10-12T09:00:00+09:00' })).toEqual([uuid(2), endingHook])
    // 週内に開始: 1, 3, startingHook。週内に終了（日曜 23:59:59 を含む）: 1, 2, endingHook。
    expect((await select('weekStarting', WEEK)).sort()).toEqual([uuid(1), uuid(3), startingHook].sort())
    expect((await select('weekEnding', WEEK)).sort()).toEqual([uuid(1), uuid(2), endingHook].sort())
    expect(await nonCanonicalDateTimes(env)).toEqual([])
    const startDate = (id: string) =>
      env.DB.prepare('SELECT start_date FROM events WHERE id=?').bind(id).first<string>('start_date')
    // Prisma が書いた行と生SQLの行が同じ文字列形式であることを直接比べる。
    expect(await startDate(uuid(3))).toBe('2026-10-11T20:00:00.000+00:00')
    expect(toD1DateTime('2026-10-12T05:00:00+09:00')).toBe('2026-10-11T20:00:00.000+00:00')
    expect(await startDate(uuid(1))).toBe('2026-10-12T01:00:00.000+00:00')
    expect(await startDate(startingHook)).toBe('2026-10-11T15:00:00.000+00:00')
    expect(
      await env.DB.prepare('SELECT clef_judged_at FROM events WHERE id=?')
        .bind(startingHook)
        .first<string>('clef_judged_at')
    ).toBe('2026-10-11T00:00:00.456+00:00')
  })
}, 60000)

test('webhook duplicate lookup matches Prisma-created and atomically saved events on the same start date', async () => {
  await withDatabase(async (env, _select, create) => {
    const posting = withPosting(env)
    await create(request(1, { startDate: '2026-10-20T00:00:00+09:00', shouldTweet: false }))
    await createEvent(posting, request(2, { startDate: '2026-10-21T00:00:00+09:00' }))
    const incoming = (startDate: string) =>
      validateWebhookEvent({ ...request(9, { startDate }), shouldTweet: false }, uuid(9))
    const sourceUrl = 'https://x.com/bic_akiba/status/2109221721773576999'
    expect(await duplicateWebhookEvents(posting, incoming('2026-10-20'), sourceUrl)).toEqual([uuid(1)])
    expect(await duplicateWebhookEvents(posting, incoming('2026-10-21'), sourceUrl)).toEqual([uuid(2)])
    expect(await duplicateWebhookEvents(posting, incoming('2026-10-22'), sourceUrl)).toEqual([])
  })
}, 60000)

test('manual webhook link stores the added reference URL timestamps as Prisma DateTime text', async () => {
  await withDatabase(async (env, _select, create) => {
    await create(request(1, { startDate: '2026-10-20T00:00:00+09:00', shouldTweet: false }))
    const postId = '2109221721773576101'
    const sourceUrl = `https://x.com/bic_akiba/status/${postId}`
    await insertWebhookJob(env, {
      id: postId,
      createdAt: '2026-10-11T00:00:00Z',
      screenName: 'bic_akiba',
      kind: 'original',
      text: '既存イベントへの紐付け',
      url: sourceUrl,
      media: []
    })
    await env.DB.prepare("UPDATE webhook_event_jobs SET status='held' WHERE post_id=?").bind(postId).run()
    const queued = Object.assign(env, { EVENT_DETECTION_QUEUE: { send: async () => {} } })
    await resolveWebhookJob(queued, postId, { action: 'link', eventId: uuid(1) })
    expect(
      (
        await env.DB.prepare(
          'SELECT event_id AS eventId,typeof(created_at) AS createdType,typeof(updated_at) AS updatedType FROM event_reference_urls WHERE url=?'
        )
          .bind(sourceUrl)
          .all()
      ).results
    ).toEqual([{ eventId: uuid(1), createdType: 'text', updatedType: 'text' }])
    expect(await nonCanonicalDateTimes(env)).toEqual([])
  })
}, 60000)

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
    const incoming = validateWebhookEvent({ ...request(9, { startDate: '2026-10-20' }), shouldTweet: false }, uuid(9))
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
