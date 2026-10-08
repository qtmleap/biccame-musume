import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ClefAnswer, ClefModel, ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import type { Analysis, PostRow, StoreAccount } from './analysis'
import {
  baseQuestions,
  buildState,
  cacheKey,
  callClef,
  endedEventQuestion,
  keyToDate,
  keyToQuantity,
  storeCandidates,
  valueQuestions
} from './decide'
import type { GoldEvent, ReferenceType } from './gold'
import { writeAtomic } from './store'

// 正解データに対して Clef を流し、項目ごとの正解率を出す。判定は .cache/event-detect/clef/ に
// 投稿・モデル・質問の版ごとに保存し、再実行時は呼び直さない。

export type EvalSample = { row: PostRow; kind: 'gold' | 'negative_passed' | 'negative_dropped' }

/** 再現できるよう、シード付きの乱数で抽出する */
const seeded = (seed: number) => {
  const state = { value: seed >>> 0 }
  return () => {
    state.value = (Math.imul(state.value ^ (state.value >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    return state.value / 2 ** 32
  }
}

const sample = <T>(items: readonly T[], count: number, seed: number): T[] => {
  const random = seeded(seed)
  return [...items]
    .map((item) => ({ item, key: random() }))
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map((entry) => entry.item)
}

export const buildEvalSet = (analysis: Analysis, options: { passed: number; dropped: number; seed: number }) => {
  const gold = analysis.rows.filter((row) => row.gold.length > 0)
  const negativesPassed = analysis.rows.filter(
    (row) => row.reason === undefined && row.gold.length === 0 && row.nearbyEvents.length === 0 && !row.strong
  )
  const negativesDropped = analysis.rows.filter((row) => row.reason === 'no_keyword' && row.gold.length === 0)
  return [
    ...gold.map((row) => ({ row, kind: 'gold' as const })),
    ...sample(negativesPassed, options.passed, options.seed).map((row) => ({ row, kind: 'negative_passed' as const })),
    ...sample(negativesDropped, options.dropped, options.seed + 1).map((row) => ({
      row,
      kind: 'negative_dropped' as const
    }))
  ]
}

export type Decision = {
  postId: string
  model: ClefModel
  kind: EvalSample['kind']
  request: Omit<ClefRequest, 'model'>
  response: ClefResponse
  /** 終了イベントの選択肢キー → イベント ID */
  endedCandidates: Record<string, string>
  elapsedMs: number
}

/** 店舗キー → 選択肢の説明（キャラ名 / 店舗名） */
const storeLabelMap = (names: Map<string, string[]>) =>
  new Map<string, string>([...names.entries()].map(([id, list]) => [id, list.join(' / ')]))

export const buildRequest = (
  row: PostRow,
  analysis: Analysis,
  accounts: readonly StoreAccount[],
  storeNames: Map<string, string[]>
) => {
  const stores = storeCandidates(row.post, accounts, storeNames)
  const labels = storeLabelMap(storeNames)
  const { questions } = valueQuestions(row.post, stores, labels)
  const ended = endedEventQuestion(row.post, stores, analysis.events)
  const endedCandidates = Object.fromEntries(ended.candidates.map((event, index) => [`e${index}`, event.uuid]))
  return {
    request: {
      state: buildState(row.post, accounts),
      questions: { ...baseQuestions(), ...questions, ...(ended.question ? { ended_event: ended.question } : {}) }
    },
    endedCandidates
  }
}

export const runDecisions = async (options: {
  samples: readonly EvalSample[]
  models: readonly ClefModel[]
  analysis: Analysis
  accounts: readonly StoreAccount[]
  storeNames: Map<string, string[]>
  endpoint: string
  cacheDir: string
  concurrency: number
  onProgress?: (done: number, total: number, model: ClefModel) => void
}): Promise<Decision[]> => {
  await mkdir(options.cacheDir, { recursive: true })
  const decisions: Decision[] = []
  for (const model of options.models) {
    const queue = options.samples.map((entry, index) => ({ entry, index }))
    const state = { done: 0, next: 0 }
    const worker = async () => {
      for (;;) {
        const item = queue[state.next]
        state.next += 1
        if (!item) return
        const { request, endedCandidates } = buildRequest(item.entry.row, options.analysis, options.accounts, options.storeNames)
        const path = resolve(options.cacheDir, `${cacheKey(model, request)}.json`)
        const cached = await readFile(path, 'utf8')
          .then((text) => JSON.parse(text))
          .catch(() => undefined)
        if (cached) decisions.push({ ...cached, kind: item.entry.kind })
        else {
          const started = performance.now()
          const response = await callClef(options.endpoint, { model, ...request })
          const decision: Decision = {
            postId: item.entry.row.post.id,
            model,
            kind: item.entry.kind,
            request,
            response,
            endedCandidates,
            elapsedMs: Math.round(performance.now() - started)
          }
          await writeAtomic(path, JSON.stringify(decision))
          decisions.push(decision)
        }
        state.done += 1
        options.onProgress?.(state.done, queue.length, model)
      }
    }
    await Promise.all(Array.from({ length: options.concurrency }, worker))
  }
  return decisions
}

const choiceOf = (answer: ClefAnswer | undefined) => (answer?.type === 'choice' ? answer.choice : undefined)

const jstDate = (iso: string) => {
  const date = new Date(Date.parse(iso) + 9 * 3_600_000)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

/** D1 の endDate は「終了日の翌日 0 時（JST）」で入っていることがあるため、前日も一致とみなす */
const sameOrPrevDay = (picked: string, iso: string) => {
  const exact = jstDate(iso)
  const previous = jstDate(new Date(Date.parse(iso) - 86_400_000).toISOString())
  return picked === exact || picked === previous
}

type Tally = { correct: number; total: number }

const tally = (): Tally => ({ correct: 0, total: 0 })

/**
 * 値の項目（日付・数量）の採点。本文の候補に正解があるときはそれを選べたか、
 * 無いときは「本文に書かれていない」を選べたかを分けて数える。候補が 1 つも無ければ質問していない。
 */
type ValueTally = { inText: Tally; notInText: Tally; noCandidates: number }

const valueTally = (): ValueTally => ({ inText: tally(), notInText: tally(), noCandidates: 0 })

const scoreValue = (
  target: ValueTally,
  answer: ClefAnswer | undefined,
  candidates: readonly string[],
  isCorrect: (key: string) => boolean
) => {
  if (!answer) {
    target.noCandidates += 1
    return
  }
  const picked = choiceOf(answer)
  if (candidates.some(isCorrect)) add(target.inText, picked !== undefined && isCorrect(picked))
  else add(target.notInText, picked === 'none')
}

const add = (t: Tally, ok: boolean) => {
  t.total += 1
  if (ok) t.correct += 1
}

export type ModelReport = {
  model: ClefModel
  calls: number
  inputTokens: number
  latency: { p50: number; p95: number }
  isEvent: {
    threshold: number
    goldRecall: Tally
    negativePassedRate: Tally
    negativeDroppedRate: Tally
  }
  status: Tally & { confusion: Record<string, Record<string, number>> }
  category: Tally
  store: Tally
  startDate: ValueTally
  endDate: ValueTally
  quantity: ValueTally
  endedEvent: Tally & { noCandidate: number; top1WhenCandidates: number }
}

const STATUS_MATCH: Record<string, ReferenceType[] | undefined> = {
  announce: ['announce'],
  start: ['start'],
  ongoing: ['start'],
  end: ['end']
}

const CATEGORY_GOLD: Record<string, string> = {
  limited_card: 'limited_card',
  regular_card: 'regular_card',
  ackey: 'ackey',
  other: 'other'
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

export const scoreModel = (
  model: ClefModel,
  decisions: readonly Decision[],
  analysis: Analysis,
  threshold = 0.5
): ModelReport => {
  const mine = decisions.filter((decision) => decision.model === model)
  const report: ModelReport = {
    model,
    calls: mine.length,
    inputTokens: mine.reduce((sum, d) => sum + (d.response.usage ? d.response.usage.input_tokens : 0), 0),
    latency: { p50: percentile(mine.map((d) => d.elapsedMs), 0.5), p95: percentile(mine.map((d) => d.elapsedMs), 0.95) },
    isEvent: { threshold, goldRecall: tally(), negativePassedRate: tally(), negativeDroppedRate: tally() },
    status: { ...tally(), confusion: {} },
    category: tally(),
    store: tally(),
    startDate: valueTally(),
    endDate: valueTally(),
    quantity: valueTally(),
    endedEvent: { ...tally(), noCandidate: 0, top1WhenCandidates: 0 }
  }
  for (const decision of mine) {
    const answers = decision.response.answers
    const isEvent = answers.is_event?.type === 'noul' ? answers.is_event.noul >= threshold : false
    if (decision.kind === 'negative_passed') add(report.isEvent.negativePassedRate, isEvent)
    if (decision.kind === 'negative_dropped') add(report.isEvent.negativeDroppedRate, isEvent)
    if (decision.kind !== 'gold') continue
    add(report.isEvent.goldRecall, isEvent)
    const row = analysis.rowById.get(decision.postId)
    if (!row) continue
    const refs = row.gold
    const events = refs
      .map((ref) => analysis.eventById.get(ref.eventId))
      .filter((event): event is GoldEvent => event !== undefined)

    // ステータス: 正解の参考 URL の種類のどれかに一致すれば正解
    const status = choiceOf(answers.status)
    const types = new Set<ReferenceType>(refs.map((ref) => ref.type))
    const goldStatus = [...types].join('+')
    if (status) {
      // D1 の参考 URL に「継続」は無いので、継続は開始の正解と一致すれば正解とする
      const accepted = STATUS_MATCH[status]
      add(report.status, accepted !== undefined && accepted.some((type) => types.has(type)))
      const row = report.status.confusion[goldStatus]
      const counts = row === undefined ? {} : row
      counts[status] = status in counts ? counts[status] + 1 : 1
      report.status.confusion[goldStatus] = counts
    }

    // 種別: 紐づくイベントのカテゴリのどれかに一致
    const category = choiceOf(answers.category)
    if (category) add(report.category, events.some((event) => CATEGORY_GOLD[event.category] === category))

    // 店舗: 選んだ店舗が紐づくイベントの店舗に含まれる
    const store = choiceOf(answers.store)
    if (store) add(report.store, events.some((event) => event.stores.includes(store)))

    // 日付・数量は告知・開始の正解だけで評価する（終了報告は開始日を書かないことが多い）
    const announceEvents = refs
      .filter((ref) => ref.type !== 'end')
      .map((ref) => analysis.eventById.get(ref.eventId))
      .filter((event): event is GoldEvent => event !== undefined)
    if (announceEvents.length > 0) {
      const keysOf = (answer: ClefAnswer | undefined) =>
        answer?.type === 'choice' ? Object.keys(answer.probabilities).filter((key) => key !== 'none') : []
      scoreValue(report.startDate, answers.start_date, keysOf(answers.start_date), (key) => {
        const date = keyToDate(key)
        return date !== undefined && announceEvents.some((event) => jstDate(event.startDate) === date)
      })
      const withEnd = announceEvents.filter((event) => event.endDate)
      if (withEnd.length > 0)
        scoreValue(report.endDate, answers.end_date, keysOf(answers.end_date), (key) => {
          const date = keyToDate(key)
          return date !== undefined && withEnd.some((event) => event.endDate !== undefined && sameOrPrevDay(date, event.endDate))
        })
      const withQuantity = announceEvents
        .map((event) => (event.limitedQuantity ? event.limitedQuantity : event.conditions.find((c) => c.quantity)?.quantity))
        .filter((q): q is number => q !== undefined)
      if (withQuantity.length > 0)
        scoreValue(report.quantity, answers.quantity, keysOf(answers.quantity), (key) => {
          const value = keyToQuantity(key)
          return value !== undefined && withQuantity.includes(value)
        })
    }

    // 終了したイベント: 終了の正解だけで評価
    const endRefs = refs.filter((ref) => ref.type === 'end')
    if (endRefs.length > 0) {
      const candidates = Object.values(decision.endedCandidates)
      if (candidates.length === 0) {
        report.endedEvent.noCandidate += 1
        continue
      }
      const reachable = endRefs.some((ref) => candidates.includes(ref.eventId))
      const picked = choiceOf(answers.ended_event)
      const pickedId = picked ? decision.endedCandidates[picked] : undefined
      const ok = pickedId !== undefined && endRefs.some((ref) => ref.eventId === pickedId)
      add(report.endedEvent, ok)
      if (reachable && ok) report.endedEvent.top1WhenCandidates += 1
    }
  }
  return report
}
