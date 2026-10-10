import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ClefModel, ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import { ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { z } from 'zod'
import type { Analysis, StoreAccount } from './analysis'
import { cacheKey, callClef } from './decide'
import { buildRequest, type Decision } from './evaluate'
import { EMULATED_FILE, writeAtomic } from './store'

// emulate が作ったイベントを Clef で判定して確率を残す。対象は各イベントの代表投稿（そのイベントを作った
// 最初の言及）。判定は eval と同じ .cache/event-detect/clef/<QUESTION_VERSION>/ に保存し、保存済みは呼ばない。
// 1 件の失敗では止まらず、失敗した分は次の実行でだけ呼び直される。

/** 入力 100 万トークンあたりの料金（USD）。--help の説明も同じ値から作る */
export const CLEF_PRICE_PER_MILLION: Record<ClefModel, number> = { clef: 0.24, 'clef-flash': 0.09 }

export const clefCost = (model: ClefModel, inputTokens: number) =>
  (inputTokens * CLEF_PRICE_PER_MILLION[model]) / 1_000_000

export type ClefTarget = {
  postId: string
  /** 代表投稿の投稿時刻（epoch ミリ秒）。イベントの firstSeen と同じ */
  time: number
}

/** emulate の結果（EmulatedEvent[]）のうち、代表投稿を取り出すのに使う項目だけ。ほかの項目は読まない */
const EmulatedRepresentativesSchema = z.array(
  z.object({
    firstSeen: z.number(),
    posts: z.array(z.object({ postId: z.string().nonempty() })).nonempty()
  })
)

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * エミュレート結果から、イベントごとの代表投稿（posts[0]）を取り出す。posts は処理順（投稿の古い順）に積まれるので、
 * posts[0] がそのイベントを作った最初の言及。1 つの投稿が複数のイベントの代表になることがあるため、投稿 ID で
 * 重複を除く。events は除く前（イベント数）、targets はその後（投稿 ID ごとに 1 件、投稿時刻の古い順）。
 * ファイルが無い・形が合わないときは、emulate を実行し直すよう促すエラー。
 */
export const readRepresentativePosts = async (dir: string) => {
  const path = resolve(dir, EMULATED_FILE)
  if (!existsSync(path)) throw new Error(`${path}: not found (re-run emulate)`)
  const parsed = EmulatedRepresentativesSchema.safeParse(parseJson(await readFile(path, 'utf8')))
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message} (re-run emulate)`)
  const byPost = new Map<string, ClefTarget>()
  for (const event of parsed.data) {
    const postId = event.posts[0].postId
    const known = byPost.get(postId)
    if (!known || event.firstSeen < known.time) byPost.set(postId, { postId, time: event.firstSeen })
  }
  const targets = [...byPost.values()].sort((a, b) =>
    a.time !== b.time ? a.time - b.time : a.postId.localeCompare(b.postId)
  )
  return { events: parsed.data.length, targets }
}

/** 分析に無い投稿（記念日フィルタなどで投稿データから外れたもの）は判定できないので対象から外し、その数を返す */
export const resolveTargets = (targets: readonly ClefTarget[], analysis: Analysis) => {
  const rows = targets.flatMap((target) => {
    const row = analysis.rowById.get(target.postId)
    return row ? [{ target, row }] : []
  })
  return { rows, skipped: targets.length - rows.length }
}

const CachedDecisionSchema = z.object({ response: ClefResponseSchema })

/** is_event の確率（noul）。質問に noul で答えていなければ undefined */
const isEventProbability = (response: ClefResponse) => {
  const answer = response.answers.is_event
  return answer?.type === 'noul' ? answer.noul : undefined
}

/**
 * 保存済みの判定が使えるか。JSON として読めて is_event が noul で答えられていれば命中とする。
 * 読めない・途中で切れた・is_event が無いファイルは未保存として扱い、呼び直して置き換える。
 */
const readCachedProbability = async (path: string) => {
  const text = await readFile(path, 'utf8').catch(() => undefined)
  if (text === undefined) return undefined
  const parsed = CachedDecisionSchema.safeParse(parseJson(text))
  return parsed.success ? isEventProbability(parsed.data.response) : undefined
}

export type ClefRunProgress = {
  done: number
  /** 判定する対象の数。分析に無くて外した投稿は含めない */
  total: number
  cached: number
  failed: number
  /** この実行で呼んだ分の入力トークン（保存済みは数えない） */
  inputTokens: number
}

export type ClefRunResult = ClefRunProgress & {
  /** 分析に無く、対象から外した投稿の数 */
  skipped: number
  /** 投稿 ID → is_event の確率。保存済みから読んだ分も含み、失敗した投稿は無い */
  probabilities: Map<string, number>
}

export type ClefCall = (endpoint: string, request: ClefRequest) => Promise<ClefResponse>

/**
 * 代表投稿を Clef に流す。保存済みは読むだけで呼ばない。1 件の失敗は握りつぶさず onError に渡し、
 * failed に数えて残りを続ける（保存は成功した分だけなので、再実行すると失敗分だけが呼ばれる）。
 */
export const runClefEvents = async (options: {
  targets: readonly ClefTarget[]
  model: ClefModel
  analysis: Analysis
  accounts: readonly StoreAccount[]
  storeNames: Map<string, string[]>
  concurrency: number
  endpoint: string
  cacheDir: string
  /** Clef の呼び出し。テストで偽物に差し替える */
  call?: ClefCall
  onProgress?: (progress: ClefRunProgress) => void
  onError?: (target: ClefTarget, error: unknown) => void
}): Promise<ClefRunResult> => {
  await mkdir(options.cacheDir, { recursive: true })
  const call = options.call ? options.call : callClef
  const { rows, skipped } = resolveTargets(options.targets, options.analysis)
  const progress: ClefRunProgress = { done: 0, total: rows.length, cached: 0, failed: 0, inputTokens: 0 }
  const probabilities = new Map<string, number>()
  const queue = { next: 0 }
  const worker = async () => {
    for (;;) {
      const item = rows[queue.next]
      queue.next += 1
      if (!item) return
      try {
        const { request, endedCandidates } = buildRequest(
          item.row,
          options.analysis,
          options.accounts,
          options.storeNames
        )
        const path = resolve(options.cacheDir, `${cacheKey(options.model, request)}.json`)
        const saved = await readCachedProbability(path)
        if (saved !== undefined) {
          progress.cached += 1
          probabilities.set(item.target.postId, saved)
        } else {
          const started = performance.now()
          const response = await call(options.endpoint, { model: options.model, ...request })
          const probability = isEventProbability(response)
          // is_event に答えていない応答は保存しない（保存すると次の実行でも命中してしまい、確率が残らない）
          if (probability === undefined) throw new Error('Clef returned no is_event answer')
          const decision: Decision = {
            postId: item.target.postId,
            model: options.model,
            kind: 'event',
            request,
            response,
            endedCandidates,
            elapsedMs: Math.round(performance.now() - started)
          }
          await writeAtomic(path, JSON.stringify(decision))
          progress.inputTokens += response.usage ? response.usage.input_tokens : 0
          probabilities.set(item.target.postId, probability)
        }
      } catch (error) {
        progress.failed += 1
        options.onError?.(item.target, error)
      }
      progress.done += 1
      options.onProgress?.({ ...progress })
    }
  }
  await Promise.all(Array.from({ length: options.concurrency }, worker))
  return { ...progress, skipped, probabilities }
}

/** 確率（0〜1）を 0.1 刻みの 10 区間に数える。最後の区間は 1.0 を含む */
export const probabilityHistogram = (values: Iterable<number>) => {
  const buckets = Array.from({ length: 10 }, () => 0)
  for (const value of values) buckets[Math.min(9, Math.floor(value * 10))] += 1
  return buckets
}
