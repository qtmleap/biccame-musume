import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import sharp from 'sharp'
import { getCanonicalPose, STAMPCAMERA_POSES } from '@/lib/stampcamera-map'
import {
  AVATAR_DIAMETER,
  AVATAR_EXCLUDED_KEYS,
  avatarGeometry,
  avatarOutPath,
  avatarTargets,
  cropSquare,
  generateAvatar,
  loadCharacters,
  renderAvatar,
  resolveAvatarSource
} from '../scripts/generate-og-avatars'

const PUBLIC_DIR = resolve(import.meta.dir, '../workers/web/public')
const workDir = mkdtempSync(resolve(tmpdir(), 'og-avatars-'))
afterAll(() => rmSync(workDir, { recursive: true, force: true }))

const loadImagesOf = (key: string): string[] => {
  const found = loadCharacters(resolve(PUBLIC_DIR, 'characters.json')).find(({ id }) => id === key)
  return found === undefined ? [] : found.images
}

const touch = (path: string) => {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, '')
}

/** 透明な 400x1000 の中央付近に赤い 200x600 の全身絵を置いた素材 (trim すると 200x600 になる) */
const writeSyntheticSource = async (path: string) => {
  const body = await sharp({
    create: { width: 200, height: 600, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } }
  })
    .png()
    .toBuffer()
  await sharp({
    create: { width: 400, height: 1000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: body, left: 100, top: 200 }])
    .png()
    .toFile(path)
}

const pixelAt = async (png: Buffer, x: number, y: number): Promise<number[]> => {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  const offset = (y * info.width + x) * info.channels
  return [...data.subarray(offset, offset + info.channels)]
}

describe('avatar geometry', () => {
  test('crops a bust-up square from the top of the trimmed figure', () => {
    // 縦長の全身絵: 幅が高さ × 0.6 より狭いので幅いっぱい
    expect(cropSquare({ width: 200, height: 600 })).toEqual({ left: 0, top: 0, side: 200 })
    // 幅広の絵: 高さ × 0.6 で頭打ちになり、左右は中央から取る
    expect(cropSquare({ width: 500, height: 600 })).toEqual({ left: 70, top: 0, side: 360 })
  })

  test('scales the face to 92% and keeps the ring at least 3px', () => {
    expect(avatarGeometry(AVATAR_DIAMETER)).toEqual({ inner: 294, ring: 8 })
    expect(avatarGeometry(40)).toEqual({ inner: 37, ring: 3 })
  })

  test('writes one PNG per store key', () => {
    expect(avatarOutPath('/out/avatars', 'chofu')).toBe('/out/avatars/chofu.png')
  })
})

describe('avatar targets', () => {
  const characters = loadCharacters(resolve(PUBLIC_DIR, 'characters.json'))
  const targets = avatarTargets(
    characters.map(({ id }) => id),
    Object.keys(STAMPCAMERA_POSES)
  )

  test('covers every store key an event can target except the excluded ones', () => {
    const expected = StoreKeySchema.options.filter((key) => !AVATAR_EXCLUDED_KEYS.includes(key))
    expect(expected.length).toBeGreaterThan(0)
    for (const key of expected) {
      expect(targets).toContain(key)
    }
  })

  test('never targets biccamera, whose material is a company logo', () => {
    expect(AVATAR_EXCLUDED_KEYS).toContain('biccamera')
    expect(targets).not.toContain('biccamera')
    // 除外は biccamera だけ。naisen (線画のマスコット) は出力対象のまま
    expect(targets).toContain('naisen')
  })

  test('covers every stampcamera pose key without duplicates', () => {
    for (const key of Object.keys(STAMPCAMERA_POSES)) {
      expect(targets).toContain(key)
    }
    expect(new Set(targets).size).toBe(targets.length)
  })
})

