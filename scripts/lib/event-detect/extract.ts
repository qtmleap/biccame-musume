import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import type { PostRow, StoreAccount } from './analysis'
import {
  buildState,
  CATEGORY_CRITERIA,
  dateCandidates,
  quantityCandidates,
  STATUS_CRITERIA,
  storeCandidates
} from './decide'
import { type CallStats, callTool, emptyStats, fromObjectOrReason, JUDGE_MODEL, type JudgeEndpoint } from './judge'
import { writeAtomic } from './store'

// 質問 v2: 1 つの投稿から、言及されている配布イベントをすべて抽出する。
// v1 は 1 投稿 1 イベント前提で、名刺とアクキーを同時に告知する投稿（正解データで 48 件）を表せなかった。
// 日付・配布数は本文から機械的に拾った候補から選ばせる（v1 で本文に正解があれば 97〜98% 当たった方式）。
// 前後の投稿との突き合わせ（どのイベントか）はここではしない。emulate.ts が古い順に行う。

export const EXTRACT_VERSION = 'v2'

const STATUSES = ['announce', 'start', 'ongoing', 'end'] as const
const CATEGORIES = ['limited_card', 'regular_card', 'ackey', 'other'] as const

export type ExtractedStatus = (typeof STATUSES)[number]
export type ExtractedCategory = (typeof CATEGORIES)[number]

export type ExtractedEvent = {
  /** 配布物の名前（例: ハロウィン名刺、擬人化記念アクキー）。同じイベントの突き合わせに使う */
  item: string
  category: ExtractedCategory
  status: ExtractedStatus
  /** 開催店舗の店舗キー。候補に無ければ空 */
  stores: string[]
  /** YYYY-MM-DD。本文の候補に無ければ undefined */
  startDate?: string
  endDate?: string
  quantity?: number
}

export type Extraction = {
  key: string
  model: string
  version: string
  postId: string
  /** ビッカメ娘のノベルティ配布に関する投稿である確率（v1 の is_event と同じ意味） */
  isEvent: number
  events: ExtractedEvent[]
  attempts: number
  usage: { input_tokens: number; output_tokens: number }
  elapsedMs: number
}

export type ExtractInput = {
  state: string
  stores: string[]
  dates: string[]
  quantities: number[]
}

const NONE = 'none'

export const extractInput = (
  post: DetectPost,
  accounts: readonly StoreAccount[],
  storeNames: Map<string, string[]>
): ExtractInput => ({
  state: buildState(post, accounts),
  stores: storeCandidates(post, accounts, storeNames),
  dates: dateCandidates(post),
  quantities: quantityCandidates(post)
})

export const extractKey = (input: ExtractInput) =>
  createHash('sha256')
    .update(JSON.stringify({ model: JUDGE_MODEL, version: EXTRACT_VERSION, input }))
    .digest('hex')
    .slice(0, 32)

const describe = (criteria: Record<string, string>) =>
  Object.entries(criteria)
    .map(([key, label]) => `${key}: ${label}`)
    .join(' / ')

const SYSTEM = [
  'あなたはビックカメラの店舗擬人化キャラクター「ビッカメ娘」のノベルティ配布イベントを、X の投稿から整理する担当です。',
  '与えられた投稿（state）を読み、answer ツールを 1 回呼んで答えてください。',
  '- is_event: この投稿がビッカメ娘の名刺・アクリルキーホルダー・アクリルスタンド・缶バッジ・ポストカード・ギフトカード・ポイントカード・年賀状などの配布・販売・発行についての案内である確率（0〜1）。購入特典でもビッカメ娘のグッズなら含む。ビッカメ娘と関係ない商品の特典やメーカーのキャンペーン、配布物をもらった人へのお礼や雑談は含まない。',
  '- events: この投稿が案内している配布イベントを、配布物ごとに 1 件ずつすべて列挙する。名刺とアクキーを同時に配るなら 2 件。案内していなければ空配列。',
  `  - status: ${describe(STATUS_CRITERIA)}（none は使わない。状態を伝えていないイベントは列挙しない）`,
  `  - category: ${describe(CATEGORY_CRITERIA)}（none は使わない）`,
  '  - item: 配布物の短い名前（例: ハロウィン限定名刺、擬人化7周年記念アクキー）。同じイベントの他の投稿と照合できるよう、本文の言葉を使う',
  '  - stores / start_date / end_date / quantity: 与えられた候補から選ぶ。本文に書かれていなければ none'
].join('\n')

const eventSchema = (input: ExtractInput) => ({
  type: 'object',
  properties: {
    item: { type: 'string' },
    category: { type: 'string', enum: [...CATEGORIES] },
    status: { type: 'string', enum: [...STATUSES] },
    stores: { type: 'array', items: { type: 'string', enum: input.stores.length > 0 ? input.stores : [NONE] } },
    start_date: { type: 'string', enum: [...input.dates, NONE] },
    end_date: { type: 'string', enum: [...input.dates, NONE] },
    quantity: { type: 'string', enum: [...input.quantities.map(String), NONE] }
  },
  required: ['item', 'category', 'status', 'stores', 'start_date', 'end_date', 'quantity'],
  additionalProperties: false
})

export const extractSchema = (input: ExtractInput) => ({
  type: 'object',
  properties: {
    is_event: { type: 'number', minimum: 0, maximum: 1 },
    events: { type: 'array', items: eventSchema(input) }
  },
  required: ['is_event', 'events'],
  additionalProperties: false
})

