/**
 * Runtime OG image renderer for /events/:id pages.
 *
 * satori で SVG を組み立て、@resvg/resvg-wasm で PNG にラスタライズして返す。
 * フォント (Zen Maru Gothic 500/700) は ASSETS から読み込み、 Worker isolate 内で
 * 一度ロードしたら使い回す。生成済み PNG は呼び出し側 (api/og.ts) で KV cache する。
 */
import { initWasm, Resvg } from '@resvg/resvg-wasm'
// biome-ignore lint/correctness/noNodejsModules: vite-plugin-cloudflare resolves this to a WebAssembly.Module at build time
import resvgWasmModule from '@resvg/resvg-wasm/index_bg.wasm'
// 既定のsatoriはyogaのWASMを実行時コード生成で組み立て、Workersでは初期化に失敗する。
// standalone版へ、ビルド時にWebAssembly.Moduleとして同梱したyogaを渡す。
import satori, { init as initSatori } from 'satori/standalone'
// biome-ignore lint/correctness/noNodejsModules: vite-plugin-cloudflare resolves this to a WebAssembly.Module at build time
import yogaWasmModule from 'satori/yoga.wasm'
import type { Bindings } from '@/types/bindings'
import type { EventOgPlace } from '@/utils/og-event-place'

let wasmReady: Promise<void> | null = null
const ensureWasm = (): Promise<void> => {
  if (!wasmReady) {
    wasmReady = Promise.all([
      initWasm(resvgWasmModule as WebAssembly.Module),
      initSatori(yogaWasmModule as WebAssembly.Module)
    ]).then(() => undefined)
    // 一時的な失敗でisolate全体を壊れたままにしない。
    wasmReady.catch(() => {
      wasmReady = null
    })
  }
  return wasmReady
}

type FontEntry = { name: string; data: ArrayBuffer; weight: 500 | 700; style: 'normal' }

let cachedFonts: FontEntry[] | null = null
const loadFonts = async (env: Bindings, origin: string): Promise<FontEntry[]> => {
  if (cachedFonts) return cachedFonts
  const [reg, bold] = await Promise.all([
    env.ASSETS.fetch(new Request(`${origin}/fonts/zen-maru-gothic-500.woff`)).then((r) => r.arrayBuffer()),
    env.ASSETS.fetch(new Request(`${origin}/fonts/zen-maru-gothic-700.woff`)).then((r) => r.arrayBuffer())
  ])
  cachedFonts = [
    { name: 'Zen Maru Gothic', data: reg, weight: 500, style: 'normal' },
    { name: 'Zen Maru Gothic', data: bold, weight: 700, style: 'normal' }
  ]
  return cachedFonts
}

const formatJstDate = (d: Date): string => {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth() + 1).padStart(2, '0')}/${String(jst.getUTCDate()).padStart(2, '0')}`
}

export type EventOgInput = {
  title: string
  startDate: Date
  endDate: Date | null
  limitedQuantity: number | null
  place: EventOgPlace
}

// 開催店舗・対象の娘。X のカードは縮小表示されるため、題名に次ぐ大きさにする
const pill = (value: string, filled: boolean) => ({
  type: 'div',
  props: {
    style: {
      fontSize: '36px',
      fontWeight: 700,
      padding: '6px 24px',
      borderRadius: '999px',
      border: '3px solid #dc2626',
      background: filled ? '#dc2626' : '#ffffff',
      color: filled ? '#ffffff' : '#b91c1c'
    },
    children: value
  }
})

const caption = (text: string) => ({
  type: 'div',
  props: { style: { fontSize: '26px', fontWeight: 700, color: '#b91c1c' }, children: text }
})

// 折り返しても見出しだけが行末に残らないよう、見出しと最初の値をひとまとめにする
const captioned = (text: string, first: ReturnType<typeof pill>) => ({
  type: 'div',
  props: { style: { display: 'flex', alignItems: 'center', gap: '12px' }, children: [caption(text), first] }
})

const buildVDom = (e: EventOgInput) => {
  const range = e.endDate
    ? `${formatJstDate(e.startDate)} 〜 ${formatJstDate(e.endDate)}`
    : `${formatJstDate(e.startDate)} 〜`
  const meta = [range, e.limitedQuantity ? `限定 ${e.limitedQuantity} 体` : null]
    .filter((v): v is string => Boolean(v))
    .join('  ・  ')
  const [firstStore, ...otherStores] = e.place.stores.map((store) => pill(store, true))
  const place = [
    ...(firstStore ? [captioned('開催店舗', firstStore)] : []),
    ...otherStores,
    ...(e.place.otherStoreCount > 0 ? [caption(`ほか ${e.place.otherStoreCount} 店舗`)] : []),
    ...(e.place.character ? [captioned('対象', pill(e.place.character, false))] : [])
  ]

  return {
    type: 'div',
    props: {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #fff5f5 0%, #ffe4e4 50%, #ffd0d0 100%)',
        fontFamily: 'Zen Maru Gothic',
        position: 'relative',
        padding: '72px 80px 64px 80px',
        justifyContent: 'space-between'
      },
      children: [
        {
          type: 'div',
          props: {
            style: { position: 'absolute', top: 0, left: 0, right: 0, height: '8px', background: '#dc2626' }
          }
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column' },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '14px 16px',
                    marginBottom: '36px'
                  },
                  children: place
                }
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '76px',
                    color: '#1a1a1a',
                    fontWeight: 700,
                    lineHeight: 1.15,
                    marginBottom: '28px',
                    // satori は display: block のときだけ lineClamp を効かせる
                    display: 'block',
                    lineClamp: 2
                  },
                  children: e.title
                }
              },
              {
                type: 'div',
                props: {
                  style: { fontSize: '32px', color: '#525252', fontWeight: 500, lineHeight: 1.4 },
                  children: meta
                }
              }
            ]
          }
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', fontSize: '24px', fontWeight: 700 },
            children: [
              { type: 'div', props: { style: { color: '#1a1a1a' }, children: 'ビッカメ娘 推し活応援プロジェクト' } },
              {
                type: 'div',
                props: { style: { color: '#dc2626', letterSpacing: '0.05em' }, children: '#ビッカメ娘 イベント' }
              }
            ]
          }
        }
      ]
    }
  }
}

export const renderEventOgImage = async (
  env: Bindings,
  origin: string,
  e: EventOgInput
): Promise<Uint8Array<ArrayBuffer>> => {
  await ensureWasm()
  const fonts = await loadFonts(env, origin)
  const vdom = buildVDom(e)
  // biome-ignore lint/suspicious/noExplicitAny: satori VDom type accepts loose object trees
  const svg = await satori(vdom as any, { width: 1200, height: 630, fonts })
  // asPng() の型は Uint8Array<ArrayBufferLike> で Hono の body が受け付けないため詰め替える
  return new Uint8Array(new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng())
}
