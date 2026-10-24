import { type ClefAnswer, ClefAnswerSchema } from '@biccame/shared/event-detect/clef'
import { DetectPostSchema, ExtractionContextSchema } from '@biccame/shared/event-detect/post'
import { z } from 'zod'
import { canonicalJson } from './d1-gold-replay'
import { GoldEventSchema, sha256Hex } from './d1-gold-schema'

// コミットする Golden のフィクスチャ。D1 の人手修正済みイベントと、保存した実 AI の応答（確率は圧縮済み）を持つ。
// 質問（選択肢の説明）は持たない。現行のソースから投稿と店舗ヒントで作り直すので、質問が変わったら版が合わなくなり、再作成が要る。
export const FIXTURE_FORMAT_VERSION = 1
export const FIXTURE_DIRECTORY = 'scripts/data/d1-gold'
export const FIXTURE_FILE = `${FIXTURE_DIRECTORY}/fixture.json`
export const FIXTURE_SPLITS = ['dev', 'test'] as const
export type FixtureSplit = (typeof FIXTURE_SPLITS)[number]
// 確率の分布は上位いくつまで残すか。選ばれた選択肢は必ず残す。
export const FIXTURE_TOP_CHOICES = 8
// 確率は小数 3 桁に切り捨てる。判定に使う全てのしきい値が 0.001 の倍数なので、「しきい値以上」の結果は変わらない。
const PROBABILITY_SCALE = 1000

// 切り捨てた確率。1e-9 は 0.9 * 1000 のような浮動小数点の誤差で 1 つ下に落ちるのを防ぐ。
export const floorProbability = (value: number) => Math.floor(value * PROBABILITY_SCALE + 1e-9) / PROBABILITY_SCALE

// 確率の分布を上位 FIXTURE_TOP_CHOICES 件に切り詰め、3 桁に切り捨てる。選ばれた選択肢が最大なので、切り詰めても検証を通る。
export const compactAnswer = (answer: ClefAnswer): ClefAnswer => {
  if (answer.type === 'noul') return { type: 'noul', noul: floorProbability(answer.noul) }
  if (answer.type === 'score') return { type: 'score', score: answer.score }
  const ranked = Object.entries(answer.probabilities).sort(([, a], [, b]) => b - a)
  const kept = ranked.slice(0, FIXTURE_TOP_CHOICES)
  const selected = ranked.find(([key]) => key === answer.choice)
  const withSelected =
    selected !== undefined && !kept.some(([key]) => key === answer.choice) ? [...kept, selected] : kept
  return {
    type: 'choice',
    choice: answer.choice,
    probabilities: Object.fromEntries(withSelected.map(([key, value]) => [key, floorProbability(value)]))
  }
}
export const compactAnswers = (answers: Record<string, ClefAnswer>): Record<string, ClefAnswer> =>
  Object.fromEntries(Object.entries(answers).map(([key, answer]) => [key, compactAnswer(answer)]))

// 判定に渡した投稿。元の投稿の本文（originalText）は案件ごとに 1 回だけ持つ。
const FixturePostSchema = DetectPostSchema.omit({ extractionContext: true }).extend({
  extractionContext: ExtractionContextSchema.omit({ originalText: true }).optional()
})
export const FixtureCandidateSchema = z.object({
  item: z.string().nonempty(),
  contextOnly: z.boolean(),
  // 抽出段階の開催店舗候補。判定の質問と evaluateDetection の storeKey に使う。
  storeKey: z.string().nonempty().nullable(),
  post: FixturePostSchema,
  answers: z.record(z.string().nonempty(), ClefAnswerSchema)
})
export const FixtureCaseSchema = z.object({
  caseId: z.string().nonempty(),
  split: z.enum(FIXTURE_SPLITS),
  originalText: z.string().nonempty(),
  golds: z.array(GoldEventSchema).nonempty(),
  // 投稿が完了しなかった（実 AI の応答が無い）案件は、正解の数を保つために候補なしで残す。
  completed: z.boolean(),
  // 件数質問の応答と抽出した物品名。件数の監査（auditItemCount）の再計算に使う。
  items: z.array(z.string().nonempty()),
  count: ClefAnswerSchema.nullable(),
  candidates: z.array(FixtureCandidateSchema)
})
export type FixtureCase = z.infer<typeof FixtureCaseSchema>
export type FixtureCandidate = z.infer<typeof FixtureCandidateSchema>

const FixtureBodySchema = z.object({
  formatVersion: z.literal(FIXTURE_FORMAT_VERSION),
  // 質問を作ったときの判定の版。DETECTION_VERSION と違えば質問が変わっているので、再作成が要る。
  detectionVersion: z.string().nonempty(),
  source: z.object({ casesSha256: z.string().nonempty(), splitSha256: z.string().nonempty() }),
  cases: z.array(FixtureCaseSchema).nonempty()
})
export const FixtureFileSchema = FixtureBodySchema.extend({ contentSha256: z.string().nonempty() })
export type FixtureBody = z.infer<typeof FixtureBodySchema>
export type FixtureFile = z.infer<typeof FixtureFileSchema>

// キーの並びや空白に依らない内容のハッシュ。ファイルの破損や手作業の改変を検知する。
export const fixtureHash = (body: FixtureBody) => sha256Hex(canonicalJson(body))

export const withHash = (body: FixtureBody): FixtureFile => ({ ...body, contentSha256: fixtureHash(body) })

// 案件ごとに 1 行にして、差分を読めるようにする。
export const serializeFixture = (file: FixtureFile) => {
  const { cases, ...rest } = file
  const head = JSON.stringify(rest).slice(0, -1)
  return `${head},"cases":[\n${cases.map((fixtureCase) => JSON.stringify(fixtureCase)).join(',\n')}\n]}\n`
}

export const parseFixture = (text: string): FixtureFile => {
  const parsed = FixtureFileSchema.safeParse(JSON.parse(text))
  if (!parsed.success) throw new Error('Invalid D1 gold fixture')
  return parsed.data
}
