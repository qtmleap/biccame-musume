/**
 * Generate per-character circular avatar PNGs at build time.
 *
 * 投稿画像 (X / Discord) の丸 Avatar は Workers 上では sharp が使えないため、ビルド時に
 * 店舗キーごとに直径 320px の丸 PNG を作り、ASSETS から読んで data URL にして satori へ渡す。
 * 描画側は <img width=d height=d> で縮小して使う (104 / 300 / 250 / 215px)。
 *
 * 切り抜きは試作 (.cache/og-lab/render-v2.tsx の avatar()) と同じ:
 *   1. 透明余白を trim した全身絵から、幅 min(幅, 高さ × 0.6) の正方形を上から取る (バストアップ)
 *   2. 直径の 92% に縮小し、白背景の下端に揃えて重ねる
 *   3. 円形マスクで抜き、白い縁 + 薄ピンク (#f4b6c3) の縁を重ねる
 *
 * Image source priority (generate-og-images.ts の resolveCharacterImage と同じ):
 *   1. STAMPCAMERA_POSES に登録があれば workers/web/public/images/stamps/ から透過 SD 画像
 *   2. fall back to biccame.jp 由来の workers/web/public/images/characters/ 配下
 *
 * 素材が無いキーは警告を出して飛ばす (例外にしない)。描画側は「ビ」の丸印にフォールバックする。
 *
 * Output (gitignored):
 *   workers/web/public/og/avatars/{storeKey}.png
 *
 * Run via:
 *   bun run scripts/generate-og-avatars.ts
 *
 * Hooked after generate-og-images.ts in CI. FORCE_OG=1 で既存ファイルを無視して再生成する。
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { z } from 'zod'
import { getCanonicalPose, STAMPCAMERA_POSES, type StampcameraEntry } from '@/lib/stampcamera-map'

const ROOT = resolve(import.meta.dir, '..')
const PUBLIC_DIR = resolve(ROOT, 'workers/web/public')
const OUT_DIR = resolve(PUBLIC_DIR, 'og/avatars')

/** 出力する丸 PNG の直径。描画側はここから縮小して使うので、最大の利用径 (300px) より少し大きく取る */
export const AVATAR_DIAMETER = 320
/** 縁の色 (薄ピンク) */
const RING_COLOR = '#f4b6c3'

const CharactersSchema = z.array(
  z.object({
    id: z.string().nonempty(),
    character: z.object({ images: z.array(z.string().nonempty()) })
  })
)

export type AvatarCharacter = { id: string; images: string[] }

export type AvatarResult = {
  key: string
  status: 'generated' | 'cached' | 'missing' | 'failed'
  /** 出力ファイルのバイト数。generated / cached 以外は 0 */
  bytes: number
}

export const loadCharacters = (charactersJsonPath: string): AvatarCharacter[] => {
  const parsed = CharactersSchema.safeParse(JSON.parse(readFileSync(charactersJsonPath, 'utf-8')))
  if (!parsed.success) {
    throw new Error(`Invalid characters.json: ${parsed.error.message}`)
  }
  return parsed.data.map(({ id, character }) => ({ id, images: character.images }))
}

/**
 * Avatar を作らない店舗キー。
 * biccamera の素材は 330px の会社ロゴでキャラの絵ではなく、バストアップの円切り抜きが成り立たない。
 * 描画側は PNG が無いキーを「ビ」の丸印にフォールバックするので、ここで外せば足りる。
 */
export const AVATAR_EXCLUDED_KEYS: readonly string[] = ['biccamera']

/**
 * 生成対象の店舗キー。characters.json の全キャラ + STAMPCAMERA_POSES のキーから除外キーを引いたもの。
 * generate-og-images.ts は is_biccame_musume === false のキャラ (biccamera など) を外すが、
 * 丸 Avatar はイベントの対象になり得る店舗キー (StoreKey) を、除外キー以外すべて覆う必要があるため外さない。
 */
export const avatarTargets = (characterIds: string[], poseKeys: string[]): string[] =>
  [...new Set([...characterIds, ...poseKeys])].filter((key) => !AVATAR_EXCLUDED_KEYS.includes(key))

export const avatarOutPath = (outDir: string, key: string): string => resolve(outDir, `${key}.png`)

/** trim 後の全身絵から取るバストアップの正方形 (幅は min(幅, 高さ × 0.6)、上端から、左右は中央) */
export const cropSquare = ({ width, height }: { width: number; height: number }) => {
  const side = Math.min(width, Math.round(height * 0.6))
  return { left: Math.round((width - side) / 2), top: 0, side }
}

/** 直径 d に対する、縮小後の顔の一辺と縁の太さ */
export const avatarGeometry = (diameter: number) => ({
  inner: Math.round(diameter * 0.92),
  ring: Math.max(3, Math.round(diameter / 40))
})

const padStickerId = (n: number): string => String(n).padStart(3, '0')

const stampLocalPath = (publicDir: string, { packageId, stickerId }: StampcameraEntry): string =>
  resolve(publicDir, 'images/stamps', `${packageId}-${padStickerId(stickerId)}.webp`)

/** biccame.jp 由来の画像は *4.png (SD) を優先し、無ければ末尾。ローカルは WebP で保存している */
const biccameLocalPath = (publicDir: string, images: string[]): string | undefined => {
  const preferred = images.findLast((url) => url.endsWith('4.png'))
  const key = preferred === undefined ? images.at(-1) : preferred
  return key === undefined ? undefined : resolve(publicDir, 'images/characters', key.replace(/\.[^./]+$/, '.webp'))
}

