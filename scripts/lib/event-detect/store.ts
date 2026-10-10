import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { ClefModelSchema } from '@biccame/shared/event-detect/clef'
import { type DetectPost, DetectPostSchema } from '@biccame/shared/event-detect/post'
import { z } from 'zod'
import { parseArchivePage } from '../post-archive'
import type { EmulatedFile, StoreAccount } from './analysis'
import { type ApiContext, createApi } from './api'
import { QUESTION_VERSION } from './decide'
import { EXTRACT_VERSION } from './extract'
import type { GapEventsFile } from './gap-events'
import { type GoldEvent, GoldEventSchema } from './gold'
import { JUDGE_MODEL } from './judge'
import { fromArchiveRecord } from './raw'
import {
  EmulatedIdSchema,
  EmulatedVerifySchema,
  GapCategorySchema,
  GapStatusSchema,
  GapVerifySchema,
  LabelSchema,
  type Labels
} from './schema'

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
 * アーカイブのレコードを 1 件ずつ変換し、投稿 ID で重複を除いて書き出す。birthdays（小文字のアカウント →
 * 記念日の JST 0 時）を渡すと、記念日より前の投稿は除く（before_birthday）。Map に無いアカウントは除かない。
 * 重複の判定を先にするので、記念日前の投稿は一度だけ before_birthday に数え、2 回目以降は duplicate になる。
 * よって posts + before_birthday は、重複を除いた変換できた投稿の数と一致する。
 */
const convertRecords = async (
  records: AsyncIterable<unknown>,
  outPath: string,
  onProgress?: (lines: number) => void,
  birthdays?: ReadonlyMap<string, number>
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
    const birthday = birthdays?.get(result.post.screenName.toLowerCase())
    if (birthday !== undefined && Date.parse(result.post.createdAt) < birthday) {
      increment(skipped, 'before_birthday')
      continue
    }
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
export const convertArchive = (
  archivePath: string,
  outPath: string,
  onProgress?: (lines: number) => void,
  birthdays?: ReadonlyMap<string, number>
) => convertRecords(archiveLines(archivePath), outPath, onProgress, birthdays)

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
  onProgress?: (lines: number) => void,
  birthdays?: ReadonlyMap<string, number>
): Promise<Conversion & { pages: number; badPages: number }> => {
  const bad: string[] = []
  const pages = (await pageNames(pagesDir)).length
  const result = await convertRecords(
    pageRecords(pagesDir, (name) => bad.push(name)),
    outPath,
    onProgress,
    birthdays
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
  pages: z.number().int().nonnegative(),
  posts: z.number().int().nonnegative(),
  /** 全履歴（all_history）の取得では from が null で、期間の下限が無い */
  effectiveScope: z.object({ from: z.iso.datetime().nullable() }).optional(),
  /** 取得した投稿の最古の日時 */
  minTimestamp: z.iso.datetime().optional()
})

/**
 * list-timeline アーカイブの scope.json と manifest.json から期間と取得状況を読む。全履歴の取得では
 * scope.json の from は実データの下限ではないので、manifest の minTimestamp を下限にする。
 */
export const readArchiveState = async (archivePath: string) => {
  const scope = ArchiveScopeSchema.safeParse(await readJson(resolve(archivePath, '../scope.json')))
  if (!scope.success) throw new Error(`scope.json: ${scope.error.message}`)
  const manifest = ArchiveManifestSchema.safeParse(await readJson(resolve(archivePath, '../manifest.json')))
  if (!manifest.success) throw new Error(`manifest.json: ${manifest.error.message}`)
  const { effectiveScope, minTimestamp } = manifest.data
  const from = effectiveScope?.from === null && minTimestamp !== undefined ? minTimestamp : scope.data.from
  return {
    from,
    until: scope.data.until,
    complete: manifest.data.complete,
    coverageVerified: manifest.data.coverageVerified,
    pages: manifest.data.pages,
    archivePosts: manifest.data.posts
  }
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

const StoreBirthdaysSchema = z.array(
  z.object({
    character: z.object({ twitter_id: z.string().nonempty().optional(), birthday: z.iso.date().optional() })
  })
)

/**
 * 店舗アカウント（小文字の twitter_id）→ 擬人化記念日の JST 0 時（epoch ミリ秒）。
 * 誕生日かアカウントの無いキャラクターは含めない。
 */
export const readStoreBirthdays = async (path: string): Promise<Map<string, number>> => {
  const parsed = StoreBirthdaysSchema.safeParse(await readJson(path))
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message}`)
  return new Map(
    parsed.data.flatMap(({ character }): [string, number][] =>
      character.twitter_id && character.birthday
        ? // 記念日は日本時間の暦日。実行環境のタイムゾーンに依らないよう +09:00 を明示して読む
          [[character.twitter_id.toLowerCase(), Date.parse(`${character.birthday}T00:00:00+09:00`)]]
        : []
    )
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

const GapEventsFileSchema = z.object({
  generatedAt: z.iso.datetime(),
  verify: z.object({ model: z.string().nonempty(), threshold: z.number() }).nullable(),
  processed: z.array(z.string().nonempty()),
  events: z.array(
    z.object({
      id: z.string().nonempty(),
      store: z.string().nonempty(),
      item: z.string().nonempty(),
      // emulate のイベントの category は extract の 4 つ。acsta は seed が題で付ける（seed.ts の judgeAcsta）ので、ここには来ない
      category: z.enum(['limited_card', 'regular_card', 'ackey', 'other']),
      status: GapStatusSchema,
      startDate: z.string().nonempty().optional(),
      endDate: z.string().nonempty().optional(),
      quantity: z.number().int().positive().optional(),
      endedAt: z.string().nonempty().optional(),
      startUnknown: z.boolean(),
      firstSeen: z.number(),
      lastSeen: z.number(),
      posts: z.array(
        z.object({
          postId: z.string().nonempty(),
          status: GapStatusSchema,
          index: z.number().int().nonnegative(),
          verify: GapVerifySchema.optional()
        })
      )
    })
  )
}) satisfies z.ZodType<GapEventsFile>

/** gaps コマンドが書く登録漏れ候補のイベント。コマンドを実行していなければ undefined */
export const readGapEvents = async (path: string): Promise<GapEventsFile | undefined> => {
  if (!existsSync(path)) return undefined
  const parsed = GapEventsFileSchema.safeParse(await readJson(path))
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message} (re-run gaps)`)
  return parsed.data
}

