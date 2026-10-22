import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Bindings } from '@api/types/bindings'
import { type Event, EventSchema } from '@biccame/shared/schemas/event.dto'
import { build } from 'esbuild'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { z } from 'zod'

const root = resolve(import.meta.dirname, '../..')

// 一覧系のサービスを Worker にまとめ、workerd 内で Prisma + D1 の経路を実際に通す。
// 失敗はエラー名とコードを JSON で返し、テスト側で P2029 などを判別できるようにする。
const bundle = build({
  stdin: {
    contents: `
    import { getEvents, getAdminEvents, getAdminWebhookEvents } from './workers/web/src/api/services/event-service.ts'
    const routes = { '/events': getEvents, '/admin-events': getAdminEvents, '/webhook-events': getAdminWebhookEvents }
    export default { async fetch(request, env) {
      const handler = routes[new URL(request.url).pathname]
      try {
        return Response.json({ ok: true, events: await handler(env) })
      } catch (error) {
        return Response.json({ ok: false, name: error?.name, code: error?.code, message: String(error?.message) }, { status: 500 })
      }
    } }
  `,
    resolveDir: root,
    sourcefile: 'event-list-entry.ts',
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

const ListResponseSchema = z.object({ ok: z.literal(true), events: EventSchema.array() })

export type EventListKind = 'events' | 'admin-events' | 'webhook-events'
export type EventListFetch = (kind: EventListKind) => Promise<Event[]>

const migrationSql = async (name: string) =>
  (await readFile(resolve(root, 'prisma/migrations', name, 'migration.sql'), 'utf8'))
    .replace(/^--.*$/gm, '')
    .replace(/\n/g, ' ')

/** 全マイグレーションを適用した一時の D1 と、一覧系サービスを呼ぶ Worker を用意して run に渡す。 */
export const withEventListDatabase = async (run: (env: Bindings, list: EventListFetch) => Promise<void>) => {
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
      name: 'event-list-bind-limit-test',
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
    const migrations = (await readdir(resolve(root, 'prisma/migrations'), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations) await env.DB.exec(await migrationSql(name))
    await run(env, async (kind) => {
      const response = await mf.dispatchFetch(`http://localhost/${kind}`)
      const body = await response.text()
      if (!response.ok) throw new Error(body)
      const parsed = ListResponseSchema.safeParse(JSON.parse(body))
      if (!parsed.success) throw new Error('Invalid event list response')
      return parsed.data.events
    })
  } finally {
    await mf.dispose()
  }
}
