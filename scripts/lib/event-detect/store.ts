import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { type DetectPost, DetectPostSchema } from '@biccame/shared/event-detect/post'
import { z } from 'zod'
import { parseArchivePage } from '../post-archive'
import type { StoreAccount } from './analysis'
import { type ApiContext, createApi } from './api'
import { type GoldEvent, GoldEventSchema } from './gold'
import { fromArchiveRecord } from './raw'
import { LabelSchema, type Labels } from './schema'

// .cache/event-detect/ 配下の入出力。どれもローカルのファイルで、外部には書かない。
// ビューワは bun dev（vite = node）上でも読み込むので、Bun 専用の API は使わない。

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'))

export const writeAtomic = async (path: string, body: string) => {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(tmp, body)
  await rename(tmp, path)
}

/**
 * JSONL を 1 行ずつ返す。node:readline は本文中の U+2028 や単独の CR でも行を分けるため使わない。
 */
export async function* readJsonLines(path: string): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  const state = { rest: '' }
  for await (const chunk of createReadStream(path)) {
    const lines = (state.rest + decoder.decode(chunk, { stream: true })).split('\n')
    // split は必ず 1 要素以上返す。末尾は次のチャンクと繋がる途中の行。
    state.rest = lines[lines.length - 1]
    yield* lines.slice(0, -1)
  }
  const last = state.rest + decoder.decode()
  if (last) yield last
}

/**
 * アーカイブの JSONL を 1 行ずつ変換する。1GB 近くあるので全体を読み込まない。
 */
type Conversion = { lines: number; posts: number; skipped: Record<string, number> }

/**
 * アーカイブのレコードを 1 件ずつ変換し、投稿 ID で重複を除いて書き出す。
 */
const convertRecords = async (
  records: AsyncIterable<unknown>,
  outPath: string,
  onProgress?: (lines: number) => void
): Promise<Conversion> => {
  const seen = new Set<string>()
  const output: string[] = []
  const skipped: Record<string, number> = {}
  const state = { lines: 0 }
  for await (const record of records) {
    state.lines += 1
    if (onProgress && state.lines % 10_000 === 0) onProgress(state.lines)
    const result = fromArchiveRecord(record)
    if ('skipped' in result) {
      increment(skipped, result.skipped)
      continue
    }
    if (seen.has(result.post.id)) {
      increment(skipped, 'duplicate')
      continue
    }
    seen.add(result.post.id)
    output.push(JSON.stringify(result.post))
  }
  await writeAtomic(outPath, `${output.join('\n')}\n`)
  return { lines: state.lines, posts: output.length, skipped }
}

async function* archiveLines(archivePath: string): AsyncGenerator<unknown> {
  for await (const line of readJsonLines(archivePath)) if (line.trim()) yield parseLine(line)
}

/**
 * アーカイブの JSONL を 1 行ずつ変換する。1GB 近くあるので全体を読み込まない。
 */
export const convertArchive = (archivePath: string, outPath: string, onProgress?: (lines: number) => void) =>
  convertRecords(archiveLines(archivePath), outPath, onProgress)

/**
 * ページの番号順に並べたファイル名（000001.json …）。
 */
const pageNames = async (pagesDir: string) =>
  (await readdir(pagesDir)).filter((name) => /^\d{6}\.json$/.test(name)).sort()

async function* pageRecords(pagesDir: string, onPageError: (name: string) => void): AsyncGenerator<unknown> {
  for (const name of await pageNames(pagesDir)) {
    const envelope = await readFile(resolve(pagesDir, name), 'utf8').then(parseLine, () => undefined)
    const response = PageEnvelopeSchema.safeParse(envelope)
    if (!response.success) {
      onPageError(name)
      continue
    }
    // 取得スクリプトと同じパーサで投稿に戻す。失敗したページ（エラー応答など）は数えて飛ばす
    const parsed = (() => {
      try {
        return parseArchivePage(response.data.response, 'list')
      } catch {
        return undefined
      }
    })()
    if (!parsed) {
      onPageError(name)
      continue
    }
    for (const post of parsed.posts) yield post
  }
}

const PageEnvelopeSchema = z.object({ version: z.literal(2), response: z.unknown() })

/**
 * list-timeline アーカイブのページ（pages/*.json）から直接変換する。posts.jsonl は取得の最後にしか
 * 書き直されないので、取得中のアーカイブはページの方が新しい。読むだけで取得中のジョブには触れない。
 */
export const convertArchivePages = async (
  pagesDir: string,
  outPath: string,
  onProgress?: (lines: number) => void
): Promise<Conversion & { pages: number; badPages: number }> => {
  const bad: string[] = []
  const pages = (await pageNames(pagesDir)).length
  const result = await convertRecords(
    pageRecords(pagesDir, (name) => bad.push(name)),
    outPath,
    onProgress
  )
  return { ...result, pages, badPages: bad.length }
}

const increment = (counts: Record<string, number>, key: string) => {
  counts[key] = key in counts ? counts[key] + 1 : 1
}