const userMessage = (input: ExtractInput) =>
  [
    input.state,
    '',
    `店舗の候補（店舗キー）: ${input.stores.length > 0 ? input.stores.join(', ') : '（なし）'}`,
    `日付の候補: ${input.dates.length > 0 ? input.dates.join(', ') : '（なし）'}`,
    `数量の候補: ${input.quantities.length > 0 ? input.quantities.join(', ') : '（なし）'}`
  ].join('\n')

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && values.some((candidate) => candidate === value)

/** ツールの入力を検証して抽出結果にする。外れていれば理由を返す */
export const validateExtraction = (
  input: ExtractInput,
  raw: unknown
): { isEvent: number; events: ExtractedEvent[] } | string => {
  if (typeof raw !== 'object' || raw === null) return 'not an object'
  const isEvent = Reflect.get(raw, 'is_event')
  const events = Reflect.get(raw, 'events')
  if (typeof isEvent !== 'number' || isEvent < 0 || isEvent > 1) return `bad is_event ${String(isEvent)}`
  if (!Array.isArray(events)) return 'events is not an array'
  const result: ExtractedEvent[] = []
  for (const [index, event] of events.entries()) {
    if (typeof event !== 'object' || event === null) return `event ${index} is not an object`
    const field = (name: string) => Reflect.get(event, name)
    const item = field('item')
    const category = field('category')
    const status = field('status')
    const stores = field('stores')
    const start = field('start_date')
    const end = field('end_date')
    const quantity = field('quantity')
    if (typeof item !== 'string' || item.trim() === '') return `event ${index}: empty item`
    if (!isOneOf(CATEGORIES, category)) return `event ${index}: bad category ${String(category)}`
    if (!isOneOf(STATUSES, status)) return `event ${index}: bad status ${String(status)}`
    if (!Array.isArray(stores) || stores.some((store) => store !== NONE && !input.stores.includes(store)))
      return `event ${index}: bad stores ${JSON.stringify(stores)}`
    const date = (value: unknown, name: string) =>
      value === NONE ? undefined : typeof value === 'string' && input.dates.includes(value) ? value : name
    const startDate = date(start, 'bad start_date')
    const endDate = date(end, 'bad end_date')
    if (startDate === 'bad start_date' || endDate === 'bad end_date') return `event ${index}: ${startDate}/${endDate}`
    const amount = quantity === NONE ? undefined : Number(quantity)
    if (amount !== undefined && !input.quantities.includes(amount))
      return `event ${index}: bad quantity ${String(quantity)}`
    result.push({
      item: item.trim(),
      category,
      status,
      stores: stores.filter((store): store is string => typeof store === 'string' && store !== NONE),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(amount !== undefined ? { quantity: amount } : {})
    })
  }
  return { isEvent, events: result }
}

export type ExtractTarget = { key: string; row: PostRow; input: ExtractInput }

/** 抽出する入力の一覧。入力が同じ投稿は 1 件にまとめる */
export const extractTargets = (
  rows: readonly PostRow[],
  accounts: readonly StoreAccount[],
  storeNames: Map<string, string[]>
): ExtractTarget[] => {
  const targets = new Map<string, ExtractTarget>()
  for (const row of rows) {
    const input = extractInput(row.post, accounts, storeNames)
    const key = extractKey(input)
    if (!targets.has(key)) targets.set(key, { key, row, input })
  }
  return [...targets.values()]
}

export type ExtractProgress = {
  done: number
  total: number
  cached: number
  failed: number
  stats: CallStats
  inputTokens: number
  outputTokens: number
}

export const runExtract = async (options: {
  targets: readonly ExtractTarget[]
  cacheDir: string
  concurrency: number
  endpoint: JudgeEndpoint
  onProgress?: (progress: ExtractProgress) => void
  onError?: (target: ExtractTarget, error: unknown) => void
}): Promise<ExtractProgress> => {
  await mkdir(options.cacheDir, { recursive: true })
  const progress: ExtractProgress = {
    done: 0,
    total: options.targets.length,
    cached: 0,
    failed: 0,
    stats: emptyStats(),
    inputTokens: 0,
    outputTokens: 0
  }
  const queue = { next: 0 }
  const worker = async () => {
    for (;;) {
      const target = options.targets[queue.next]
      queue.next += 1
      if (!target) return
      const path = resolve(options.cacheDir, `${target.key}.json`)
      if (existsSync(path)) progress.cached += 1
      else {
        try {
          const result = await callTool(
            options.endpoint,
            {
              system: SYSTEM,
              user: userMessage(target.input),
              schema: extractSchema(target.input),
              validate: (raw) => fromObjectOrReason(validateExtraction(target.input, raw))
            },
            progress.stats
          )
          const extraction: Extraction = {
            key: target.key,
            model: JUDGE_MODEL,
            version: EXTRACT_VERSION,
            postId: target.row.post.id,
            isEvent: result.value.isEvent,
            events: result.value.events,
            attempts: result.attempts,
            usage: result.usage,
            elapsedMs: result.elapsedMs
          }
          await writeAtomic(path, JSON.stringify(extraction))
          progress.inputTokens += result.usage.input_tokens
          progress.outputTokens += result.usage.output_tokens
        } catch (error) {
          progress.failed += 1
          options.onError?.(target, error)
        }
      }
      progress.done += 1
      options.onProgress?.(progress)
    }
  }
  await Promise.all(Array.from({ length: options.concurrency }, worker))
  return progress
}

export const readExtraction = async (cacheDir: string, key: string): Promise<Extraction | undefined> => {
  const path = resolve(cacheDir, `${key}.json`)
  if (!existsSync(path)) return undefined
  return JSON.parse(await readFile(path, 'utf8'))
}
