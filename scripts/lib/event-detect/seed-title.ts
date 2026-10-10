import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { CATEGORY_CRITERIA } from './decide'
import { type CallStats, callTool, emptyStats, JUDGE_MODEL, type JudgeEndpoint, type Validated } from './judge'
import { GapStatusSchema } from './schema'
import { writeAtomic } from './store'

// seed のタイトルを Claude Haiku に D1 流の名前で付けさせる。1 イベント 1 リクエストで、ツール 1 つ（title）に答えさせる。
// 手本は D1 の正解データ（gold.json）から実行時に作る。結果はリクエスト内容のハッシュごとに保存し、保存済みは呼ばない。
// 空・長さ・括弧・キャラ名の検査は、保存した題を使うとき（seed.ts）に行う。ここは「題を得て保存する」までで、
// 検査に落ちた題でも保存は残す（検査の規則を変えても呼び直さない）。

/**
 * 命名のバージョン。プロンプト（システムの指示・状態の組み立て・ツールの定義）を変えたら上げる。
 * 保存先（.cache/event-detect/seed-title/<モデル>/<バージョン>/）が分かれ、古い指示で付いた題と混ざらない。
 */
export const TITLE_VERSION = 'v1'

/** タイトルの長さの上限（文字数）。D1 の手本は短い名詞句 */
export const TITLE_MAX_LENGTH = 30

/** 投稿本文 1 件あたりの文字数の上限と、1 イベントに付ける投稿の数 */
export const BODY_LIMIT = 600
export const BODY_POSTS = 2

/** 手本に載せる D1 のタイトルの数（出現数の多い順）と、カテゴリごとの代表例の数 */
export const EXAMPLE_TOP = 60
export const EXAMPLE_PER_CATEGORY = 5

type TitleStatus = z.infer<typeof GapStatusSchema>

/**
 * 命名の指示とリクエストに載せるカテゴリ。GapCategorySchema に acsta を足しても指示文は変えない（変えるとリクエストの
 * ハッシュが変わって、保存済みの題が全部使えなくなる）ので、足す前の 4 つを直に並べる。アクスタは題で判定する
 * （seed.ts の judgeAcsta）ため、命名には other として渡す（other の基準にアクスタが入っている）。
 */
const CATEGORIES = ['limited_card', 'regular_card', 'ackey', 'other'] as const

export type TitleCategory = (typeof CATEGORIES)[number]

/** 文字コード順の比較（実行環境のロケールに依らない並び） */
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** 値の出現数を数える。キーの出現順を保つ */
const countBy = (values: readonly string[]) => {
  const counts = new Map<string, number>()
  for (const value of values) {
    const current = counts.get(value)
    counts.set(value, current === undefined ? 1 : current + 1)
  }
  return counts
}

/** 出現数の多い順、同数は文字コード順 */
const ranked = (values: readonly string[]) =>
  [...countBy(values)]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => (a.count !== b.count ? b.count - a.count : compareText(a.title, b.title)))

// ---------------------------------------------------------------------------------------------
// 手本（D1 の正解データ）
// ---------------------------------------------------------------------------------------------

export type TitleExamples = {
  /** D1 のタイトルを出現数の多い順に（件数つき） */
  top: { title: string; count: number }[]
  /** カテゴリごとの代表例（そのカテゴリで出現数の多い順） */
  byCategory: Record<TitleCategory, string[]>
}

/**
 * D1 の正解データ（gold.json の title と category）から、命名の手本を作る。
 * accept が false のタイトル（括弧やキャラ名が入った古い登録）は、規則に反するので手本に載せない。
 * 並びは出現数の多い順・同数は文字コード順で決まり、同じ gold なら同じ手本になる。
 */
export const titleExamples = (
  events: readonly { title: string; category: string }[],
  accept: (title: string) => boolean
): TitleExamples => {
  const usable = events.filter((event) => accept(event.title))
  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      ranked(usable.filter((event) => event.category === category).map((event) => event.title))
        .slice(0, EXAMPLE_PER_CATEGORY)
        .map((entry) => entry.title)
    ])
  )
  return {
    top: ranked(usable.map((event) => event.title)).slice(0, EXAMPLE_TOP),
    byCategory: {
      limited_card: byCategory.limited_card,
      regular_card: byCategory.regular_card,
      ackey: byCategory.ackey,
      other: byCategory.other
    }
  }
}

/**
 * 命名の指示（system）。全イベントで同じ文面で、実行時刻や Clef の判定のように実行ごとに変わるものは入れない
 * （dry-run と --apply で同じキーになり、--apply で呼び直さない）。
 */
