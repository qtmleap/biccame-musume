import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { dayjs } from '../../../workers/bot/src/timeline/utils/dayjs'
import type { PostRow, StoreAccount } from './analysis'
import type { ExtractedCategory, ExtractedEvent, ExtractedStatus, Extraction } from './extract'
import { type CallStats, callTool, emptyStats, JUDGE_MODEL, type JudgeEndpoint } from './judge'
import { writeAtomic } from './store'

// イベント作成のエミュレート。抽出（extract.ts）で配布イベントの言及と判定された投稿を、店舗ごとに
// 古い順に読み、その時点で手元にあるイベント一覧のどれの話か（または新しいイベントか）を Haiku に選ばせる。
// D1 のイベントは店舗ごとに 1 件なので、エミュレートも店舗ごとに行う。コラボ告知のように 1 投稿が
// 複数店舗に言及していれば、それぞれの店舗の流れに入る。
// 店舗の流れは前の判断に依存するので順番に処理し、店舗どうしは並列に流す。

export const LINK_VERSION = 'v1'

const DAY = 86_400_000
/** 最後の言及からこれ以上経ったイベントは候補にしない（終了日の無い配布は数か月続くことがある） */
const STALE_AFTER = 120 * DAY
/** 終了したイベントも、繰り返しの終了報告を受けられるよう少しの間は候補に残す */
const ENDED_GRACE = 3 * DAY
const MAX_CANDIDATES = 30

const STATUS_RANK: Record<ExtractedStatus, number> = { announce: 0, start: 1, ongoing: 1, end: 2 }

export type Mention = {
  store: string
  row: PostRow
  index: number
  event: ExtractedEvent
  state: string
}

/**
 * 再確認（Verifier）の結果。choice と probabilities のキーは、その時点の候補のイベント ID か 'new'。
 * Verifier が返す e0 などの番号はイベントが増えると指す先が変わるので、保存するときに ID へ直す。
 */
export type VerifyRecord = {
  choice: string
  /** 選ばれた選択肢の確率 */
  probability: number
  probabilities: Record<string, number>
  /** 実際に既存のイベントへ合流させたか。しきい値に届かなかった・new と答えた場合は false */
  merged: boolean
}

export type EmulatedEvent = {
  id: string
  store: string
  item: string
  category: ExtractedCategory
  status: ExtractedStatus
  startDate?: string
  endDate?: string
  quantity?: number
  /** 終了報告の投稿日（YYYY-MM-DD） */
  endedAt?: string
  /** 終了報告から作られ、開始の投稿を見ていない */
  startUnknown: boolean
  firstSeen: number
  lastSeen: number
  /** verify は再確認をした言及だけに付く。再確認が無い・失敗した言及には付かない */
  posts: { postId: string; status: ExtractedStatus; index: number; verify?: VerifyRecord }[]
}

export type LinkDecision = {
  key: string
  choice: string
  usage: { input_tokens: number; output_tokens: number }
}

const jstDate = (time: number) => dayjs(time).format('YYYY-MM-DD')

/**
 * 抽出結果を店舗ごとの言及の列にする。isEvent がしきい値未満の投稿は使わない。
 * 店舗の候補が空のイベントは投稿者の店舗に入れる。
 */
export const buildTimelines = (
  items: readonly { row: PostRow; extraction: Extraction; state: string }[],
  accounts: readonly StoreAccount[],
  threshold = 0.5
): Map<string, Mention[]> => {
  const timelines = new Map<string, Mention[]>()
  for (const { row, extraction, state } of items) {
    if (extraction.isEvent < threshold) continue
    const own = accounts
      .filter((account) => account.screenName.toLowerCase() === row.post.screenName.toLowerCase())
      .map((account) => account.storeId)
    for (const [index, event] of extraction.events.entries()) {
      const stores = event.stores.length > 0 ? event.stores : own
      for (const store of new Set(stores)) {
        const mention: Mention = { store, row, index, event, state }
        const list = timelines.get(store)
        if (list) list.push(mention)
        else timelines.set(store, [mention])
      }
    }
  }
  for (const list of timelines.values()) list.sort((a, b) => a.row.time - b.row.time || a.index - b.index)
  return timelines
}

