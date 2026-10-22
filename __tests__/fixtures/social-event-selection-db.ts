import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { build } from 'esbuild'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { z } from 'zod'

const root = resolve(import.meta.dirname, '../..')
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
export const uuid = (id: number) => `550e8400-e29b-41d4-a716-${String(id).padStart(12, '0')}`
export const migrationSql = async (name: string) =>
  (await readFile(resolve(root, 'prisma/migrations', name, 'migration.sql'), 'utf8'))
    .replace(/^--.*$/gm, '')
    .replace(/\n/g, ' ')
export const withDatabase = async (run: (env: Bindings, select: Select, create: PrismaCreate) => Promise<void>) => {
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
export const insert = async (
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
    ).bind(crypto.randomUUID(), uuid(input.id), now, now),
    env.DB.prepare(
      "INSERT INTO event_characters (id,event_id,character_id,created_at,updated_at) VALUES (?,?,'akiba',?,?)"
    ).bind(crypto.randomUUID(), uuid(input.id), now, now)
  ])
}
