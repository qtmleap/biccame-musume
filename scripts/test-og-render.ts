import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { z } from 'zod'
import {
  buildSummarySnapshot,
  jstDay,
  socialEventView,
  type SocialSummaryKind
} from '@biccame/shared/domain/social-post'
import { isSpecialCharacter } from '@biccame/shared/domain/event-character'
import { type Event, EventSchema } from '@biccame/shared/schemas/event.dto'
import { type StoreKey, StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import { type SocialImage, type SocialSnapshot, SocialSnapshotSchema } from '@biccame/shared/social'
import dayjs from 'dayjs'

// 本番と同じsatori standalone + resvg WASMをworkerdで実行し、イベントOG画像と投稿画像がPNGになることを検証する。
// --write を付けると .cache/og-lab/out/prod/ に投稿画像を書き出す（承認済みの試作 .cache/og-lab/out/v2/ と見比べる用）。
const root = resolve(import.meta.dirname, '..')
const write = process.argv.includes('--write')
const OUT_DIR = resolve(root, '.cache/og-lab/out/prod')
const OG_ASSET_DIR = resolve(root, 'workers/web/public')
const EVENTS_PATH = resolve(root, '.cache/og-lab/events.json')
const MANIFEST_PATH = resolve(root, '.cache/og-lab/out/v2/manifest.json')
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const MAX_BYTES = 5 * 1024 * 1024

/* ------------------------------------------------------------------ */
/* /events/:id 用の OG（1200x630）                                       */
/* ------------------------------------------------------------------ */

// 開催店舗の表示パターン: 店舗の娘が対象 / 別の娘が対象 / 並べきれない複数店舗 / 店舗が折り返す最長の組み合わせ
const cases = {
  single: { title: 'スマホ用カードケース+擬人化10周年記念アクキー', stores: ['chofu'], limitedQuantity: 100 },
  character: { title: 'ビッカメ娘11周年記念名刺', stores: ['chofu'], characterId: 'seiseki', limitedQuantity: null },
  many: { title: '8がつく店舗コラボ名刺', stores: ['hachioji', 'shibuhachi', 'yao', 'nagoya'], limitedQuantity: 50 },
  wrap: {
    title: 'スマホ用カードケース+擬人化10周年記念アクキー・デカ立川たんアクキー',
    stores: ['nagoyagate', 'abeno', 'ikenishi'],
    characterId: 'seiseki',
    limitedQuantity: 1000
  }
}

/* ------------------------------------------------------------------ */
/* 投稿画像の入力（試作と同じ実データから、本番と同じ組み立てでスナップショットにする）                  */
/* ------------------------------------------------------------------ */

const loadEvents = (): Event[] => {
  const parsed = EventSchema.array().safeParse(JSON.parse(readFileSync(EVENTS_PATH, 'utf8')))
  if (!parsed.success) throw new Error(`Invalid events: ${parsed.error.message}`)
  return parsed.data.filter((event) => event.isVerified)
}
const events = loadEvents()
const pick = (prefix: string): Event => {
  const found = events.find((event) => event.uuid.startsWith(prefix))
  if (found === undefined) throw new Error(`Event ${prefix} is not public`)
  return found
}

const dayKey = (value: Date): string => jstDay(value).format('YYYY-MM-DD')
const endOf = (event: Event): Date | null => {
  if (event.endedAt !== undefined) return event.endedAt
  return event.endDate === undefined ? null : event.endDate
}
const startsBetween = (from: string, to: string): Event[] =>
  events.filter((event) => dayKey(event.startDate) >= from && dayKey(event.startDate) <= to)
const endsBetween = (from: string, to: string): Event[] =>
  events.filter((event) => {
    const end = endOf(event)
    return end !== null && dayKey(end) >= from && dayKey(end) <= to
  })

/** その日（JST）の朝8時。毎朝は前日の 23:00Z、毎週はその週の月曜の朝。 */
const scheduledAt = (day: string): string => dayjs(`${day}T08:00:00+09:00`).toISOString()

type PostCase = {
  /** 出力ファイル名の頭（試作と同じ。例: daily-H2-over）。 */
  name: string
  kind: SocialSummaryKind
  day: string
  starting: Event[]
  ending: Event[]
}

// 特殊値（secret / other）の行を含む合成。実データの 2026-09-19 は開始11件で、特殊値の行は2枚目にずれるため4件だけ抜き出す。
const specialStarting = [
  pick('bb47e64c'),
  pick('ef85a18f'),
  ...startsBetween('2026-09-19', '2026-09-19')
    .filter((event) => !isSpecialCharacter(event.characterId ?? event.stores[0]))
    .toSorted((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.uuid.localeCompare(b.uuid))
    .slice(0, 2)
]

const postCases: PostCase[] = [
  { name: 'daily-H2', kind: 'daily', day: '2026-04-29', starting: startsBetween('2026-04-29', '2026-04-29'), ending: endsBetween('2026-04-29', '2026-04-29') },
  { name: 'daily-H2-many', kind: 'daily', day: '2026-07-26', starting: startsBetween('2026-07-26', '2026-07-26'), ending: endsBetween('2026-07-26', '2026-07-26') },
  { name: 'daily-H2-more', kind: 'daily', day: '2026-02-14', starting: startsBetween('2026-02-14', '2026-02-14'), ending: endsBetween('2026-02-14', '2026-02-14') },
  { name: 'daily-H2-over', kind: 'daily', day: '2026-08-31', starting: startsBetween('2026-08-31', '2026-08-31'), ending: endsBetween('2026-08-31', '2026-08-31') },
  { name: 'daily-H2-empty', kind: 'daily', day: '2026-08-22', starting: startsBetween('2026-08-22', '2026-08-22'), ending: endsBetween('2026-08-22', '2026-08-22') },
  { name: 'daily-H2-special', kind: 'daily', day: '2026-09-19', starting: specialStarting, ending: endsBetween('2026-09-19', '2026-09-19') },
  { name: 'weekly-H2', kind: 'weekly', day: '2026-03-09', starting: startsBetween('2026-03-09', '2026-03-15'), ending: endsBetween('2026-03-09', '2026-03-15') },
  { name: 'weekly-H2-special', kind: 'weekly', day: '2026-09-14', starting: specialStarting, ending: endsBetween('2026-09-14', '2026-09-20') }
]

type RenderCase = {
  /** 出力ファイル名（拡張子なし）。試作と同じ名前にして見比べる。 */
  file: string
  snapshot: SocialSnapshot
  index: number
  /** 画像に載るイベントの uuid（試作の manifest.json の eventsUsed と突き合わせる）。 */
  eventIds: string[]
}

const snapshotOf = (input: unknown): SocialSnapshot => {
  const parsed = SocialSnapshotSchema.safeParse(input)
  if (!parsed.success) throw new Error(`Invalid social snapshot: ${parsed.error.message}`)
  return parsed.data
}

const imageEventIds = (image: SocialImage): string[] => {
  if (image.type === 'event') return [image.event.uuid]
  return image.type === 'summary' ? image.rows.flatMap((row) => row.eventIds) : []
}

const summaryCases = postCases.flatMap((post): RenderCase[] => {
  const snapshot = buildSummarySnapshot({
    kind: post.kind,
    scheduledAt: scheduledAt(post.day),
    starting: post.starting,
    ending: post.ending
  })
  if (snapshot === null) throw new Error(`${post.name}: no snapshot`)
  // 同じ側の何枚目かを数えて、試作と同じ「-starting-1」のファイル名にする。
  const counts = new Map<string, number>()
  return snapshot.images.map((image, index) => {
    if (image.type === 'event') throw new Error(`${post.name}: unexpected event image`)
    const page = (counts.get(image.side) ?? 0) + 1
    counts.set(image.side, page)
    return { file: `${post.name}-${image.side}-${page}`, snapshot, index, eventIds: imageEventIds(image) }
  })
})

// 追加・更新: single（店舗と別の娘が対象）/ multi（複数店舗）/ secret / other
const eventCases = (['created', 'updated'] as const).flatMap((kind) =>
  (
    [
      ['single', pick('16e89d75')],
      ['multi', pick('578807af')],
      ['secret', pick('bb47e64c')],
      ['other', pick('ef85a18f')]
    ] as const
  ).map(([role, event]): RenderCase => {
    const view = socialEventView(event)
    return {
      file: `${kind}-D-${role}`,
      snapshot: snapshotOf({
        kind,
        key: `${kind}:${event.uuid}`,
        scheduledAt: scheduledAt('2026-10-12'),
        text: event.title,
        images: [{ type: 'event', event: view }]
      }),
      index: 0,
      eventIds: [event.uuid]
    }
  })
)

/** ASSETS に素材が無い娘の Avatar が「ビ」の丸印にフォールバックすることの確認用（試作には無い）。 */
const usedStoreKeys = new Set(
  [...eventCases, ...summaryCases].flatMap(({ snapshot, index }) => {
    const image = snapshot.images[index]
    if (image.type === 'event') return image.event.avatars
    return image.type === 'summary' ? image.rows.map((row) => row.avatar) : []
  })
)
const missingKey = StoreKeySchema.options.find((key) => !usedStoreKeys.has(key))
if (missingKey === undefined) throw new Error('No unused store key for the missing avatar case')
const fallbackCase: RenderCase = (() => {
  const base = eventCases[0]
  const image = base.snapshot.images[0]
  if (image.type !== 'event') throw new Error('Unexpected fallback base image')
  return {
    file: 'created-D-fallback',
    snapshot: snapshotOf({ ...base.snapshot, images: [{ type: 'event', event: { ...image.event, avatars: [missingKey] } }] }),
    index: 0,
    eventIds: [image.event.uuid]
  }
})()

const renderCases = [...eventCases, ...summaryCases, fallbackCase]

/* ------------------------------------------------------------------ */
/* workerd 上の Worker（本番と同じ描画経路）                                */
/* ------------------------------------------------------------------ */

const entry = `
import { renderEventOgImage, renderOgPng } from './workers/web/src/api/lib/og-event-image.ts'
import { eventOgPlace } from './packages/shared/src/domain/og-event-place.ts'
import { renderSocialImage } from './workers/web/src/api/lib/social-image.ts'
import { SocialSnapshotSchema } from './packages/shared/src/social.ts'
import { createElement } from 'react'
const cases = ${JSON.stringify(cases)}
const respond = async (render) => {
  try {
    return new Response(await render(), { headers: { 'content-type': 'image/png' } })
  } catch (error) {
    return new Response(String(error), { status: 400 })
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/social') {
      // スナップショットと添字を受け取り、保存された内容だけで1枚描く（データベースは使わない）。
      const body = await request.json()
      const parsed = SocialSnapshotSchema.safeParse(body.snapshot)
      if (!parsed.success) return new Response(parsed.error.message, { status: 400 })
      return respond(() => renderSocialImage(env, parsed.data, body.index))
    }
    if (url.pathname === '/height') {
      // renderOgPng の許可リスト（630 / 675 以外は例外）。
      const height = Number(url.searchParams.get('value'))
      const element = createElement('div', { style: { display: 'flex', width: 1200, height, background: '#ffe4e4' } })
      return respond(() => renderOgPng(env, url.origin, element, height))
    }
    const event = cases[url.searchParams.get('case')]
    return respond(() => renderEventOgImage(env, url.origin, {
      title: event.title, startDate: new Date('2026-10-04T00:00:00Z'),
      endDate: new Date('2026-10-12T00:00:00Z'), limitedQuantity: event.limitedQuantity, place: eventOgPlace(event)
    }))
  }
}`
const result = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: 'og-entry.ts', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'neutral', write: false, outdir: 'out',
  conditions: ['workerd', 'worker', 'browser'], mainFields: ['module', 'main'], jsx: 'automatic',
  // nodejs_compat相当。Node APIは実行時にworkerdが提供する。
  external: ['fs', 'path', 'crypto', 'node:*'],
  alias: { '@': resolve(root, 'workers/web/src/app'), '@api': resolve(root, 'workers/web/src/api') },
  plugins: [{
    name: 'harfbuzz-workers',
    setup(build) {
      // Viteと同じく、bare importだけをWorkers版に置換する（サブパスは実体を参照する）。
      build.onResolve({ filter: /^harfbuzzjs$/ }, () => ({ path: resolve(root, 'workers/web/src/api/lib/harfbuzz-workers.ts') }))
    }
  }],
  loader: { '.wasm': 'file' }, assetNames: '[name]'
})
const modules: Record<string, { type: 'esm' | 'wasm'; contents: string | Uint8Array }> = {}
for (const file of result.outputFiles) {
  const name = file.path.split('/').pop() ?? file.path
  if (name.endsWith('.js')) {
    // esbuildのfile loaderが出すURL文字列をworkerdのWASM module importへ置き換える。
    modules['index.js'] = { type: 'esm', contents: file.text.replace(/var (\w+) = "\.\/(\w[\w.-]*\.wasm)";/g, 'import $1 from "./$2";') }
  } else modules[name] = { type: 'wasm', contents: file.contents }
}