const candidatesAt = (events: readonly EmulatedEvent[], time: number) =>
  events
    .filter((event) => time - event.lastSeen <= STALE_AFTER)
    .filter((event) => event.endedAt === undefined || time - event.lastSeen <= ENDED_GRACE)
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, MAX_CANDIDATES)

export const describeEvent = (event: EmulatedEvent) =>
  [
    `${event.item}（${event.category}、状態 ${event.status}）`,
    `開始 ${event.startDate ? event.startDate : event.startUnknown ? '不明' : '未定'}`,
    `終了予定 ${event.endDate ? event.endDate : '未定'}`,
    event.quantity ? `配布数 ${event.quantity}` : undefined,
    `最初の言及 ${jstDate(event.firstSeen)}、最後の言及 ${jstDate(event.lastSeen)}、言及 ${event.posts.length} 件`
  ]
    .filter((part) => part !== undefined)
    .join(' / ')

export const describeMention = (mention: Mention) => {
  const event = mention.event
  return [
    `配布物: ${event.item}（${event.category}）`,
    `状態: ${event.status}`,
    `開始日: ${event.startDate ? event.startDate : '本文に無い'}`,
    `終了日: ${event.endDate ? event.endDate : '本文に無い'}`,
    event.quantity ? `配布数: ${event.quantity}` : undefined
  ]
    .filter((part) => part !== undefined)
    .join(' / ')
}

const SYSTEM = [
  'あなたはビッカメ娘（ビックカメラの店舗擬人化キャラクター）のノベルティ配布イベントの一覧を管理しています。',
  '店舗ごとに、X の投稿を古い順に読んでイベント一覧を更新しています。',
  '投稿と、その投稿から読み取った配布イベント 1 件、この店舗で進行中のイベントの一覧が与えられます。',
  '読み取ったイベントが一覧のどれと同じイベントか、answer ツールの choice で答えてください。',
  '- 一覧の同じイベント（同じ配布物の告知の繰り返し、開始・継続・終了の報告）なら、そのキー（e0 など）',
  '- 一覧に無い新しい配布イベントなら new',
  '- この店舗の配布イベントではない、または判断できないなら none',
  '配布物の名前の表記は投稿ごとに揺れます。同じ時期・同じ種類の配布物なら同じイベントとみなしてください。',
  '一方、時期の違う同じ種類の配布物（毎年のハロウィン名刺、月替わりの名刺など）は別のイベントです。'
].join('\n')

export const linkKey = (store: string, mention: Mention, candidates: readonly EmulatedEvent[]) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        model: JUDGE_MODEL,
        version: LINK_VERSION,
        store,
        post: mention.row.post.id,
        index: mention.index,
        event: mention.event,
        candidates: candidates.map(describeEvent)
      })
    )
    .digest('hex')
    .slice(0, 32)

