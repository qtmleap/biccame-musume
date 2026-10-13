import type { Bindings } from '@api/types/bindings'
import {
  allNameTerms,
  categoriesByTitle,
  isExampleTitle,
  storeNameTerms,
  type TitleSubjectCategory,
  titleExamples,
  titleState,
  titleSystem,
  validateTitle
} from '@biccame/shared/event-detect/title'
import type { StoreKey } from '@biccame/shared/schemas/store.dto'
import { z } from 'zod'

// 自動登録するイベントのタイトルを Claude Haiku に付けさせる。
// 命名の指示・手本の作り方・検査は shared（event-detect/title.ts）。ここは D1 から手本を取り、モデルを呼び、出力を受けるまで。
// 呼び方は CLI（scripts/lib/event-detect/judge.ts の callTool）と同じ Anthropic Messages の形（scripts は import しない）。
// どこで失敗しても例外にはせず { ok: false } を返す（呼び出し側は今の形のタイトルのまま登録する）。

/** タイトル用のモデル。差し替えるときはここだけ変える */
export const TITLE_MODEL = 'claude-haiku-5-5'

/** 呼び出しの時間の上限（ミリ秒）。再試行はしない（失敗は今の形のタイトルに戻し、キューの再試行に任せる） */
export const TITLE_TIMEOUT_MS = 20_000

export const TITLE_MAX_TOKENS = 1024

/** 通信の差し替え口。テストでは実通信をせず、これにモックを渡す（既定は fetch） */
export type TitleFetcher = (url: string, init: RequestInit) => Promise<Response>

const defaultFetcher: TitleFetcher = (url, init) => fetch(url, init)

/** answer ツール。CLI の命名と同じ（system の「answer ツールを必ず 1 回呼び」に対応する） */
const ANSWER_TOOL = {
  name: 'answer',
  description: '質問への回答を返す',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'このイベントのタイトル。規則に沿った短い名詞句だけを入れる（説明や括弧は付けない）'
      }
    },
    required: ['title'],
    additionalProperties: false
  }
}

const ExampleRowSchema = z.object({
  title: z.string().nonempty(),
  category: z.string().nonempty(),
  total: z.number().int().positive()
})

/** D1 の events から、タイトルとカテゴリごとの件数を 1 回で取る。読めない行は捨てる */
const loadExampleRows = async (env: Bindings) => {
  const rows = await env.DB.prepare(
    'SELECT title, category, COUNT(*) AS total FROM events GROUP BY title, category'
  ).all()
  return rows.results.flatMap((row) => {
    const parsed = ExampleRowSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}

const ToolUseSchema = z.object({ type: z.literal('tool_use'), input: z.unknown() })
const MessageSchema = z.object({ content: z.array(z.unknown()) })
const TitleAnswerSchema = z.object({ title: z.string().nonempty() })

/**
 * 応答の content[] のうち最初の tool_use の input を { title } として受ける。tool_use が無い・形が違うときは undefined。
 * テキスト部分（モデルの前置きなど）は題の元にしない。
 */
export const toolTitle = (body: unknown): string | undefined => {
  const message = MessageSchema.safeParse(body)
  if (!message.success) return undefined
  const [input] = message.data.content.flatMap((item) => {
    const toolUse = ToolUseSchema.safeParse(item)
    return toolUse.success ? [toolUse.data.input] : []
  })
  const answer = TitleAnswerSchema.safeParse(input)
  return answer.success ? answer.data.title : undefined
}

export type TitleInput = {
  category: TitleSubjectCategory
  /** 開始日（YYYY-MM-DD、JST） */
  startDay: string
  stores: readonly StoreKey[]
  /** 元の投稿の本文 */
  body: string
}

export type GeneratedTitle = { ok: true; title: string } | { ok: false; reason: string }

const failure = (reason: string): GeneratedTitle => {
  // 本文・題・URL・トークンは出さず、理由の種類だけを残す
  console.warn(`[webhook-title] falling back to the default title: ${reason}`)
  return { ok: false, reason }
}

const generate = async (
  env: Bindings,
  input: TitleInput,
  options: { timeoutMs: number; fetcher: TitleFetcher }
): Promise<GeneratedTitle> => {
  const baseUrl = env.ANTHROPIC_BASE_URL
  const token = env.ANTHROPIC_AUTH_TOKEN
  // 接続先かトークンが未登録の環境（登録前のステージング・本番）では呼ばず、今の形のタイトルのまま登録する
  if (baseUrl === undefined || baseUrl === '' || token === undefined || token === '') {
    console.warn('Title generation is not configured')
    return { ok: false, reason: 'not_configured' }
  }
  const rows = await loadExampleRows(env).catch(() => undefined)
  if (rows === undefined) return failure('examples_unavailable')
  const events = rows.flatMap((row) =>
    Array.from({ length: row.total }, () => ({ title: row.title, category: row.category }))
  )
  const system = titleSystem(titleExamples(events, (title) => isExampleTitle(title, allNameTerms)))
  const user = titleState({
    category: input.category,
    startDay: input.startDay,
    forbidden: storeNameTerms(input.stores),
    body: input.body
  })
  const response = await options
    .fetcher(`${baseUrl.replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        Authorization: `Bearer ${token}`,
        'x-api-key': token
      },
      body: JSON.stringify({
        model: TITLE_MODEL,
        max_tokens: TITLE_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
        tools: [ANSWER_TOOL],
        tool_choice: { type: 'auto' }
      }),
      signal: AbortSignal.timeout(options.timeoutMs)
    })
    .catch((error: unknown) => (error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network_error'))
  if (typeof response === 'string') return failure(response)
  // 429・5xx を含め、成功以外は失敗（再試行しない）
  if (!response.ok) return failure(`http_${response.status}`)
  const body: unknown = await response.json().catch(() => undefined)
  const answer = toolTitle(body)
  if (answer === undefined) return failure('invalid_output')
  const checked = validateTitle(answer, {
    terms: allNameTerms,
    category: input.category,
    existing: categoriesByTitle(events)
  })
  return checked.ok ? { ok: true, title: checked.title } : failure(`rejected_${checked.reason}`)
}

/**
 * 自動登録するイベントのタイトルを作る。D1 の登録済みタイトルを手本に、answer ツールで題を返させ、
 * shared の検査（空・長さ・括弧・キャラ名・店舗名・説明語・1 行・同名の企画とのカテゴリの食い違い）に通った題を返す。
 * 未設定（ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN）・手本の取得・通信・タイムアウト・HTTP エラー・出力の形式・検査の
 * どれが失敗しても { ok: false }（例外にしない）。D1 に登録済みのイベントが 0 件でも失敗ではなく、空の手本で作る。
 */
export const generateEventTitle = async (
  env: Bindings,
  input: TitleInput,
  options: { timeoutMs?: number; fetcher?: TitleFetcher } = {}
): Promise<GeneratedTitle> =>
  generate(env, input, {
    timeoutMs: options.timeoutMs === undefined ? TITLE_TIMEOUT_MS : options.timeoutMs,
    fetcher: options.fetcher === undefined ? defaultFetcher : options.fetcher
  }).catch(() =>
    // 想定外の例外でも登録は止めない（呼び出し側は今の形のタイトルのまま登録する）
    failure('unexpected_error')
  )