/**
 * emulate コマンドが書く結果のファイル名。emulate.ts の LINK_VERSION から作る名前と一致させる（テストで確かめる）。
 * emulate.ts は store.ts を import しているので、循環を避けて LINK_VERSION は読まずに文字列で持つ。
 */
export const EMULATED_FILE = 'emulated-v1.json'

const EmulatedDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * emulate の結果（EmulatedEvent）のうち、統計と LLM イベントの画面に使う項目。ほかの項目は読まない。
 * emulate.ts は store.ts を import しているので、循環を避けて型はここで Zod から作る。
 * 言及の再確認（verify）は、画面に出す choice・probability・merged だけを読む。
 */
const EmulatedEventSchema = z.object({
  id: EmulatedIdSchema,
  store: z.string().nonempty(),
  item: z.string().nonempty(),
  category: GapCategorySchema,
  status: GapStatusSchema,
  startDate: EmulatedDaySchema.optional(),
  endDate: EmulatedDaySchema.optional(),
  quantity: z.number().int().positive().optional(),
  endedAt: EmulatedDaySchema.optional(),
  startUnknown: z.boolean(),
  firstSeen: z.number(),
  lastSeen: z.number(),
  posts: z.array(
    z.object({
      postId: z.string().nonempty(),
      status: GapStatusSchema,
      index: z.number().int().nonnegative(),
      verify: EmulatedVerifySchema.optional()
    })
  )
})

export type EmulatedRecord = z.infer<typeof EmulatedEventSchema>

const EmulatedEventsSchema = z.array(EmulatedEventSchema)

/**
 * emulate コマンドが書く、作ったイベントの一覧。コマンドを実行していなければ undefined。
 * emulatedAt はファイルの更新時刻で、いつのエミュレート結果かを表す。
 */