describe('avatar source resolution', () => {
  test('prefers the canonical stampcamera pose', () => {
    const publicDir = resolve(workDir, 'prefer-stamp')
    const pose = getCanonicalPose('mito')
    if (pose === undefined) throw new Error('mito must have a stampcamera pose')
    const stamp = resolve(
      publicDir,
      'images/stamps',
      `${pose.packageId}-${String(pose.stickerId).padStart(3, '0')}.webp`
    )
    touch(stamp)
    touch(resolve(publicDir, 'images/characters/mito4.webp'))
    expect(resolveAvatarSource(publicDir, 'mito', ['mito3.png', 'mito4.png'])).toBe(stamp)
  })

  test('falls back to the biccame.jp image, preferring *4.png, then the last one', () => {
    const publicDir = resolve(workDir, 'fallback')
    const four = resolve(publicDir, 'images/characters/images/foo4.webp')
    touch(four)
    touch(resolve(publicDir, 'images/characters/images/foo5.webp'))
    expect(
      resolveAvatarSource(publicDir, 'not-a-pose-key', ['images/foo3.png', 'images/foo4.png', 'images/foo5.png'])
    ).toBe(four)
    // stampcamera のポーズがあっても、スタンプのファイルが無ければ biccame.jp 由来へ落ちる
    expect(resolveAvatarSource(publicDir, 'mito', ['images/foo4.png'])).toBe(four)
    expect(resolveAvatarSource(publicDir, 'not-a-pose-key', ['images/foo5.png'])).toBe(
      resolve(publicDir, 'images/characters/images/foo5.webp')
    )
  })

  test('returns undefined when no material exists', () => {
    const publicDir = resolve(workDir, 'empty')
    expect(resolveAvatarSource(publicDir, 'not-a-pose-key', ['images/foo4.png'])).toBeUndefined()
    expect(resolveAvatarSource(publicDir, 'not-a-pose-key', [])).toBeUndefined()
  })
})

describe('avatar rendering', () => {
  test('draws a circular 320px avatar with a ring and a bottom-aligned bust-up', async () => {
    const source = resolve(workDir, 'source.png')
    await writeSyntheticSource(source)
    const png = await renderAvatar(source)

    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(AVATAR_DIAMETER)
    expect(meta.height).toBe(AVATAR_DIAMETER)
    // 四隅は円の外なので透明
    expect((await pixelAt(png, 0, 0))[3]).toBe(0)
    expect((await pixelAt(png, 319, 319))[3]).toBe(0)
    // 上端中央は縁 (#f4b6c3)
    expect(await pixelAt(png, 160, 1)).toEqual([0xf4, 0xb6, 0xc3, 255])
    // 顔は下端に揃うので、上側 (縁の内側) は白背景
    expect(await pixelAt(png, 160, 15)).toEqual([255, 255, 255, 255])
    // 中央は trim 後の全身絵 (赤) の上端から取った領域
    expect(await pixelAt(png, 160, 160)).toEqual([255, 0, 0, 255])
  })

  test('skips a key without material and never throws', async () => {
    const outDir = resolve(workDir, 'out-missing')
    mkdirSync(outDir, { recursive: true })
    const result = await generateAvatar({
      key: 'ghost',
      images: [],
      publicDir: resolve(workDir, 'empty'),
      outDir,
      force: false
    })
    expect(result).toEqual({ key: 'ghost', status: 'missing', bytes: 0 })
    expect(existsSync(avatarOutPath(outDir, 'ghost'))).toBe(false)
  })

  test('reuses an existing file unless forced', async () => {
    const publicDir = resolve(workDir, 'reuse')
    const outDir = resolve(workDir, 'out-reuse')
    mkdirSync(outDir, { recursive: true })
    mkdirSync(resolve(publicDir, 'images/characters'), { recursive: true })
    await writeSyntheticSource(resolve(publicDir, 'images/characters/foo4.webp'))
    const params = { key: 'foo', images: ['foo4.png'], publicDir, outDir }

    const first = await generateAvatar({ ...params, force: false })
    expect(first.status).toBe('generated')
    expect(first.bytes).toBeGreaterThan(0)
    expect((await generateAvatar({ ...params, force: false })).status).toBe('cached')
    expect((await generateAvatar({ ...params, force: true })).status).toBe('generated')
    expect(existsSync(`${avatarOutPath(outDir, 'foo')}.tmp`)).toBe(false)
  })

  // 素材はダウンロード済みの環境でだけ検査する (CI ではビルド前に images:download が走る)
  const mitoSource = resolveAvatarSource(PUBLIC_DIR, 'mito', loadImagesOf('mito'))
  test.skipIf(mitoSource === undefined)('renders a real character from the downloaded material', async () => {
    if (mitoSource === undefined) return
    const meta = await sharp(await renderAvatar(mitoSource)).metadata()
    expect([meta.width, meta.height]).toEqual([AVATAR_DIAMETER, AVATAR_DIAMETER])
  })
})