/* ------------------------------------------------------------------ */
/* ASSETS の代わり（フォントと、画像に出る娘の丸 PNG）                         */
/* ------------------------------------------------------------------ */

// 画像に出る娘の丸 PNG は、ビルド時に作られた workers/web/public/og/avatars/ の実物を使う（missingKey だけは載せない）。
const assetFiles = new Map<string, Buffer>(
  ['500', '700'].map((weight) => [
    `/fonts/zen-maru-gothic-${weight}.woff`,
    readFileSync(resolve(OG_ASSET_DIR, `fonts/zen-maru-gothic-${weight}.woff`))
  ])
)
const avatarKeys = [...usedStoreKeys].filter((key): key is StoreKey => !isSpecialCharacter(key))
const missingAvatars = avatarKeys.filter((key) => !existsSync(resolve(OG_ASSET_DIR, `og/avatars/${key}.png`)))
if (missingAvatars.length > 0) {
  console.warn(`Avatar PNGs are not built yet (the fallback mark is drawn instead): ${missingAvatars.join(', ')}`)
}
for (const key of avatarKeys.filter((candidate) => !missingAvatars.includes(candidate))) {
  assetFiles.set(`/og/avatars/${key}.png`, readFileSync(resolve(OG_ASSET_DIR, `og/avatars/${key}.png`)))
}
const assetTypes: Record<string, string> = { woff: 'font/woff', png: 'image/png' }