export const titleSystem = (examples: TitleExamples) =>
  [
    'あなたはビックカメラの店舗擬人化キャラクター「ビッカメ娘」のノベルティ配布イベントに、データベースの登録名（タイトル）を付ける担当です。',
    '与えられたイベント（state）の配布物の名前と投稿本文を読み、すでに登録されているタイトルと同じ流儀の短い名前を付けてください。answer ツールを必ず 1 回呼び、title に名前だけを入れてください。',
    '',
    '命名の規則:',
    '1. 「（季節・行事・記念名）＋（配布物）」の短い名詞句にする。例: バレンタイン名刺、ハロウィン名刺、夏名刺、新年名刺、擬人化10周年記念アクキー、爆誕4周年記念名刺、コラボ名刺、通常名刺、ビックカメラギフトカード、缶バッジくじ',
    '2. キャラ名（○○たん）・店舗名・地名は入れない（店舗は別に持っている）。state の「入れてはいけない語」は特に厳守する。ただし「ビッカメ娘」は入れてよい',
    '3. 括弧（() （） []）・【】・「」で補足を付けない。配布条件（金額・購入・先着・おひとり様）、日付・期間、「配布」「プレゼント」「開始」「先行」「追加」「イベント」「デザイン」「ver」などの説明語を入れない',
    '4. 「例のアレ」「2月のアレ」のような婉曲表現は、投稿本文から何の配布物かを読み取って言い換える',
    '5. 登録済みのタイトルに同じ企画の名前があれば（例「缶バッジで繋ぐビッカメ娘旅」「ビッカメ娘11周年記念名刺」）、その表記に揃える',
    `6. ${TITLE_MAX_LENGTH} 文字以内`,
    '',
    '登録済みのタイトル（出現数の多い順。末尾の数字は件数）:',
    ...examples.top.map((entry) => `- ${entry.title}（${entry.count}）`),
    '',
    'カテゴリ別の登録済みタイトルの例:',
    ...CATEGORIES.map(
      (category) => `- ${category}（${CATEGORY_CRITERIA[category]}）: ${examples.byCategory[category].join('、')}`
    )
  ].join('\n')

// ---------------------------------------------------------------------------------------------
// 状態（イベント 1 件）
// ---------------------------------------------------------------------------------------------

const STATUS_LABELS: Record<TitleStatus, string> = {
  announce: '告知',
  start: '開始',
  ongoing: '配布中',
  end: '終了'
}

/** 告知・開始の投稿を優先して選ぶ。それ以外（配布中・終了）は告知・開始が足りないときだけ */
const PREFERRED: readonly TitleStatus[] = ['announce', 'start']
const STATUS_ORDER = GapStatusSchema.options

export type Mention = { postId: string; status: TitleStatus }

export type TitleBody = { status: TitleStatus; text: string }

/** 本文を探す投稿の ID。状態ごとに先頭の BODY_POSTS 件（投稿が多いイベントで全部は引かない） */
export const bodyCandidateIds = (mentions: readonly Mention[]) =>
  STATUS_ORDER.flatMap((status) =>
    mentions.filter((mention) => mention.status === status).slice(0, BODY_POSTS)
  ).map((mention) => mention.postId)

/**
 * 代表的な投稿本文を最大 BODY_POSTS 件選ぶ。告知の最初の投稿、開始の最初の投稿、の順に取り、足りなければ
 * 残りの告知・開始（言及の順）、それでも足りなければ配布中・終了。本文が引けない投稿は飛ばす。
 * 各本文は BODY_LIMIT 文字（コードポイント）まで。
 */
export const pickBodies = (mentions: readonly Mention[], texts: ReadonlyMap<string, string>): TitleBody[] => {
  const available = STATUS_ORDER.flatMap((status) => mentions.filter((mention) => mention.status === status)).filter(
    (mention) => texts.has(mention.postId)
  )
  const preferred = available.filter((mention) => PREFERRED.includes(mention.status))
  const others = available.filter((mention) => !PREFERRED.includes(mention.status))
  const firsts = PREFERRED.flatMap((status) => {
    const hit = preferred.find((mention) => mention.status === status)
    return hit ? [hit] : []
  })
  const ordered = [...firsts, ...preferred.filter((mention) => !firsts.includes(mention)), ...others]
  return ordered.slice(0, BODY_POSTS).flatMap((mention) => {
    const text = texts.get(mention.postId)
    return text === undefined ? [] : [{ status: mention.status, text: [...text].slice(0, BODY_LIMIT).join('') }]
  })
}

export type TitleSubject = {
  /** LLM が投稿から読み取った配布物の名前（emulate の item） */
  item: string
  category: TitleCategory
  /** 開始日（YYYY-MM-DD、JST） */
  startDay: string
  /** この店舗のキャラ名・店舗名。タイトルに入れてはいけない語 */
  forbidden: readonly string[]
  bodies: readonly TitleBody[]
}

/** 費用の概算（USD）。judge・extract と同じ単価（入力 $0.10 / 出力 $0.50 per 1M トークン） */
export const titleCost = (inputTokens: number, outputTokens: number) =>
  (inputTokens * 0.1 + outputTokens * 0.5) / 1_000_000

/** 命名のリクエスト内容（キャッシュのキーの元）。user は 1 イベントの状態 */
export type TitleRequest = { system: string; state: string }

export type TitleTarget = { key: string; request: TitleRequest }

