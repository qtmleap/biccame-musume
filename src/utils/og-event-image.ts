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
import satori from 'satori'
import type { Bindings } from '@/types/bindings'

let wasmReady: Promise<void> | null = null
const ensureWasm = (): Promise<void> => {
  if (!wasmReady) {
    wasmReady = initWasm(resvgWasmModule as WebAssembly.Module)
  }
  return wasmReady
}

type FontEntry = { name: string; data: ArrayBuffer; weight: 500 | 700; style: 'normal' }

let cachedFonts: FontEntry[] | null = null
const loadFonts = async (env: Bindings, origin: string): Promise<FontEntry[]> => {
  if (cachedFonts) return cachedFonts
  const [reg, bold] = await Promise.all([
    env.ASSETS.fetch(new Request(`${origin}/fonts/zen-maru-gothic-500.woff2`)).then((r) => r.arrayBuffer()),
    env.ASSETS.fetch(new Request(`${origin}/fonts/zen-maru-gothic-700.woff2`)).then((r) => r.arrayBuffer())
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
  storeCount: number
}

const buildVDom = (e: EventOgInput) => {
  const range = e.endDate
    ? `${formatJstDate(e.startDate)} 〜 ${formatJstDate(e.endDate)}`
    : `${formatJstDate(e.startDate)} 〜`
  const meta = [
    range,
    e.limitedQuantity ? `限定 ${e.limitedQuantity} 体` : null,
    e.storeCount > 0 ? `開催店舗 ${e.storeCount} 店` : null
  ]
    .filter((v): v is string => Boolean(v))
    .join('  ・  ')

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
        padding: '88px 80px 64px 80px',
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
                    fontSize: '32px',
                    color: '#dc2626',
                    fontWeight: 700,
                    marginBottom: '24px',
                    letterSpacing: '0.05em'
                  },
                  children: '#ビッカメ娘 イベント'
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
                    marginBottom: '40px',
                    display: '-webkit-box',
                    overflow: 'hidden'
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
            style: { fontSize: '24px', color: '#1a1a1a', fontWeight: 700 },
            children: 'ビッカメ娘 推し活応援プロジェクト'
          }
        }
      ]
    }
  }
}

export const renderEventOgImage = async (env: Bindings, origin: string, e: EventOgInput): Promise<Uint8Array> => {
  await ensureWasm()
  const fonts = await loadFonts(env, origin)
  const vdom = buildVDom(e)
  // biome-ignore lint/suspicious/noExplicitAny: satori VDom type accepts loose object trees
  const svg = await satori(vdom as any, { width: 1200, height: 630, fonts })
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
}
