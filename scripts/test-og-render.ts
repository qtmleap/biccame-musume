import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { z } from 'zod'
import { isSpecialCharacter, resolveEventCharacter } from '@biccame/shared/domain/event-character'
import { buildSummarySnapshot, jstDay, socialEventView, type SocialSummaryKind } from '@biccame/shared/domain/social-post'
import { type Event, EventSchema } from '@biccame/shared/schemas/event.dto'
import { type StoreKey, StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import {
  type SocialEventView,
  type SocialImage,
  type SocialRow,
  type SocialSide,
  type SocialSnapshot,
  SocialSnapshotSchema,
  type SocialSummaryImage
} from '@biccame/shared/social'
import dayjs from 'dayjs'
import { type EventRole, fixtureInputs, type OgRenderInputs, type PostCase } from './lib/og-render-fixtures'

// 本番と同じsatori standalone + resvg WASMをworkerdで実行し、イベントOG画像と投稿画像がPNGになることを検証する。
// 既定の入力は scripts/lib/og-render-fixtures.ts の決定的なフィクスチャで、.cache が無い CI でもそのまま動く。
// --real-data を付けると .cache/og-lab/events.json の実データで描き、承認済みの試作 .cache/og-lab/out/v2/manifest.json と行を突き合わせる（ローカル専用）。
// --write を付けると投稿画像を .cache/og-lab/out/ に書き出す（フィクスチャは prod-fixtures/、実データは prod/。prod/ は v2 と見比べる用）。
const root = resolve(import.meta.dirname, '..')
const write = process.argv.includes('--write')
const realData = process.argv.includes('--real-data')
const OUT_DIR = resolve(root, realData ? '.cache/og-lab/out/prod' : '.cache/og-lab/out/prod-fixtures')
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
/* 投稿画像の入力                                                         */
/* ------------------------------------------------------------------ */

/** 投稿の予定日時。その日（JST）の朝8時。毎朝は前日の 23:00Z、毎週はその週の月曜の朝。 */
const scheduledAt = (day: string): string => dayjs(`${day}T08:00:00+09:00`).toISOString()

// 試作と同じ実データ（.cache/og-lab/events.json）から入力を作る。--real-data のときだけ読む。
const loadRealInputs = (): OgRenderInputs => {
  if (!existsSync(EVENTS_PATH)) throw new Error(`--real-data needs the local prototype data: ${EVENTS_PATH}`)
  const parsed = EventSchema.array().safeParse(JSON.parse(readFileSync(EVENTS_PATH, 'utf8')))
  if (!parsed.success) throw new Error(`Invalid events: ${parsed.error.message}`)
  const events = parsed.data.filter((event) => event.isVerified)
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

  // 特殊値（secret / other）の行を含む合成。実データの 2026-09-19 は開始11件で、特殊値の行は2枚目にずれるため4件だけ抜き出す。
  const specialStarting = [
    pick('bb47e64c'),
    pick('ef85a18f'),
    ...startsBetween('2026-09-19', '2026-09-19')
      .filter((event) => !isSpecialCharacter(resolveEventCharacter(event)))
      .toSorted((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.uuid.localeCompare(b.uuid))
      .slice(0, 2)
  ]

  const daily = (name: string, kind: SocialSummaryKind, day: string, to: string): PostCase => ({
    name,
    kind,
    day,
    starting: startsBetween(day, to),
    ending: endsBetween(day, to)
  })
  return {
    eventRoles: [
      ['single', pick('16e89d75')],
      ['multi', pick('578807af')],
      ['secret', pick('bb47e64c')],
      ['other', pick('ef85a18f')]
    ],
    postCases: [
      daily('daily-H2', 'daily', '2026-04-29', '2026-04-29'),
      daily('daily-H2-many', 'daily', '2026-07-26', '2026-07-26'),
      daily('daily-H2-more', 'daily', '2026-02-14', '2026-02-14'),
      daily('daily-H2-over', 'daily', '2026-08-31', '2026-08-31'),
      daily('daily-H2-empty', 'daily', '2026-08-22', '2026-08-22'),
      { ...daily('daily-H2-special', 'daily', '2026-09-19', '2026-09-19'), starting: specialStarting },
      daily('weekly-H2', 'weekly', '2026-03-09', '2026-03-15'),
      { ...daily('weekly-H2-special', 'weekly', '2026-09-14', '2026-09-20'), starting: specialStarting }
    ]
  }
}

const inputs: OgRenderInputs = realData ? loadRealInputs() : fixtureInputs
console.log(realData ? 'Input: real events (.cache/og-lab/events.json)' : 'Input: deterministic fixtures (scripts/lib/og-render-fixtures.ts)')

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

const postSnapshots = inputs.postCases.map((post) => {
  const snapshot = buildSummarySnapshot({
    kind: post.kind,
    scheduledAt: scheduledAt(post.day),
    starting: post.starting,
    ending: post.ending
  })
  if (snapshot === null) throw new Error(`${post.name}: no snapshot`)
  return { post, snapshot }
})

const summaryCases = postSnapshots.flatMap(({ post, snapshot }): RenderCase[] => {
  return snapshot.images.map((image, index) => {
    if (image.type === 'event') throw new Error(`${post.name}: unexpected event image`)
    // 同じ側の何枚目かを数えて、試作と同じ「-starting-1」のファイル名にする。
    const page = snapshot.images
      .slice(0, index + 1)
      .filter((candidate) => candidate.type !== 'event' && candidate.side === image.side).length
    return { file: `${post.name}-${image.side}-${page}`, snapshot, index, eventIds: imageEventIds(image) }
  })
})

// 追加・更新: single（店舗と別の娘が対象）/ multi（複数店舗）/ secret / other
const eventCases = (['created', 'updated'] as const).flatMap((kind) =>
  inputs.eventRoles.map(([role, event]): RenderCase => {
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
  const name = basename(file.path)
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
// フィクスチャの uuid は試作と無関係なので、突き合わせは --real-data のときだけ。試作が無ければ警告して飛ばす。
const manifestSchema = z.array(z.object({ file: z.string().nonempty(), eventsUsed: z.array(z.string()) }))
const loadManifest = (): Map<string, string[]> => {
  if (!existsSync(MANIFEST_PATH)) {
    console.warn(`Prototype manifest not found (skipping the row comparison): ${MANIFEST_PATH}`)
    return new Map()
  }
  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')))
  if (!parsed.success) throw new Error(`Invalid prototype manifest: ${parsed.error.message}`)
  return new Map(parsed.data.map((entry) => [entry.file.replace(/\.png$/, ''), entry.eventsUsed]))
}
const manifest = realData ? loadManifest() : new Map<string, string[]>()

const summaryImages = (snapshot: SocialSnapshot, side: SocialSide): SocialSummaryImage[] =>
  snapshot.images.filter((image): image is SocialSummaryImage => image.type === 'summary' && image.side === side)
const rowsOf = (snapshot: SocialSnapshot, side: SocialSide): SocialRow[] =>
  summaryImages(snapshot, side).flatMap((image) => image.rows)
const rowCounts = (snapshot: SocialSnapshot, side: SocialSide): number[] =>
  summaryImages(snapshot, side).map((image) => image.rows.length)
const moreOf = (snapshot: SocialSnapshot, side: SocialSide): number[] =>
  summaryImages(snapshot, side).flatMap((image) => (image.more === undefined ? [] : [image.more]))

// 片側ごとに「表示した行の元イベント ＋ ほか N件 ＝ 入力の件数」で、表示した分と隠れた分に重複や欠けがないことを確かめる。
const assertCoverage = (item: PostCase, snapshot: SocialSnapshot): void => {
  const sides: [SocialSide, Event[]][] = [
    ['starting', item.starting],
    ['ending', item.ending]
  ]
  for (const [side, input] of sides) {
    const images = summaryImages(snapshot, side)
    const shown = images.flatMap((image) => image.rows.flatMap((row) => row.eventIds))
    const hidden = images.flatMap((image) => image.hiddenEventIds)
    assert.equal(
      shown.length + moreOf(snapshot, side).reduce((sum, more) => sum + more, 0),
      input.length,
      `${item.name} ${side}: shown ${shown.length} + more does not match the input ${input.length}`
    )
    assert.deepEqual(
      [...shown, ...hidden].toSorted(),
      input.map((event) => event.uuid).toSorted(),
      `${item.name} ${side}: shown and hidden events differ from the input`
    )
  }
}

// フィクスチャが網羅するケースの形。入力を直した拍子に網羅が崩れても、PNG が描けるだけで通らないよう固定する。
const fixtureShapes: Record<string, (snapshot: SocialSnapshot) => void> = {
  // 4行の1枚。店舗違いの同内容は1行（2店舗）、1日のみ、終了日未定、対象の娘が店舗と違う行（終了側）がある。
  'daily-H2': (snapshot) => {
    assert.deepEqual(rowCounts(snapshot, 'starting'), [4])
    assert.ok(rowsOf(snapshot, 'starting').some((row) => row.stores.length === 2 && row.eventIds.length === 2))
    assert.ok(rowsOf(snapshot, 'starting').some((row) => row.period === '1日のみ'))
    assert.ok(rowsOf(snapshot, 'starting').some((row) => row.period === '終了日未定'))
    assert.ok(rowsOf(snapshot, 'ending').some((row) => row.target !== null))
  },
  'daily-H2-many': (snapshot) => {
    assert.deepEqual(rowCounts(snapshot, 'starting'), [4, 2])
    assert.deepEqual(rowCounts(snapshot, 'ending'), [4, 1])
    assert.deepEqual([...moreOf(snapshot, 'starting'), ...moreOf(snapshot, 'ending')], [])
  },
  // 8行ちょうど（4 + 4）は「ほか N件」が出ない。元イベントは行数より多い（9件）。
  'daily-H2-more': (snapshot) => {
    assert.deepEqual(rowCounts(snapshot, 'starting'), [4, 4])
    assert.deepEqual(moreOf(snapshot, 'starting'), [])
    assert.deepEqual(
      summaryImages(snapshot, 'starting').map((image) => image.total),
      [9, 9]
    )
  },
  // 9行目以降の4行（元イベント6件）は「ほか 6件」。隠れた行数（4）とは違う。
  'daily-H2-over': (snapshot) => {
    assert.deepEqual(rowCounts(snapshot, 'starting'), [4, 4])
    assert.deepEqual(moreOf(snapshot, 'starting'), [6])
    assert.equal(summaryImages(snapshot, 'starting')[1].total, 14)
  },
  'daily-H2-empty': (snapshot) => {
    assert.ok(snapshot.images.some((image) => image.type === 'empty' && image.side === 'ending'))
    assert.deepEqual(rowCounts(snapshot, 'starting'), [3])
    assert.deepEqual(rowCounts(snapshot, 'ending'), [])
  },
  'daily-H2-special': (snapshot) => {
    const avatars = rowsOf(snapshot, 'starting').map((row) => row.avatar)
    assert.ok(avatars.includes('secret') && avatars.includes('other'))
  },
  // 毎週は左端の日付が付く。同じ日付が続く行は先頭だけに残るので、日付のある行と無い行の両方が出る。
  'weekly-H2': (snapshot) => {
    for (const side of ['starting', 'ending'] as const) {
      const dates = rowsOf(snapshot, side).map((row) => row.date)
      assert.ok(dates.some((date) => date !== null) && dates.some((date) => date === null), `${side}: dates ${dates}`)
    }
  },
  'weekly-H2-special': (snapshot) => {
    const avatars = rowsOf(snapshot, 'starting').map((row) => row.avatar)
    assert.ok(avatars.includes('secret') && avatars.includes('other'))
    assert.equal(snapshot.kind, 'weekly')
  }
}
const eventViewShapes: Record<EventRole, (view: SocialEventView) => void> = {
  single: (view) => {
    assert.deepEqual(view.avatars, ['seiseki'])
    assert.notEqual(view.target, null)
  },
  multi: (view) => {
    assert.equal(view.avatars.length, 3)
    assert.equal(view.stores.length, 4)
  },
  secret: (view) => assert.deepEqual(view.avatars, ['secret']),
  other: (view) => assert.deepEqual(view.avatars, ['other'])
}

try {
  for (const { post: item, snapshot } of postSnapshots) assertCoverage(item, snapshot)
  console.log(`Coverage holds on every side (${postSnapshots.length} posts): shown rows + "more" = input events`)
  if (!realData) {
    for (const { post: item, snapshot } of postSnapshots) {
      const check = fixtureShapes[item.name]
      assert.ok(check !== undefined, `${item.name}: no shape check`)
      check(snapshot)
    }
    for (const [role, event] of inputs.eventRoles) eventViewShapes[role](socialEventView(event))
    console.log('Fixture shapes hold (more / empty / special / repeated dates / merged stores / avatars)')
  }

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
  if (manifest.size > 0) {
    assert.deepEqual(mismatches, [], `rows differ from the approved prototype:\n${mismatches.join('\n')}`)
    console.log(`Rows match the prototype manifest (${renderCases.filter((item) => manifest.has(item.file)).length} images)`)
  }

  // index が整数でない・負・範囲外のときは描かずに例外にする。
  const [first] = renderCases
  for (const index of [-1, 1.5, first.snapshot.images.length, 99]) {
    const response = await post(first.snapshot, index)
    assert.equal(response.status, 400, `index ${index} must be rejected`)
  }
  console.log('Out-of-range image indexes are rejected')
} finally { await mf.dispose() }