/** イベント 1 件の状態。月がわかるよう開始日に月を添える */
export const titleState = (subject: TitleSubject) => {
  const month = Number(subject.startDay.slice(5, 7))
  return [
    `配布物の名前（投稿から読み取ったもの）: ${subject.item}`,
    `カテゴリ: ${subject.category}（${CATEGORY_CRITERIA[subject.category]}）`,
    `開始日: ${subject.startDay}（${month}月）`,
    `入れてはいけない語（この店舗のキャラ名・店舗名）: ${subject.forbidden.length > 0 ? subject.forbidden.join('、') : '（なし）'}`,
    '',
    ...(subject.bodies.length > 0
      ? subject.bodies.flatMap((body) => [`投稿本文（${STATUS_LABELS[body.status]}）:`, body.text, ''])
      : ['投稿本文: （取得できなかった）', ''])
  ].join('\n')
}

/** リクエストの内容のハッシュ。モデルとバージョンも含める（judge.ts の requestKey と同じ流儀） */
export const titleKey = (request: TitleRequest) =>
  createHash('sha256')
    .update(JSON.stringify({ model: JUDGE_MODEL, version: TITLE_VERSION, request }))
    .digest('hex')
    .slice(0, 32)

export const buildTitleTarget = (system: string, subject: TitleSubject): TitleTarget => {
  const request = { system, state: titleState(subject) }
  return { key: titleKey(request), request }
}

// ---------------------------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------------------------

const titleSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'このイベントのタイトル。規則に沿った短い名詞句だけを入れる（説明や括弧は付けない）' }
  },
  required: ['title'],
  additionalProperties: false
}

/** ツールの入力の形だけを確かめる（空・長さ・括弧・キャラ名は seed.ts の検査。ここで弾くと待って聞き直してしまう） */
const validateTitle = (input: unknown): Validated<{ title: string }> => {
  if (typeof input !== 'object' || input === null) return { ok: false, reason: 'input is not an object' }
  const title = Reflect.get(input, 'title')
  return typeof title === 'string' ? { ok: true, value: { title } } : { ok: false, reason: 'title is not a string' }
}

export type TitleRecord = {
  key: string
  model: string
  version: string
  request: TitleRequest
  /** モデルが返した題そのまま（検査も正規化もしていない） */
  title: string
  attempts: number
  usage: { input_tokens: number; output_tokens: number }
  requestId: string | undefined
  elapsedMs: number
}

const CachedTitleSchema = z.object({ title: z.string() })

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** 保存済みの題。無い・読めないときは undefined（読めないものは呼び直して上書きする） */
export const readTitle = async (cacheDir: string, key: string) => {
  const path = resolve(cacheDir, `${key}.json`)
  if (!existsSync(path)) return undefined
  const parsed = CachedTitleSchema.safeParse(parseJson(await readFile(path, 'utf8')))
  return parsed.success ? parsed.data.title : undefined
}

export type TitleProgress = {
  /** 同じリクエストを 1 件にまとめた後の件数 */
  total: number
  done: number
  /** 保存済みの題を使った（呼んでいない） */
  cached: number
  /** 呼んで題を得て保存した */
  called: number
  failed: number
  stats: CallStats
  inputTokens: number
  outputTokens: number
}

export type TitleRun = {
  /** リクエストのキー → モデルが返した題。失敗した分は無い */
  titles: Map<string, string>
  progress: TitleProgress
}

/**
 * 命名を流す。保存済みは呼ばない。1 件の失敗（429 などの再試行を尽くした後も含む）では止まらず、数えて次へ進む。
 * 失敗した分は次の実行でだけ呼び直される。
 */
export const runTitles = async (options: {
  targets: readonly TitleTarget[]
  cacheDir: string
  concurrency: number
  endpoint: JudgeEndpoint
  onProgress?: (progress: TitleProgress) => void
  onError?: (target: TitleTarget, error: unknown) => void
}): Promise<TitleRun> => {
  await mkdir(options.cacheDir, { recursive: true })
  const unique = [...new Map(options.targets.map((target) => [target.key, target])).values()]
  const titles = new Map<string, string>()
  const progress: TitleProgress = {
    total: unique.length,
    done: 0,
    cached: 0,
    called: 0,
    failed: 0,
    stats: emptyStats(),
    inputTokens: 0,
    outputTokens: 0
  }
  const queue = { next: 0 }
  const worker = async () => {
    for (;;) {
      const target = unique[queue.next]
      queue.next += 1
      if (!target) return
      const saved = await readTitle(options.cacheDir, target.key)
      if (saved !== undefined) {
        titles.set(target.key, saved)
        progress.cached += 1
      } else {
        try {
          const result = await callTool(
            options.endpoint,
            {
              system: target.request.system,
              user: target.request.state,
              schema: titleSchema,
              validate: validateTitle
            },
            progress.stats
          )
          const record: TitleRecord = {
            key: target.key,
            model: JUDGE_MODEL,
            version: TITLE_VERSION,
            request: target.request,
            title: result.value.title,
            attempts: result.attempts,
            usage: result.usage,
            requestId: result.requestId,
            elapsedMs: result.elapsedMs
          }
          await writeAtomic(resolve(options.cacheDir, `${target.key}.json`), JSON.stringify(record))
          titles.set(target.key, result.value.title)
          progress.called += 1
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
  return { titles, progress }
}