const parseLine = (line: string): unknown => {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

export const readPosts = async (path: string): Promise<DetectPost[]> => {
  const posts: DetectPost[] = []
  for await (const line of readJsonLines(path)) {
    if (!line.trim()) continue
    const parsed = DetectPostSchema.safeParse(parseLine(line))
    if (!parsed.success) throw new Error(`${path}:${posts.length + 1}: ${parsed.error.message}`)
    posts.push(parsed.data)
  }
  return posts
}

/**
 * prepare が書く変換元の情報。アーカイブの取得が終わっていない（complete=false）場合、
 * 期間内でも投稿が欠けていることがある。
 */
export const MetaSchema = z.object({
  archive: z.string().nonempty(),
  from: z.iso.datetime(),
  until: z.iso.datetime(),
  complete: z.boolean(),
  coverageVerified: z.boolean(),
  pages: z.number().int().nonnegative(),
  posts: z.number().int().nonnegative()
})

export type Meta = z.infer<typeof MetaSchema>

export const readMeta = async (path: string): Promise<Meta> => {
  const parsed = MetaSchema.safeParse(await readJson(path))
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message} (re-run prepare)`)
  return parsed.data
}

const ArchiveScopeSchema = z.object({ from: z.iso.datetime(), until: z.iso.datetime() })

const ArchiveManifestSchema = z.object({
  complete: z.boolean(),
  coverageVerified: z.boolean(),
  pages: z.number().int().nonnegative()
})

/**
 * list-timeline アーカイブの scope.json と manifest.json から期間と取得状況を読む。
 */
export const readArchiveState = async (archivePath: string) => {
  const scope = ArchiveScopeSchema.safeParse(await readJson(resolve(archivePath, '../scope.json')))
  if (!scope.success) throw new Error(`scope.json: ${scope.error.message}`)
  const manifest = ArchiveManifestSchema.safeParse(await readJson(resolve(archivePath, '../manifest.json')))
  if (!manifest.success) throw new Error(`manifest.json: ${manifest.error.message}`)
  return { ...scope.data, ...manifest.data }
}

const GoldFileSchema = z.object({ fetchedAt: z.iso.datetime(), source: z.url(), events: z.array(GoldEventSchema) })

export const writeGold = (path: string, source: string, events: readonly GoldEvent[], fetchedAt: string) =>
  writeAtomic(path, `${JSON.stringify({ fetchedAt, source, events }, null, 2)}\n`)

export const readGold = async (path: string) => {
  const parsed = GoldFileSchema.safeParse(await readJson(path))
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message}`)
  return parsed.data
}

const CharactersSchema = z.array(
  z.object({
    id: z.string().nonempty(),
    character: z.object({ name: z.string().nonempty(), twitter_id: z.string().nonempty().optional() })
  })
)

/**
 * characters.json の店舗アカウント。bot 通知用の固定 40 店舗ではなく、X アカウントを持つ全店舗。
 */
export const readStoreAccounts = async (path: string): Promise<StoreAccount[]> => {
  const parsed = CharactersSchema.safeParse(await readJson(path))
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message}`)
  return parsed.data.flatMap(({ id, character }) =>
    character.twitter_id ? [{ storeId: id, name: character.name, screenName: character.twitter_id }] : []
  )
}

const StoreNamesSchema = z.array(
  z.object({
    id: z.string().nonempty(),
    character: z.object({ name: z.string().nonempty() }),
    store: z.object({ name: z.string().nonempty().nullable().optional() }).nullable().optional()
  })
)

/**
 * 店舗キー → 本文に出てくる呼び名（キャラ名・店舗名）。店舗の候補を本文から拾うのに使う。
 */
export const readStoreNames = async (path: string): Promise<Map<string, string[]>> => {
  const parsed = StoreNamesSchema.safeParse(await readJson(path))
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message}`)
  return new Map(
    parsed.data.map(({ id, character, store }) => [
      id,
      [character.name, ...(store?.name ? [store.name.replace(/^ビックカメラ\s*/, '')] : [])]
    ])
  )
}

/** キャラクター名（救済語に使う）。characters.json の全キャラクター */
export const readCharacterNames = async (path: string): Promise<string[]> =>
  [...(await readStoreNames(path)).values()].map((names) => names[0])

const LabelsFileSchema = z.record(z.string().regex(/^\d+$/), LabelSchema)

export const readLabels = async (path: string): Promise<Labels> => {
  if (!existsSync(path)) return {}
  const parsed = LabelsFileSchema.safeParse(await readJson(path))
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message}`)
  return parsed.data
}

export const writeLabels = (path: string, labels: Labels) => writeAtomic(path, `${JSON.stringify(labels, null, 2)}\n`)

/**
 * prepare 済みの .cache/event-detect を読み込み、ビューワの API を作る。手動ラベルだけを書き戻す。
 */
export const loadViewerApi = async (options: { dir: string; charactersPath: string; now: ApiContext['now'] }) => {
  const labelsPath = resolve(options.dir, 'labels.json')
  const [posts, gold, accounts, characterNames, labels, meta] = await Promise.all([
    readPosts(resolve(options.dir, 'posts.jsonl')),
    readGold(resolve(options.dir, 'gold.json')),
    readStoreAccounts(options.charactersPath),
    readCharacterNames(options.charactersPath),
    readLabels(labelsPath),
    readMeta(resolve(options.dir, 'meta.json'))
  ])
  return createApi({
    posts,
    events: gold.events,
    accounts,
    characterNames,
    source: {
      archive: meta.archive,
      from: meta.from,
      until: meta.until,
      complete: meta.complete,
      pages: meta.pages,
      goldFetchedAt: gold.fetchedAt
    },
    labels,
    saveLabels: (next) => writeLabels(labelsPath, next),
    now: options.now
  })
}
