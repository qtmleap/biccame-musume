/**
 * Runtime OG image renderer for /events/:id pages.
 *
 * satori で SVG を組み立て、@resvg/resvg-wasm で PNG にラスタライズして返す。
 * フォント (Zen Maru Gothic 500/700) は ASSETS から読み込み、 Worker isolate 内で
 * 一度ロードしたら使い回す。生成済み PNG は呼び出し側 (api/og.ts) で KV cache する。
 */

import type { Bindings } from '@api/types/bindings'
import type { EventOgPlace } from '@biccame/shared/domain/og-event-place'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import resvgWasmModule from '@resvg/resvg-wasm/index_bg.wasm'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import type { ReactElement, ReactNode } from 'react'
// 既定のsatoriはyogaのWASMを実行時コード生成で組み立て、Workersでは初期化に失敗する。
// standalone版へ、ビルド時にWebAssembly.Moduleとして同梱したyogaを渡す。
import satori, { init } from 'satori/standalone'
import yogaWasmModule from 'satori/yoga.wasm'

export type OgFont = { name: string; data: ArrayBuffer; weight: 500 | 700; style: 'normal' }
const resources: { wasm?: Promise<void>; fonts?: Promise<OgFont[]> } = {}

const ensureWasm = (): Promise<void> => {
  if (resources.wasm) return resources.wasm
  const ready = Promise.all([initWasm(resvgWasmModule), init(yogaWasmModule)]).then(() => undefined)
  resources.wasm = ready
  // 一時的な失敗を次の描画で再試行する。
  ready.catch(() => {
    delete resources.wasm
  })
  return ready
}

const loadFont = async (env: Bindings, origin: string, weight: 500 | 700): Promise<OgFont> => {
  const response = await env.ASSETS.fetch(new Request(`${origin}/fonts/zen-maru-gothic-${weight}.woff`))
  if (!response.ok || !response.headers.get('content-type')?.includes('font')) {
    throw new Error(`OG font asset unavailable: ${weight}`)
  }
  const data = await response.arrayBuffer()
  if (data.byteLength === 0) throw new Error(`OG font asset is empty: ${weight}`)
  return { name: 'Zen Maru Gothic', data, weight, style: 'normal' }
}

/**
 * satori に渡すものと同じフォントのバッファ。isolate 内で1回だけ読み込み、文字幅の実測（og-text-metrics.ts）も同じ配列を使う。
 */
export const loadOgFonts = (env: Bindings, origin: string): Promise<OgFont[]> => {
  if (resources.fonts) return resources.fonts
  const fonts = Promise.all([loadFont(env, origin, 500), loadFont(env, origin, 700)])
  resources.fonts = fonts
  fonts.catch(() => {
    delete resources.fonts
  })
  return fonts
}

dayjs.extend(utc)
const formatJstDate = (d: Date): string => dayjs.utc(d).utcOffset(540).format('YYYY/MM/DD')

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

const buildVDom = (e: EventOgInput): ReactElement => {
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
    key: null,
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

/** 描画してよい画像の高さ。幅は 1200 固定で、追加・更新と OG は 1200x630、毎朝・毎週は 1200x675。 */
export const OG_IMAGE_HEIGHTS = [630, 675] as const
export type OgImageHeight = (typeof OG_IMAGE_HEIGHTS)[number]
const isOgImageHeight = (height: number): height is OgImageHeight => OG_IMAGE_HEIGHTS.some((item) => item === height)

export const renderOgPng = async (
  env: Bindings,
  origin: string,
  element: ReactNode,
  height: OgImageHeight
): Promise<Uint8Array<ArrayBuffer>> => {
  // 型で絞っていても、呼び出し側が数値を組み立てたときのために実行時にも確かめる。
  if (!isOgImageHeight(height)) throw new Error(`OG images must be 1200x630 or 1200x675: ${height}`)
  await ensureWasm()
  const fonts = await loadOgFonts(env, origin)
  const svg = await satori(element, { width: 1200, height, fonts })
  const renderer = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } })
  try {
    const image = renderer.render()
    try {
      if (image.width !== 1200 || image.height !== height) throw new Error('Unexpected OG image dimensions')
      const png = new Uint8Array(image.asPng())
      if (png.byteLength > 5_000_000) throw new Error('OG image exceeds attachment size limit')
      return png
    } finally {
      image.free()
    }
  } finally {
    renderer.free()
  }
}

export const renderEventOgImage = (env: Bindings, origin: string, e: EventOgInput): Promise<Uint8Array<ArrayBuffer>> =>
  renderOgPng(env, origin, buildVDom(e), 630)