const mf = new Miniflare({ workers: [{
  config: {
    type: 'worker', name: 'og-render-test', compatibilityDate: '2026-05-11', compatibilityFlags: ['nodejs_compat'],
    env: { ASSETS: { type: 'worker', workerName: 'assets' } },
    manifest: { mainModule: 'index.js', modules }
  }
}, {
  config: {
    type: 'worker', name: 'assets', compatibilityDate: '2026-05-11',
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: `
      const files = ${JSON.stringify(Object.fromEntries([...assetFiles].map(([path, data]) => [path, data.toString('base64')])))};
      const types = ${JSON.stringify(assetTypes)};
      export default { fetch(request) {
        const path = new URL(request.url).pathname;
        const data = files[path];
        // 本番の ASSETS（not_found_handling = single-page-application）と同じく、無いパスは 200 の HTML を返す。
        if (!data) return new Response('<!doctype html><html></html>', { headers: { 'content-type': 'text/html' } });
        return new Response(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)), { headers: { 'content-type': types[path.split('.').pop()] } });
      } }` } } }
  }
}] })

/* ------------------------------------------------------------------ */
/* 検証                                                                 */
/* ------------------------------------------------------------------ */

const bodyOf = async (response: Response): Promise<Uint8Array> => new Uint8Array(await response.arrayBuffer())
const assertPng = (body: Uint8Array, width: number, height: number): void => {
  assert.deepEqual([...body.slice(0, 8)], PNG_SIGNATURE)
  const view = new DataView(body.buffer)
  assert.deepEqual([view.getUint32(16), view.getUint32(20)], [width, height])
  assert.ok(body.byteLength < MAX_BYTES, `PNG exceeds 5MB: ${body.byteLength}`)
}
const heightOf = (image: SocialImage): number => (image.type === 'event' ? 630 : 675)
const post = (snapshot: SocialSnapshot, index: number): Promise<Response> =>
  mf.dispatchFetch('http://localhost/social', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ snapshot, index })
  })