export const readEmulatedEvents = async (dir: string): Promise<EmulatedFile | undefined> => {
  const path = resolve(dir, EMULATED_FILE)
  if (!existsSync(path)) return undefined
  // 更新時刻は中身より先に取る。読む間に書き換わっても、時刻が中身より新しくなることはない
  const info = await stat(path)
  const parsed = EmulatedEventsSchema.safeParse(await readJson(path))
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message} (re-run emulate)`)
  return { events: parsed.data, emulatedAt: info.mtime.toISOString() }
}

/** 判定キャッシュを 1 回に読むファイル数。3 万を超えるので、同時に開く数を絞る */
const JUDGEMENT_READ_CONCURRENCY = 64

/** 確率は 0〜1。整数の 0・1 もある */
const ProbabilitySchema = z.number().min(0).max(1)

/** judge コマンド（質問 v1）のキャッシュ。必要な項目だけ読む */
const JudgeCacheSchema = z.object({
  postId: z.string().nonempty(),
  answers: z.object({ is_event: ProbabilitySchema })
})

/** extract コマンド（質問 v2）のキャッシュ */
const ExtractCacheSchema = z.object({ postId: z.string().nonempty(), isEvent: ProbabilitySchema })

/** eval が残す Clef の判定。is_event は「はい」の確率（noul） */
const ClefCacheSchema = z.object({
  postId: z.string().nonempty(),
  model: ClefModelSchema,
  response: z.object({
    answers: z.object({ is_event: z.object({ type: z.literal('noul'), noul: ProbabilitySchema }) })
  })
})

/**
 * キャッシュのディレクトリの *.json を並列度を絞って 1 件ずつ読み、parse が値を返したものを返す。
 * 並びはファイル名の昇順で、読み終えた順に依らない。読めない・JSON でない・形が合わないファイルは invalid に数える。
 * 書き込み中の *.tmp は対象にしない。ディレクトリが無ければ空。
 */
const readCacheDir = async <T>(dir: string, parse: (raw: unknown) => T | undefined) => {
  const names = existsSync(dir) ? (await readdir(dir)).filter((name) => name.endsWith('.json')).sort() : []
  const results: (T | undefined)[] = names.map(() => undefined)
  const queue = { next: 0 }
  const worker = async () => {
    for (;;) {
      const index = queue.next
      queue.next += 1
      if (index >= names.length) return
      results[index] = parse(await readFile(resolve(dir, names[index]), 'utf8').then(parseLine, () => undefined))
    }
  }
  await Promise.all(Array.from({ length: JUDGEMENT_READ_CONCURRENCY }, worker))
  const entries = results.flatMap((result) => (result === undefined ? [] : [result]))
  return { entries, invalid: names.length - entries.length }
}

/** 投稿 ID → 確率の Map に入れる。同じ投稿があれば後のもので上書きする */
const fillProbabilities = (
  target: Map<string, number>,
  entries: readonly { postId: string; probability: number }[]
) => {
  for (const entry of entries) target.set(entry.postId, entry.probability)
}

/**
 * 判定のキャッシュ（judge・extract・eval が残す JSON）から、投稿 ID → イベントである確率を読む。
 * llm は extract（質問 v2）を優先し、それが無い投稿だけ judge（質問 v1）を使う。clef は同じ投稿に clef と
 * clef-flash の両方があれば clef を使う。同じ投稿が同じ種類に複数あれば、ファイル名の昇順で後のものが残る。
 * invalid は形が合わず飛ばしたファイルの数。ディレクトリが無ければ、その種類は空の Map。
 */
export const readJudgements = async (dir: string) => {
  const judge = await readCacheDir(resolve(dir, 'judge', JUDGE_MODEL, QUESTION_VERSION), (raw) => {
    const parsed = JudgeCacheSchema.safeParse(raw)
    return parsed.success ? { postId: parsed.data.postId, probability: parsed.data.answers.is_event } : undefined
  })
  const extract = await readCacheDir(resolve(dir, 'extract', JUDGE_MODEL, EXTRACT_VERSION), (raw) => {
    const parsed = ExtractCacheSchema.safeParse(raw)
    return parsed.success ? { postId: parsed.data.postId, probability: parsed.data.isEvent } : undefined
  })
  const clef = await readCacheDir(resolve(dir, 'clef', QUESTION_VERSION), (raw) => {
    const parsed = ClefCacheSchema.safeParse(raw)
    return parsed.success
      ? {
          postId: parsed.data.postId,
          model: parsed.data.model,
          probability: parsed.data.response.answers.is_event.noul
        }
      : undefined
  })
  // 優先度の低い方から入れ、優先する方で上書きする
  const llm = new Map<string, number>()
  fillProbabilities(llm, judge.entries)
  fillProbabilities(llm, extract.entries)
  const clefs = new Map<string, number>()
  fillProbabilities(
    clefs,
    clef.entries.filter((entry) => entry.model === 'clef-flash')
  )
  fillProbabilities(
    clefs,
    clef.entries.filter((entry) => entry.model === 'clef')
  )
  return { llm, clef: clefs, invalid: judge.invalid + extract.invalid + clef.invalid }
}

/**
 * prepare 済みの .cache/event-detect を読み込み、ビューワの API を作る。手動ラベルだけを書き戻す。
 * 判定のキャッシュ（judge・extract・clef）と emulate の結果もここで 1 回読む。serve は posts.jsonl・meta.json・
 * gold.json・emulated-v1.json が変わったときしか読み直さないので、判定が増えても反映は再起動かデータの更新まで待つ。
 */
export const loadViewerApi = async (options: { dir: string; charactersPath: string; now: ApiContext['now'] }) => {
  const labelsPath = resolve(options.dir, 'labels.json')
  const [posts, gold, accounts, characterNames, labels, meta, judgements, emulated] = await Promise.all([
    readPosts(resolve(options.dir, 'posts.jsonl')),
    readGold(resolve(options.dir, 'gold.json')),
    readStoreAccounts(options.charactersPath),
    readCharacterNames(options.charactersPath),
    readLabels(labelsPath),
    readMeta(resolve(options.dir, 'meta.json')),
    readJudgements(options.dir),
    readEmulatedEvents(options.dir)
  ])
  return createApi({
    posts,
    events: gold.events,
    accounts,
    characterNames,
    source: {
      archive: meta.archive,
      complete: meta.complete,
      pages: meta.pages,
      goldFetchedAt: gold.fetchedAt
    },
    labels,
    judgements,
    emulated,
    saveLabels: (next) => writeLabels(labelsPath, next),
    // gaps コマンドの実行結果は、実行のたびにビューワを再起動しなくても反映する
    readGapEvents: () => readGapEvents(resolve(options.dir, 'gap-events.json')),
    now: options.now
  })
}