const decideLink = async (
  endpoint: JudgeEndpoint,
  cacheDir: string,
  mention: Mention,
  candidates: readonly EmulatedEvent[],
  stats: CallStats
): Promise<{ choice: string; cached: boolean; usage: LinkDecision['usage'] }> => {
  const keys = candidates.map((_, index) => `e${index}`)
  const key = linkKey(mention.store, mention, candidates)
  const path = resolve(cacheDir, `${key}.json`)
  if (existsSync(path)) {
    const decision: LinkDecision = JSON.parse(await readFile(path, 'utf8'))
    return { choice: decision.choice, cached: true, usage: decision.usage }
  }
  const options = [...keys, 'new', 'none']
  const result = await callTool(
    endpoint,
    {
      system: SYSTEM,
      user: [
        mention.state,
        '',
        `この投稿から読み取った配布イベント: ${describeMention(mention)}`,
        '',
        `店舗 ${mention.store} で進行中のイベント:`,
        ...candidates.map((event, index) => `e${index}: ${describeEvent(event)}`)
      ].join('\n'),
      schema: {
        type: 'object',
        properties: { choice: { type: 'string', enum: options } },
        required: ['choice'],
        additionalProperties: false
      },
      validate: (input) => {
        const choice = typeof input === 'object' && input !== null ? Reflect.get(input, 'choice') : undefined
        return typeof choice === 'string' && options.includes(choice)
          ? { ok: true, value: choice }
          : { ok: false, reason: `bad choice ${String(choice)}` }
      }
    },
    stats
  )
  const decision: LinkDecision = { key, choice: result.value, usage: result.usage }
  await writeAtomic(path, JSON.stringify(decision))
  return { choice: result.value, cached: false, usage: result.usage }
}

const apply = (event: EmulatedEvent, mention: Mention, verify?: VerifyRecord) => {
  const time = mention.row.time
  const status = mention.event.status
  if (STATUS_RANK[status] >= STATUS_RANK[event.status]) event.status = status
  if (!event.startDate && mention.event.startDate) event.startDate = mention.event.startDate
  if (!event.startDate && (status === 'start' || status === 'ongoing') && !event.startUnknown)
    event.startDate = jstDate(time)
  if (mention.event.endDate) event.endDate = mention.event.endDate
  if (!event.quantity && mention.event.quantity) event.quantity = mention.event.quantity
  if (status === 'end' && !event.endedAt) event.endedAt = jstDate(time)
  event.lastSeen = Math.max(event.lastSeen, time)
  event.posts.push({ postId: mention.row.post.id, status, index: mention.index, ...(verify ? { verify } : {}) })
}

const create = (mention: Mention, sequence: number, verify?: VerifyRecord): EmulatedEvent => {
  const status = mention.event.status
  const event: EmulatedEvent = {
    id: `${mention.store}-${sequence}`,
    store: mention.store,
    item: mention.event.item,
    category: mention.event.category,
    status,
    startUnknown: status === 'end',
    firstSeen: mention.row.time,
    lastSeen: mention.row.time,
    posts: []
  }
  apply(event, mention, verify)
  return event
}

/** Verifier が返す選択肢のキー（e0 など）を、その時点の候補のイベント ID にする。new と範囲外はそのまま */
const idOfKey = (key: string, candidates: readonly EmulatedEvent[]) => {
  const candidate = key === 'new' ? undefined : candidates[Number(key.slice(1))]
  return candidate ? candidate.id : key
}

/**
 * 再確認が既存のイベントを選んでいればそのイベント（target）と、確率の記録（record）。
 * 確認に失敗したら Haiku の判断（新規）のままで、記録も無い。
 */
const verifyNew = async (
  verify: { check: Verifier; threshold: number },
  mention: Mention,
  candidates: readonly EmulatedEvent[],
  progress: { verified: number; verifyFailed: number }
): Promise<{ target: EmulatedEvent | undefined; record: VerifyRecord | undefined }> => {
  progress.verified += 1
  const result = await verify.check(mention, candidates).catch(() => undefined)
  if (!result) {
    progress.verifyFailed += 1
    return { target: undefined, record: undefined }
  }
  const target =
    result.choice !== 'new' && result.probability >= verify.threshold
      ? candidates[Number(result.choice.slice(1))]
      : undefined
  return {
    target,
    record: {
      choice: idOfKey(result.choice, candidates),
      probability: result.probability,
      probabilities: Object.fromEntries(
        Object.entries(result.probabilities).map(([key, value]) => [idOfKey(key, candidates), value])
      ),
      merged: target !== undefined
    }
  }
}

