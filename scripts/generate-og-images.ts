/**
 * Generate per-character OG images at build time.
 *
 * Reads public/characters.json, fetches each character's SD portrait, composes a
 * 1200x630 OG card with satori, rasterizes it with resvg, and writes the PNG to
 * public/og/characters/{id}.png.
 *
 * Image source priority:
 *   1. stampcamera_package_id present → fetch transparent SD image from
 *      stampcamera.com/packages/{id}/package.zip (cached under .cache/stamp-packages/)
 *   2. fall back to biccame.jp/profile/ images[]
 *
 * Run via:
 *   bun run scripts/generate-og-images.ts
 *
 * Hooked into prebuild so production deploys always have fresh images. Output is
 * gitignored — regenerate locally if you want them for `vite dev`.
 *
 * NOTE: stampcamera.com の SSL 証明書が時々期限切れになるため、ビルド時のみ
 * NODE_TLS_REJECT_UNAUTHORIZED=0 を設定して証明書検証をバイパスする。プロセス
 * 全体スコープなのでこのスクリプト以外のネットワークコールも無効化される点に注意。
 */

import { Resvg } from '@resvg/resvg-js'
import { unzipSync } from 'fflate'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import satori from 'satori'

// stampcamera.com の証明書が期限切れの間バイパスするためのビルド時専用フラグ。
// import 解決後・fetch 実行前に必ず設定するためモジュール先頭で代入する。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const ROOT = resolve(import.meta.dir, '..')
const PUBLIC_DIR = resolve(ROOT, 'public')
const OUT_DIR = resolve(PUBLIC_DIR, 'og/characters')
const CHARACTERS_JSON = resolve(PUBLIC_DIR, 'characters.json')
const STAMP_CACHE_DIR = resolve(ROOT, '.cache/stamp-packages')
const FONT_REGULAR = resolve(
  ROOT,
  'node_modules/@fontsource/zen-maru-gothic/files/zen-maru-gothic-japanese-500-normal.woff'
)
const FONT_BOLD = resolve(
  ROOT,
  'node_modules/@fontsource/zen-maru-gothic/files/zen-maru-gothic-japanese-700-normal.woff'
)

type RawCharacter = {
  id: string
  character: {
    name: string
    description: string
    images: string[]
    is_biccame_musume?: boolean
    stampcamera_package_id?: number
  }
  store?: { name?: string }
  prefecture?: string | null
}

const pickCanonicalImage = (images: string[]): string => {
  const preferred = images.findLast((url) => url.endsWith('4.png'))
  const key = preferred ?? images[images.length - 1]
  return new URL(key, 'https://biccame.jp/profile/').href
}

const bufferToDataUrl = (buf: Buffer, mime = 'image/png'): string =>
  `data:${mime};base64,${buf.toString('base64')}`

const fetchImageAsDataUrl = async (url: string): Promise<string> => {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`)
  }
  return bufferToDataUrl(Buffer.from(await res.arrayBuffer()), res.headers.get('content-type') ?? 'image/png')
}

/**
 * stampcamera.com のパッケージ zip を取得して transparent SD 画像 (images/001.png) を
 * 抽出する。一度展開した PNG は .cache/stamp-packages/{id}.png にキャッシュ。
 */
const fetchStampcameraImage = async (packageId: number): Promise<string> => {
  const cachePath = resolve(STAMP_CACHE_DIR, `${packageId}.png`)
  if (existsSync(cachePath)) {
    return bufferToDataUrl(await readFile(cachePath))
  }

  const url = `https://stampcamera.com/packages/${packageId}/package.zip`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`)
  }
  const zipBuf = new Uint8Array(await res.arrayBuffer())
  const entries = unzipSync(zipBuf, {
    filter: (file) => file.name === `${packageId}/images/001.png`
  })
  const imageBytes = entries[`${packageId}/images/001.png`]
  if (!imageBytes) {
    throw new Error(`images/001.png not found in package ${packageId}`)
  }

  await mkdir(STAMP_CACHE_DIR, { recursive: true })
  await writeFile(cachePath, imageBytes)
  return bufferToDataUrl(Buffer.from(imageBytes))
}