/** 素材のパス。stampcamera の正準ポーズ → biccame.jp 由来の順で、実在するものを返す。無ければ undefined */
export const resolveAvatarSource = (publicDir: string, key: string, images: string[]): string | undefined => {
  const entry = getCanonicalPose(key)
  if (entry !== undefined) {
    const stamp = stampLocalPath(publicDir, entry)
    if (existsSync(stamp)) return stamp
  }
  const biccame = biccameLocalPath(publicDir, images)
  return biccame !== undefined && existsSync(biccame) ? biccame : undefined
}

/** 素材から丸 Avatar の PNG を作る (render-v2.tsx の avatar() と同じ手順) */
export const renderAvatar = async (sourcePath: string, diameter = AVATAR_DIAMETER): Promise<Buffer> => {
  // trim 後の寸法を次の処理へ渡すため、パイプラインを分ける
  const { data, info } = await sharp(await readFile(sourcePath))
    .ensureAlpha()
    .trim({ threshold: 8 })
    .png()
    .toBuffer({ resolveWithObject: true })
  const { left, top, side } = cropSquare(info)
  const { inner, ring } = avatarGeometry(diameter)
  const face = await sharp(data)
    .extract({ left, top, width: side, height: side })
    .resize(inner, inner, { kernel: 'lanczos3' })
    .png()
    .toBuffer()
  const mask = Buffer.from(
    `<svg width="${diameter}" height="${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="#fff"/></svg>`
  )
  const edge = Buffer.from(
    `<svg width="${diameter}" height="${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2 - ring / 2}" fill="none" stroke="${RING_COLOR}" stroke-width="${ring}"/></svg>`
  )
  const masked = await sharp({ create: { width: diameter, height: diameter, channels: 4, background: '#ffffff' } })
    .composite([
      { input: face, left: Math.round((diameter - inner) / 2), top: diameter - inner },
      { input: mask, blend: 'dest-in' }
    ])
    .png()
    .toBuffer()
  return sharp(masked)
    .composite([{ input: edge }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** 1 キー分を生成する。素材欠損・生成失敗でも例外は投げず、結果として返す */
export const generateAvatar = async (params: {
  key: string
  images: string[]
  publicDir: string
  outDir: string
  force: boolean
}): Promise<AvatarResult> => {
  const { key, images, publicDir, outDir, force } = params
  const outPath = avatarOutPath(outDir, key)
  if (!force && existsSync(outPath)) {
    return { key, status: 'cached', bytes: (await stat(outPath)).size }
  }
  const source = resolveAvatarSource(publicDir, key, images)
  if (source === undefined) {
    console.warn(`[og-avatar]  ! ${key}: no source image, skipped (runtime falls back to the initial badge)`)
    return { key, status: 'missing', bytes: 0 }
  }
  try {
    const png = await renderAvatar(source)
    // 書きかけのファイルを「生成済み」と誤認しないよう、一時ファイル経由で置き換える
    const tempPath = `${outPath}.tmp`
    await writeFile(tempPath, png)
    await rename(tempPath, outPath)
    return { key, status: 'generated', bytes: png.length }
  } catch (err) {
    console.error(`[og-avatar]  ✗ ${key}: ${err instanceof Error ? err.message : String(err)}`)
    return { key, status: 'failed', bytes: 0 }
  }
}

const countOf = (results: AvatarResult[], status: AvatarResult['status']): number =>
  results.filter((result) => result.status === status).length

const main = async () => {
  const characters = loadCharacters(resolve(PUBLIC_DIR, 'characters.json'))
  const imagesById = new Map(characters.map(({ id, images }) => [id, images]))
  const targets = avatarTargets(
    characters.map(({ id }) => id),
    Object.keys(STAMPCAMERA_POSES)
  )

  await mkdir(OUT_DIR, { recursive: true })

  // FORCE_OG=1 で既存ファイルを無視して再生成する。CI ではキャッシュキーが入力ファイル
  // (script / map / characters.json) のハッシュに紐付いているため、key 一致 = ロジック未変更
  // とみなして既存 PNG をそのまま使い回す。
  const force = process.env.FORCE_OG === '1'

  console.log(`[og-avatar] generating ${targets.length} avatars → ${OUT_DIR}${force ? ' (force)' : ''}`)

  const results: AvatarResult[] = []
  for (const key of targets) {
    const images = imagesById.get(key)
    const result = await generateAvatar({
      key,
      // STAMPCAMERA_POSES だけにあるキーは biccame.jp 由来の画像を持たない
      images: images === undefined ? [] : images,
      publicDir: PUBLIC_DIR,
      outDir: OUT_DIR,
      force
    })
    if (result.status === 'generated') console.log(`[og-avatar]  ✓ ${key} (${(result.bytes / 1024).toFixed(1)} KB)`)
    results.push(result)
  }

  const generated = countOf(results, 'generated')
  const cached = countOf(results, 'cached')
  const failed = countOf(results, 'failed')
  const missing = results.filter((result) => result.status === 'missing').map((result) => result.key)
  const totalBytes = results.reduce((sum, result) => sum + result.bytes, 0)
  console.log(
    `[og-avatar] done: ${generated} generated, ${cached} cached, ${missing.length} missing, ${failed} failed` +
      ` (total ${(totalBytes / 1024).toFixed(0)} KB)`
  )
  if (missing.length > 0) console.warn(`[og-avatar] missing: ${missing.join(', ')}`)
  // 何も用意できなかったときだけ失敗にする (欠損は描画側のフォールバックで吸収する)
  if (failed > 0 && generated + cached === 0) {
    process.exit(1)
  }
}

if (import.meta.main) {
  await main()
}
