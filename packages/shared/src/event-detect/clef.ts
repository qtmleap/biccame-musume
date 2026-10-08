import { z } from 'zod'

// Workers AI の判定モデル Clef（@cf/cloudflare/clef, clef-flash）の入出力。
// 文章を生成せず、状態（state）に対する型付きの質問へ確率付きで答える。
// https://developers.cloudflare.com/workers-ai/models/clef/

export const CLEF_MODELS = ['clef', 'clef-flash'] as const

export const ClefModelSchema = z.enum(CLEF_MODELS)

export type ClefModel = z.infer<typeof ClefModelSchema>

/** 質問 ID と choice の選択肢キーに使える文字（Clef の制約） */
const KeySchema = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/)

const InstructionsSchema = z.string().nonempty().max(2000)

export const ClefQuestionSchema = z.discriminatedUnion('type', [
  /** はい・いいえ。肯定の確率を返す */
  z.object({ type: z.literal('noul'), instructions: InstructionsSchema }),
  /** 選択肢から 1 つ。選択肢はリクエストごとに 2〜255 個 */
  z.object({
    type: z.literal('choice'),
    instructions: InstructionsSchema,
    criteria: z
      .record(KeySchema, z.string().nonempty().max(1000))
      .refine((criteria) => Object.keys(criteria).length >= 2 && Object.keys(criteria).length <= 255, {
        message: 'choice の選択肢は 2〜255 個'
      })
  }),
  /** 順序付きの段階（低い順に 2〜10 段階） */
  z.object({
    type: z.literal('score'),
    instructions: InstructionsSchema,
    criteria: z.array(z.string().nonempty()).min(2).max(10)
  })
])

export type ClefQuestion = z.infer<typeof ClefQuestionSchema>

export const ClefRequestSchema = z.object({
  model: ClefModelSchema,
  state: z.string().nonempty().max(20_000),
  questions: z
    .record(KeySchema, ClefQuestionSchema)
    .refine((questions) => Object.keys(questions).length >= 1 && Object.keys(questions).length <= 64, {
      message: '質問は 1〜64 個'
    })
})

export type ClefRequest = z.infer<typeof ClefRequestSchema>

const ProbabilitySchema = z.number().min(0).max(1)

export const ClefAnswerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noul'), noul: ProbabilitySchema }),
  z.object({
    type: z.literal('choice'),
    choice: KeySchema,
    probabilities: z.record(KeySchema, ProbabilitySchema),
    confidence: ProbabilitySchema.optional()
  }),
  z.object({ type: z.literal('score'), score: z.number(), confidence: ProbabilitySchema.optional() })
])

export type ClefAnswer = z.infer<typeof ClefAnswerSchema>

export const ClefResponseSchema = z.object({
  answers: z.record(KeySchema, ClefAnswerSchema),
  usage: z
    .object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() })
    .optional()
})

export type ClefResponse = z.infer<typeof ClefResponseSchema>