const resolveCharacterImage = async (c: RawCharacter): Promise<string> => {
  if (c.character.stampcamera_package_id !== undefined) {
    try {
      return await fetchStampcameraImage(c.character.stampcamera_package_id)
    } catch (err) {
      console.warn(
        `[og]  ! ${c.id}: stampcamera fallback to biccame.jp (${err instanceof Error ? err.message : err})`
      )
    }
  }
  return fetchImageAsDataUrl(pickCanonicalImage(c.character.images))
}

const buildOgVDom = (params: {
  name: string
  storeName: string
  description: string
  imageDataUrl: string
}) => {
  const { name, storeName, description, imageDataUrl } = params
  return {
    type: 'div',
    props: {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'row',
        background: 'linear-gradient(135deg, #fff5f5 0%, #ffe4e4 50%, #ffd0d0 100%)',
        fontFamily: 'Zen Maru Gothic',
        position: 'relative'
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '8px',
              background: '#dc2626'
            }
          }
        },
        {
          type: 'div',
          props: {
            style: {
              width: '520px',
              height: '630px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px'
            },
            children: [
              {
                type: 'img',
                props: {
                  src: imageDataUrl,
                  width: 420,
                  height: 420,
                  style: {
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 12px 32px rgba(220, 38, 38, 0.25))'
                  }
                }
              }
            ]
          }
        },
        {
          type: 'div',
          props: {
            style: {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '64px 64px 64px 0'
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '24px',
                    color: '#dc2626',
                    fontWeight: 700,
                    marginBottom: '16px',
                    letterSpacing: '0.05em'
                  },
                  children: '#ビッカメ娘'
                }
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '76px',
                    color: '#1a1a1a',
                    fontWeight: 700,
                    lineHeight: 1.1,
                    marginBottom: '20px'
                  },
                  children: name
                }
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '24px',
                    color: '#525252',
                    fontWeight: 500,
                    marginBottom: '32px',
                    lineHeight: 1.4
                  },
                  children: storeName
                }
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '20px',
                    color: '#737373',
                    fontWeight: 500,
                    lineHeight: 1.6,
                    display: '-webkit-box',
                    overflow: 'hidden'
                  },
                  children: description
                }
              },
              {
                type: 'div',
                props: {
                  style: {
                    marginTop: 'auto',
                    paddingTop: '32px',
                    fontSize: '20px',
                    color: '#1a1a1a',
                    fontWeight: 700
                  },
                  children: 'ビッカメ娘 推し活応援プロジェクト'
                }
              }
            ]
          }
        }
      ]
    }
  }
}

const truncate = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)

const main = async () => {
  const [charactersRaw, fontRegular, fontBold] = await Promise.all([
    readFile(CHARACTERS_JSON, 'utf-8'),
    readFile(FONT_REGULAR),
    readFile(FONT_BOLD)
  ])

  const characters = JSON.parse(charactersRaw) as RawCharacter[]
  const targets = characters.filter((c) => c.character.is_biccame_musume !== false)

  if (!existsSync(OUT_DIR)) {
    await mkdir(OUT_DIR, { recursive: true })
  }

  console.log(`[og] generating ${targets.length} character OG images → ${OUT_DIR}`)

  const fonts = [
    { name: 'Zen Maru Gothic', data: fontRegular, weight: 500 as const, style: 'normal' as const },
    { name: 'Zen Maru Gothic', data: fontBold, weight: 700 as const, style: 'normal' as const }
  ]

  let ok = 0
  let fail = 0
  for (const c of targets) {
    try {
      const imageDataUrl = await resolveCharacterImage(c)

      // biome-ignore lint/suspicious/noExplicitAny: satori's VDom type accepts loose object trees
      const vdom = buildOgVDom({
        name: c.character.name,
        storeName: c.store?.name ?? c.prefecture ?? 'ビックカメラ店舗',
        description: truncate(c.character.description, 120),
        imageDataUrl
      }) as any

      const svg = await satori(vdom, { width: 1200, height: 630, fonts })
      const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()

      const outPath = resolve(OUT_DIR, `${c.id}.png`)
      await mkdir(dirname(outPath), { recursive: true })
      await writeFile(outPath, png)
      ok += 1
      console.log(`[og]  ✓ ${c.id}`)
    } catch (err) {
      fail += 1
      console.error(`[og]  ✗ ${c.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`[og] done: ${ok} ok, ${fail} failed`)
  if (fail > 0 && ok === 0) {
    process.exit(1)
  }
}

await main()
