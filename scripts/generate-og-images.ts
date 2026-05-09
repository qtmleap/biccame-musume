/**
 * Generate per-character OG images at build time.
 *
 * Reads public/characters.json, loads each character's SD portrait from the
 * locally cached image folders (populated by download-character-images.ts),
 * composes a 1200x630 OG card with satori, rasterizes it with resvg, and writes
 * the PNG to public/og/characters/{id}.png.
 *
 * Image source priority:
 *   1. STAMPCAMERA_POSES に登録があれば public/images/stamps/ から透過 SD 画像
 *   2. fall back to biccame.jp 由来の public/images/characters/ 配下
 *
 * Run via:
 *   bun run scripts/generate-og-images.ts
 *
 * Hooked into prebuild (after images:download). Output is gitignored —
 * regenerate locally if you want them for `vite dev`.
 */

import { Resvg } from '@resvg/resvg-js'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import satori from 'satori'
import sharp from 'sharp'
import { getCanonicalPose, type StampcameraEntry } from '../src/lib/stampcamera-map'

const ROOT = resolve(import.meta.dir, '..')
const PUBLIC_DIR = resolve(ROOT, 'public')
const OUT_DIR = resolve(PUBLIC_DIR, 'og/characters')
const CHARACTERS_JSON = resolve(PUBLIC_DIR, 'characters.json')
const BICCAME_LOCAL_DIR = resolve(PUBLIC_DIR, 'images/characters')
const STAMPS_LOCAL_DIR = resolve(PUBLIC_DIR, 'images/stamps')
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
  }
  store?: { name?: string }
  prefecture?: string | null
}

const padStickerId = (n: number): string => String(n).padStart(3, '0')

const bufferToDataUrl = (buf: Buffer, mime = 'image/png'): string =>
  `data:${mime};base64,${buf.toString('base64')}`

/**
 * satori は WebP を直接デコードできない (PNG/JPEG のみ)。
 * ローカルは WebP で保存しているので、 sharp で PNG に戻してから data URL 化する。
 */
const readLocalAsDataUrl = async (filePath: string): Promise<string> => {
  const png = await sharp(await readFile(filePath)).png().toBuffer()
  return bufferToDataUrl(png)
}

const stampLocalPath = ({ packageId, stickerId }: StampcameraEntry): string =>
  resolve(STAMPS_LOCAL_DIR, `${packageId}-${padStickerId(stickerId)}.webp`)

const biccameLocalPath = (images: string[]): string => {
  const preferred = images.findLast((url) => url.endsWith('4.png'))
  const key = preferred ?? images[images.length - 1]
  return resolve(BICCAME_LOCAL_DIR, key.replace(/\.[^./]+$/, '.webp'))
}

/**
 * 画像はすべて事前に download-character-images.ts でローカル配置されている前提。
 * stampcamera のポーズが登録されていればそれを優先、なければ biccame.jp 由来の画像。
 */
const resolveCharacterImage = async (c: RawCharacter): Promise<string> => {
  const entry = getCanonicalPose(c.id)
  if (entry !== undefined) {
    const path = stampLocalPath(entry)
    if (existsSync(path)) return readLocalAsDataUrl(path)
    console.warn(`[og]  ! ${c.id}: stampcamera local file missing (${path}), falling back to biccame.jp`)
  }
  const path = biccameLocalPath(c.character.images)
  if (!existsSync(path)) {
    throw new Error(`Local biccame image not found: ${path} (run \`bun run images:download\` first)`)
  }
  return readLocalAsDataUrl(path)
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
              width: '600px',
              height: '630px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px'
            },
            children: [
              {
                type: 'img',
                props: {
                  src: imageDataUrl,
                  width: 560,
                  height: 560,
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
              padding: '56px 56px 56px 0'
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '28px',
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
                    fontSize: '28px',
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
                    fontSize: '24px',
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
                    fontSize: '24px',
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
  // is_biccame_musume===false でも stampcamera マップに登録されているキャラは生成対象に含める。
  // (air / bicsim 等、公式分類は外れるが OG カードは出したい例)
  const targets = characters.filter(
    (c) => c.character.is_biccame_musume !== false || getCanonicalPose(c.id) !== undefined
  )

  if (!existsSync(OUT_DIR)) {
    await mkdir(OUT_DIR, { recursive: true })
  }

  // FORCE_OG=1 で既存ファイルを無視して再生成する。CI ではキャッシュキーが入力ファイル
  // (script / map / characters.json) のハッシュに紐付いているため、key 一致 = ロジック未変更
  // とみなして既存 PNG をそのまま使い回す。
  const force = process.env.FORCE_OG === '1'

  console.log(`[og] generating ${targets.length} character OG images → ${OUT_DIR}${force ? ' (force)' : ''}`)

  const fonts = [
    { name: 'Zen Maru Gothic', data: fontRegular, weight: 500 as const, style: 'normal' as const },
    { name: 'Zen Maru Gothic', data: fontBold, weight: 700 as const, style: 'normal' as const }
  ]

  let ok = 0
  let skipped = 0
  let fail = 0
  for (const c of targets) {
    const outPath = resolve(OUT_DIR, `${c.id}.png`)
    if (!force && existsSync(outPath)) {
      skipped += 1
      continue
    }

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

      await mkdir(dirname(outPath), { recursive: true })
      await writeFile(outPath, png)
      ok += 1
      console.log(`[og]  ✓ ${c.id}`)
    } catch (err) {
      fail += 1
      console.error(`[og]  ✗ ${c.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`[og] done: ${ok} generated, ${skipped} cached, ${fail} failed`)
  if (fail > 0 && ok === 0) {
    process.exit(1)
  }
}

await main()
