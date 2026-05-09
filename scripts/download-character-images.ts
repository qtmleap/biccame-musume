/**
 * Download character images at build time so that the runtime UI doesn't
 * hot-link biccame.jp / stampcamera.com.
 *
 * Sources:
 *   1. biccame.jp/profile/{key}    — characters.json の images[] に列挙された 4 種類
 *      (yurukyara / SD / anime / pixel) のオリジナル画像
 *   2. stampcamera.com packages    — STAMPCAMERA_POSES に書かれたパッケージ × スタンプ番号
 *      (透過 SD 画像、複数ポーズ)
 *
 * Output:
 *   public/images/characters/{key}                — biccame.jp 画像 (相対パスを保つ)
 *   public/images/stamps/{packageId}-{NNN}.png    — stampcamera 画像 (キャラ非依存で重複排除)
 *
 * Run via:
 *   bun run scripts/download-character-images.ts
 *
 * Hooked into prebuild なので OG 生成より先に走る。 既存ファイルはスキップする
 * (idempotent) ので act/CI でキャッシュされていれば一瞬で終わる。
 */

import { unzipSync } from 'fflate'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { STAMPCAMERA_POSES } from './stampcamera-map'

// stampcamera.com の証明書が期限切れの間バイパスする。スクリプト内のみ。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const ROOT = resolve(import.meta.dir, '..')
const PUBLIC_DIR = resolve(ROOT, 'public')
const CHARACTERS_JSON = resolve(PUBLIC_DIR, 'characters.json')
const BICCAME_OUT_DIR = resolve(PUBLIC_DIR, 'images/characters')
const STAMPS_OUT_DIR = resolve(PUBLIC_DIR, 'images/stamps')

type RawCharacter = {
  id: string
  character: { name: string; images: string[]; is_biccame_musume?: boolean }
}

const padStickerId = (n: number): string => String(n).padStart(3, '0')

const downloadFile = async (url: string, outPath: string): Promise<'downloaded' | 'skipped'> => {
  if (existsSync(outPath)) return 'skipped'
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, buf)
  return 'downloaded'
}

const downloadBiccameImages = async (
  characters: RawCharacter[]
): Promise<{ downloaded: number; skipped: number; failed: number }> => {
  // 同じファイルを複数キャラが参照している可能性は低いがユニーク化しておく
  const keys = new Set<string>()
  for (const c of characters) {
    for (const k of c.character.images) keys.add(k)
  }

  let downloaded = 0
  let skipped = 0
  let failed = 0
  for (const key of keys) {
    const url = new URL(key, 'https://biccame.jp/profile/').href
    const outPath = resolve(BICCAME_OUT_DIR, key)
    try {
      const status = await downloadFile(url, outPath)
      if (status === 'downloaded') {
        downloaded += 1
        console.log(`[bic] ✓ ${key}`)
      } else {
        skipped += 1
      }
    } catch (err) {
      failed += 1
      console.error(`[bic] ✗ ${key}: ${err instanceof Error ? err.message : err}`)
    }
  }

  return { downloaded, skipped, failed }
}

/**
 * stampcamera は「同一パッケージ zip の中から複数スタンプを取り出す」ケースが多い
 * (例: パッケージ 53 から 50 体分のスタンプ)。 zip を 1 度 fetch すれば複数のスタンプ
 * を抜けるので、 packageId 単位で zip をメモリにロードして使い回す。
 */
const downloadStampcameraImages = async (): Promise<{
  downloaded: number
  skipped: number
  failed: number
}> => {
  const byPackage = new Map<number, Set<number>>()
  for (const poses of Object.values(STAMPCAMERA_POSES)) {
    for (const { packageId, stickerId } of poses) {
      const set = byPackage.get(packageId) ?? new Set<number>()
      set.add(stickerId)
      byPackage.set(packageId, set)
    }
  }

  let downloaded = 0
  let skipped = 0
  let failed = 0

  for (const [packageId, stickerIds] of byPackage) {
    // パッケージ内で 1 つでも未取得なら zip を fetch
    const missing = [...stickerIds].filter(
      (id) => !existsSync(resolve(STAMPS_OUT_DIR, `${packageId}-${padStickerId(id)}.png`))
    )
    if (missing.length === 0) {
      skipped += stickerIds.size
      continue
    }

    const url = `https://stampcamera.com/packages/${packageId}/package.zip`
    let zipBuf: Uint8Array
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      zipBuf = new Uint8Array(await res.arrayBuffer())
    } catch (err) {
      console.error(`[stamp] ✗ pkg ${packageId} zip: ${err instanceof Error ? err.message : err}`)
      failed += missing.length
      continue
    }

    const wantedNames = new Set(missing.map((id) => `${packageId}/images/${padStickerId(id)}.png`))
    const entries = unzipSync(zipBuf, { filter: (file) => wantedNames.has(file.name) })

    for (const stickerId of stickerIds) {
      const padded = padStickerId(stickerId)
      const outPath = resolve(STAMPS_OUT_DIR, `${packageId}-${padded}.png`)
      if (existsSync(outPath)) {
        skipped += 1
        continue
      }
      const entryName = `${packageId}/images/${padded}.png`
      const bytes = entries[entryName]
      if (!bytes) {
        console.error(`[stamp] ✗ ${entryName} missing in package`)
        failed += 1
        continue
      }
      await mkdir(dirname(outPath), { recursive: true })
      await writeFile(outPath, bytes)
      downloaded += 1
      console.log(`[stamp] ✓ ${packageId}-${padded}`)
    }
  }

  return { downloaded, skipped, failed }
}

const main = async () => {
  const charactersRaw = await readFile(CHARACTERS_JSON, 'utf-8')
  const characters = JSON.parse(charactersRaw) as RawCharacter[]

  console.log(`[dl] downloading character images → ${PUBLIC_DIR}/images/`)
  const bic = await downloadBiccameImages(characters)
  console.log(
    `[dl] biccame.jp: ${bic.downloaded} downloaded, ${bic.skipped} cached, ${bic.failed} failed`
  )

  const stamp = await downloadStampcameraImages()
  console.log(
    `[dl] stampcamera: ${stamp.downloaded} downloaded, ${stamp.skipped} cached, ${stamp.failed} failed`
  )

  if (bic.failed > 0 && bic.downloaded === 0) {
    process.exit(1)
  }
}

await main()
