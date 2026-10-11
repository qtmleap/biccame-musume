import { type Analysis, coverageGaps, type PostRow, type StoreAccount } from './analysis'
import {
  buildTimelines,
  type EmulatedEvent,
  type EmulateProgress,
  type Mention,
  runEmulation,
  type Verifier
} from './emulate'
import {
  type ExtractProgress,
  extractInput,
  extractKey,
  extractTargets,
  readExtraction,
  runExtract
} from './extract'
import type { JudgeEndpoint } from './judge'
import { writeAtomic } from './store'

// 登録漏れ候補の投稿を、店舗ごとに古い順に読んで同じイベントにまとめる。
// 候補（analysis.ts の coverageGaps）は強シグナルの投稿のうち D1 イベント期間に入らないもので、同じイベントを
// 告知する投稿が複数あると別々の候補に見える。emulate.ts のエミュレートをこの投稿だけで回し、
// 同一店舗の終了状態になっていないイベントと同じものはマージして、イベントごとの言及回数にする。

/** gap-events.json の中身。ビューワの API（/api/gaps）が読む */
export type GapEventsFile = {
  generatedAt: string
  /** 「新規」と判断された言及を Clef で再確認したか。行っていなければ null */
  verify: { model: string; threshold: number } | null
  /** この実行で調べた登録漏れ投稿の ID。ここに無い候補は未集約として API が別に返す */
  processed: string[]
  events: EmulatedEvent[]
}

export const writeGapEvents = (path: string, file: GapEventsFile) =>
  writeAtomic(path, `${JSON.stringify(file, null, 1)}\n`)

type TimelineItem = Parameters<typeof buildTimelines>[0][number]

/** 登録漏れ候補の投稿（アカウントごとに古い順に並んだものを平らにしたもの） */
export const gapRows = (analysis: Analysis): PostRow[] => coverageGaps(analysis).flatMap((gap) => gap.posts)

/** 抽出済みの行はエミュレートの入力にし、抽出が無い行は別に返す */
const readGapItems = async (options: {
  rows: readonly PostRow[]
  accounts: readonly StoreAccount[]
  storeNames: Map<string, string[]>
  extractDir: string
}) => {
  const items: TimelineItem[] = []
  const missing: PostRow[] = []
  for (const row of options.rows) {
    const input = extractInput(row.post, options.accounts, options.storeNames)
    const extraction = await readExtraction(options.extractDir, extractKey(input))
    if (extraction) items.push({ row, extraction, state: input.state })
    else missing.push(row)
  }
  return { items, missing }
}

export type GapEventsResult = {
  events: EmulatedEvent[]
  /** 抽出と照合の両方が済んだ投稿の ID。失敗した投稿は含めず、未集約として残す */
  processed: string[]
  /** 調べたがどのイベントにも入らなかった（イベントではないと判定された）投稿の数 */
  ignored: number
  /** 抽出が終わらなかった投稿の数 */
  unextracted: number
  extract: ExtractProgress | undefined
  emulate: EmulateProgress
}

/**
 * 登録漏れ候補の行からイベントを作る。未抽出の行は抽出してから読み直し、抽出結果を店舗ごとの流れにして
 * エミュレートする。Haiku は endpoint、再確認は verify（Verifier）で呼ぶので、どちらも差し替えられる。
 */
export const resolveGapEvents = async (options: {
  rows: readonly PostRow[]
  accounts: readonly StoreAccount[]
  storeNames: Map<string, string[]>
  endpoint: JudgeEndpoint
  extractDir: string
  emulateDir: string
  extractConcurrency: number
  emulateConcurrency: number
  verify?: { check: Verifier; threshold: number }
  onExtractProgress?: (progress: ExtractProgress) => void
  onEmulateProgress?: (progress: EmulateProgress) => void
  onExtractError?: (row: PostRow, error: unknown) => void
  onEmulateError?: (mention: Mention, error: unknown) => void
}): Promise<GapEventsResult> => {
  const read = {
    rows: options.rows,
    accounts: options.accounts,
    storeNames: options.storeNames,
    extractDir: options.extractDir
  }
  const first = await readGapItems(read)
  const extract =
    first.missing.length > 0
      ? await runExtract({
          targets: extractTargets(first.missing, options.accounts, options.storeNames),
          cacheDir: options.extractDir,
          concurrency: options.extractConcurrency,
          endpoint: options.endpoint,
          ...(options.onExtractProgress ? { onProgress: options.onExtractProgress } : {}),
          onError: (target, error) => options.onExtractError?.(target.row, error)
        })
      : undefined
  const { items, missing } = extract ? await readGapItems(read) : first
  const failed = new Set<string>()
  const { events, progress } = await runEmulation({
    timelines: buildTimelines(items, options.accounts),
    endpoint: options.endpoint,
    cacheDir: options.emulateDir,
    concurrency: options.emulateConcurrency,
    ...(options.verify ? { verify: options.verify } : {}),
    ...(options.onEmulateProgress ? { onProgress: options.onEmulateProgress } : {}),
    onError: (mention, error) => {
      failed.add(mention.row.post.id)
      options.onEmulateError?.(mention, error)
    }
  })
  const mentioned = new Set(events.flatMap((event) => event.posts.map((entry) => entry.postId)))
  // 照合に失敗した言及がある投稿は未処理に残す。ただし別の言及がイベントに入っていれば、そちらで見える
  const processed = items.map(({ row }) => row.post.id).filter((id) => !failed.has(id) || mentioned.has(id))
  return {
    events,
    processed,
    ignored: processed.filter((id) => !mentioned.has(id)).length,
    unextracted: missing.length,
    extract,
    emulate: progress
  }
}