export type EmulateProgress = {
  stores: number
  storesDone: number
  mentions: number
  mentionsDone: number
  calls: number
  cachedCalls: number
  created: number
  linked: number
  ignored: number
  failed: number
  /** 再確認（verify）に回した言及と、そこで既存のイベントに合流させた言及 */
  verified: number
  merged: number
  verifyFailed: number
  stats: CallStats
  inputTokens: number
  outputTokens: number
}

/**
 * 店舗ごとにエミュレートする。判断の失敗（API が返らない）はその言及を飛ばして続ける。
 */
/**
 * 「新規」と判断された言及を別のモデルで確かめる。候補のうち同じイベントはどれか（なければ new）を
 * 選ばせ、選んだ候補の番号（e0 など）とその確率を返す。確率が threshold 以上のときだけ合流させる。
 * probabilities は選択肢ごとの確率で、キーは choice と同じく e0 などの番号か new。
 */
export type Verifier = (
  mention: Mention,
  candidates: readonly EmulatedEvent[]
) => Promise<{ choice: string; probability: number; probabilities: Record<string, number>; cached: boolean }>

export const runEmulation = async (options: {
  timelines: Map<string, Mention[]>
  endpoint: JudgeEndpoint
  cacheDir: string
  concurrency: number
  verify?: { check: Verifier; threshold: number }
  onProgress?: (progress: EmulateProgress) => void
  onError?: (mention: Mention, error: unknown) => void
}): Promise<{ events: EmulatedEvent[]; progress: EmulateProgress }> => {
  await mkdir(options.cacheDir, { recursive: true })
  const stores = [...options.timelines.keys()].sort()
  const progress: EmulateProgress = {
    stores: stores.length,
    storesDone: 0,
    mentions: [...options.timelines.values()].reduce((sum, list) => sum + list.length, 0),
    mentionsDone: 0,
    calls: 0,
    cachedCalls: 0,
    created: 0,
    linked: 0,
    ignored: 0,
    failed: 0,
    verified: 0,
    merged: 0,
    verifyFailed: 0,
    stats: emptyStats(),
    inputTokens: 0,
    outputTokens: 0
  }
  const all: EmulatedEvent[] = []
  const queue = { next: 0 }
  const worker = async () => {
    for (;;) {
      const store = stores[queue.next]
      queue.next += 1
      if (store === undefined) return
      const events: EmulatedEvent[] = []
      const mentions = options.timelines.get(store)
      for (const mention of mentions ? mentions : []) {
        const candidates = candidatesAt(events, mention.row.time)
        try {
          const choice =
            candidates.length === 0
              ? 'new'
              : await decideLink(options.endpoint, options.cacheDir, mention, candidates, progress.stats).then(
                  (result) => {
                    progress.calls += 1
                    if (result.cached) progress.cachedCalls += 1
                    else {
                      progress.inputTokens += result.usage.input_tokens
                      progress.outputTokens += result.usage.output_tokens
                    }
                    return result.choice
                  }
                )
          const verified =
            choice === 'new' && options.verify && candidates.length > 0
              ? await verifyNew(options.verify, mention, candidates, progress)
              : undefined
          if (verified?.target) {
            apply(verified.target, mention, verified.record)
            progress.linked += 1
            progress.merged += 1
          } else if (choice === 'new') {
            events.push(create(mention, events.length + 1, verified?.record))
            progress.created += 1
          } else if (choice === 'none') progress.ignored += 1
          else {
            const target = candidates[Number(choice.slice(1))]
            if (target) {
              apply(target, mention)
              progress.linked += 1
            }
          }
        } catch (error) {
          progress.failed += 1
          options.onError?.(mention, error)
        }
        progress.mentionsDone += 1
        options.onProgress?.(progress)
      }
      all.push(...events)
      progress.storesDone += 1
    }
  }
  await Promise.all(Array.from({ length: options.concurrency }, worker))
  return { events: all.sort((a, b) => a.firstSeen - b.firstSeen), progress }
}