// 試作の manifest.json の eventsUsed（uuid 先頭8桁）。同名の画像に載るイベントと、並びまで一致するかを調べる。
const manifestSchema = z.array(z.object({ file: z.string().nonempty(), eventsUsed: z.array(z.string()) }))
const loadManifest = (): Map<string, string[]> => {
  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')))
  if (!parsed.success) throw new Error(`Invalid prototype manifest: ${parsed.error.message}`)
  return new Map(parsed.data.map((entry) => [entry.file.replace(/\.png$/, ''), entry.eventsUsed]))
}
const manifest = loadManifest()

try {
  for (const name of Object.keys(cases)) {
    const response = await mf.dispatchFetch(`http://localhost/og/events/test.png?case=${name}`)
    const body = await bodyOf(response)
    assert.equal(response.status, 200, new TextDecoder().decode(body.slice(0, 300)))
    assertPng(body, 1200, 630)
    if (write) await Bun.write(resolve(root, `.cache/og-render-${name}.png`), body)
    console.log(`OG render passed in workerd (${name}): 1200x630, ${body.length} bytes`)
  }

  // renderOgPng は 1200x630 と 1200x675 だけを受け付ける。
  for (const height of [630, 675]) {
    const response = await mf.dispatchFetch(`http://localhost/height?value=${height}`)
    assert.equal(response.status, 200)
    assertPng(await bodyOf(response), 1200, height)
  }
  for (const height of [0, 600, 631, 1200]) {
    const response = await mf.dispatchFetch(`http://localhost/height?value=${height}`)
    assert.equal(response.status, 400, `height ${height} must be rejected`)
  }
  console.log('renderOgPng accepts 630 / 675 and rejects other heights')

  const mismatches: string[] = []
  for (const item of renderCases) {
    const image = item.snapshot.images[item.index]
    const response = await post(item.snapshot, item.index)
    const body = await bodyOf(response)
    assert.equal(response.status, 200, `${item.file}: ${new TextDecoder().decode(body.slice(0, 300))}`)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assertPng(body, 1200, heightOf(image))
    if (write) await Bun.write(resolve(OUT_DIR, `${item.file}.png`), body)
    const expected = manifest.get(item.file)
    if (expected !== undefined) {
      const actual = item.eventIds.map((id) => id.slice(0, 8))
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(`${item.file}: prototype ${JSON.stringify(expected)} / production ${JSON.stringify(actual)}`)
      }
    }
    console.log(`Social render passed in workerd (${item.file}): 1200x${heightOf(image)}, ${body.length} bytes`)
  }
  assert.deepEqual(mismatches, [], `rows differ from the approved prototype:\n${mismatches.join('\n')}`)
  console.log(`Rows match the prototype manifest (${renderCases.filter((item) => manifest.has(item.file)).length} images)`)

  // index が整数でない・負・範囲外のときは描かずに例外にする。
  const [first] = renderCases
  for (const index of [-1, 1.5, first.snapshot.images.length, 99]) {
    const response = await post(first.snapshot, index)
    assert.equal(response.status, 400, `index ${index} must be rejected`)
  }
  console.log('Out-of-range image indexes are rejected')
} finally { await mf.dispose() }
