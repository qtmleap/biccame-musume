import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

// 本番と同じsatori standalone + resvg WASMをworkerdで実行し、イベントOG画像がPNGになることを検証する。
const root = resolve(import.meta.dirname, '..')
// 開催店舗の表示パターン: 店舗の娘が対象 / 別の娘が対象 / 並べきれない複数店舗 / 店舗が折り返す最長の組み合わせ
const cases = {
  single: { title: 'スマホ用カードケース+擬人化10周年記念アクキー', stores: ['chofu'], limitedQuantity: 100 },
  character: { title: 'ビッカメ娘11周年記念名刺', stores: ['chofu'], characterId: 'seiseki', limitedQuantity: null },
  many: { title: '8がつく店舗コラボ名刺', stores: ['hachioji', 'shibuhachi', 'yao', 'nagoya'], limitedQuantity: 50 },
  wrap: {
    title: 'スマホ用カードケース+擬人化10周年記念アクキー・デカ立川たんアクキー', stores: ['nagoyagate', 'abeno', 'ikenishi'],
    characterId: 'seiseki', limitedQuantity: 1000
  }
}
const entry = `
import { renderEventOgImage } from './workers/app/src/utils/og-event-image.ts'
import { eventOgPlace } from './workers/app/src/utils/og-event-place.ts'
const cases = ${JSON.stringify(cases)}
export default {
  async fetch(request, env) {
    const event = cases[new URL(request.url).searchParams.get('case')]
    const png = await renderEventOgImage(env, new URL(request.url).origin, {
      title: event.title, startDate: new Date('2026-10-04T00:00:00Z'),
      endDate: new Date('2026-10-12T00:00:00Z'), limitedQuantity: event.limitedQuantity, place: eventOgPlace(event)
    })
    return new Response(png, { headers: { 'content-type': 'image/png' } })
  }
}`
const result = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: 'og-entry.ts', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'neutral', write: false, outdir: 'out',
  conditions: ['workerd', 'worker', 'browser'], mainFields: ['module', 'main'],
  // nodejs_compat相当。Node APIは実行時にworkerdが提供する。
  external: ['fs', 'path', 'crypto', 'node:*'],
  alias: { '@': resolve(root, 'workers/app/src') },
  plugins: [{
    name: 'harfbuzz-workers',
    setup(build) {
      // Viteと同じく、bare importだけをWorkers版に置換する（サブパスは実体を参照する）。
      build.onResolve({ filter: /^harfbuzzjs$/ }, () => ({ path: resolve(root, 'workers/app/src/lib/harfbuzz-workers.ts') }))
    }
  }],
  loader: { '.wasm': 'file' }, assetNames: '[name]'
})
const modules: Record<string, { type: 'esm' | 'wasm'; contents: string | Uint8Array }> = {}
for (const file of result.outputFiles) {
  const name = file.path.split('/').pop() as string
  if (name.endsWith('.js')) {
    // esbuildのfile loaderが出すURL文字列をworkerdのWASM module importへ置き換える。
    modules['index.js'] = { type: 'esm', contents: file.text.replace(/var (\w+) = "\.\/(\w[\w.-]*\.wasm)";/g, 'import $1 from "./$2";') }
  } else modules[name] = { type: 'wasm', contents: file.contents }
}
const fonts = Object.fromEntries(['500', '700'].map((weight) => [
  `/fonts/zen-maru-gothic-${weight}.woff`, readFileSync(resolve(root, `workers/app/public/fonts/zen-maru-gothic-${weight}.woff`))
]))
const mf = new Miniflare({ workers: [{
  config: {
    type: 'worker', name: 'og-render-test', compatibilityDate: '2026-05-11', compatibilityFlags: ['nodejs_compat'],
    env: { ASSETS: { type: 'worker', workerName: 'fonts' } },
    manifest: { mainModule: 'index.js', modules }
  }
}, {
  config: {
    type: 'worker', name: 'fonts', compatibilityDate: '2026-05-11',
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: `
      const fonts = ${JSON.stringify(Object.fromEntries(Object.entries(fonts).map(([k, v]) => [k, Buffer.from(v).toString('base64')])))};
      export default { fetch(request) {
        const data = fonts[new URL(request.url).pathname];
        if (!data) return new Response('missing', { status: 404 });
        return new Response(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)), { headers: { 'content-type': 'font/woff' } });
      } }` } } }
  }
}] })
try {
  for (const name of Object.keys(cases)) {
    const response = await mf.dispatchFetch(`http://localhost/og/events/test.png?case=${name}`)
    const body = new Uint8Array(await response.arrayBuffer())
    assert.equal(response.status, 200, new TextDecoder().decode(body.slice(0, 300)))
    assert.deepEqual([...body.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const width = new DataView(body.buffer).getUint32(16)
    const height = new DataView(body.buffer).getUint32(20)
    assert.deepEqual([width, height], [1200, 630])
    if (process.argv.includes('--write')) await Bun.write(resolve(root, `.cache/og-render-${name}.png`), body)
    console.log(`OG render passed in workerd (${name}): ${width}x${height}, ${body.length} bytes`)
  }
} finally { await mf.dispose() }
