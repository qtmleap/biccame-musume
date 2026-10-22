import { createHash } from 'node:crypto'
import { EventCategorySchema, EventCharacterSchema } from '@biccame/shared/schemas/event.dto'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import { z } from 'zod'
import { benchmarkTextHash, normalizedBenchmarkText } from './benchmark-corpus'
import type { GoalAnnotatedCase } from './goal-pipeline-goal-corpus'

export const EXPANDED_DATASET_REVISION = 'annotated-expanded-v2'
export const EXPANDED_ID_PREFIX = 'expanded-v2'
export const D1_ANCHORED_DATASET_REVISION = 'annotated-d1-anchored-v1'
export const D1_ANCHORED_ID_PREFIX = 'd1-anchored-v1'
// 検査が見るrevisionとID接頭辞。既定はexpanded-v2で、D1起点セットだけが別の組を渡す。
export type CorpusProfile = { revision: string; idPrefix: string; requireD1Reference: boolean }
export const EXPANDED_PROFILE: CorpusProfile = {
  revision: EXPANDED_DATASET_REVISION,
  idPrefix: EXPANDED_ID_PREFIX,
  requireD1Reference: false
}
export const D1_ANCHORED_PROFILE: CorpusProfile = {
  revision: D1_ANCHORED_DATASET_REVISION,
  idPrefix: D1_ANCHORED_ID_PREFIX,
  requireD1Reference: true
}
// これ以上似た本文は別企画でも同一テンプレートの再掲とみなし、新旧どちらとも共存させない。
export const NEAR_DUPLICATE_THRESHOLD = 0.9
const CategoryGoldSchema = z.union([EventCategorySchema, z.null()])
const StoresGoldSchema = z.union([z.array(StoreKeySchema), z.null()])
const CharactersGoldSchema = z.union([z.array(EventCharacterSchema), z.null()])
const GOLD_FIELDS = ['category', 'stores', 'characterIds', 'startDate', 'conditions'] as const

const CountsSchema = z.record(z.string().nonempty(), z.number().int().nonnegative())
// D1起点セットだけが持つ来歴。候補総数・除外内訳・選定器の条件・近似テンプレートを記録する。
export const D1AnchoringSchema = z.object({
  referenceSource: z.string().nonempty(),
  eventOrigins: CountsSchema,
  referenceRows: CountsSchema,
  candidatePool: CountsSchema,
  exclusions: CountsSchema,
  unannotatedCandidateReasons: CountsSchema,
  selectedEventOrigins: CountsSchema,
  negativeSelection: z.record(z.string().nonempty(), z.union([z.boolean(), z.number(), z.string().nonempty()])),
  templateFamilies: z.array(z.object({ family: z.string().nonempty(), caseIds: z.array(z.string().nonempty()).min(2) })),
  priorTemplateRelated: z.array(
    z.object({ caseId: z.string().nonempty(), priorId: z.string().nonempty(), similarity: z.number() })
  ),
  limitations: z.array(z.string().nonempty()).nonempty()
})
export type D1Anchoring = z.infer<typeof D1AnchoringSchema>

export const ExpandedProvenanceSchema = z.object({
  datasetRevision: z.enum([EXPANDED_DATASET_REVISION, D1_ANCHORED_DATASET_REVISION]),
  annotationStatus: z.literal('provisional-not-human-reviewed'),
  cases: z.number().int().positive(),
  positive: z.number().int().nonnegative(),
  negative: z.number().int().nonnegative(),
  sourceArchives: z.record(z.string().nonempty(), z.number().int().positive()),
  sourceRecordsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  annotationsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  yearAccountMonthMatched: z.literal(true),
  priorCorpusCases: z.number().int().positive(),
  d1Anchoring: D1AnchoringSchema.optional()
})
export type ExpandedProvenance = z.infer<typeof ExpandedProvenanceSchema>

export type PriorCaseRow = { id: string; postId: string; text: string; group: string }
export const RawCaseRowsSchema = z.array(z.record(z.string(), z.unknown()))
export type RawCaseRow = z.infer<typeof RawCaseRowsSchema>[number]
const RecordSchema = z.record(z.string(), z.unknown())

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]: [string, unknown]) => [key, sortKeys(item)])
    )
  return value
}
// キー順を固定した最小JSON。収集時のPython json.dumps(sort_keys, separators=(',', ':'))と同じ文字列になる。
export const canonicalJson = (value: unknown) => JSON.stringify(sortKeys(value))
export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex')
export const monthAccountBucket = (sample: GoalAnnotatedCase) =>
  `${sample.post.createdAt.slice(0, 7)}:${sample.post.screenName.toLowerCase()}`

const ANNOTATION_KEYS = ['id', 'expected', 'stageGold', 'rationale', 'tags', 'group', 'reviewStatus'] as const
// 採点側が見る注釈だけのdigest。投稿や出典の変更とは別に、ラベルの改変を検出する。
export const annotationsDigest = (rows: RawCaseRow[]) =>
  sha256Hex(canonicalJson(rows.map((row) => Object.fromEntries(ANNOTATION_KEYS.map((key) => [key, row[key]])))))
export const sourceRecordsDigest = (cases: GoalAnnotatedCase[]) =>
  sha256Hex(
    canonicalJson(
      cases
        .map((sample): [string, GoalAnnotatedCase['provenance']] => [sample.post.id, sample.provenance])
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    )
  )

const trigrams = (text: string) => {
  const chars = Array.from(normalizedBenchmarkText(text))
  return new Set(
    Array.from({ length: Math.max(0, chars.length - 2) }, (_, index) => chars.slice(index, index + 3).join(''))
  )
}
const jaccard = (a: Set<string>, b: Set<string>) => {
  const common = [...a].filter((gram) => b.has(gram)).length
  const union = a.size + b.size - common
  return union === 0 ? 0 : common / union
}
export type SimilarPair = { id: string; other: string; similarity: number }
// 新規ケースが旧コーパスまたは新規同士のどれかと文字3-gramで閾値以上似ている対を返す。
export const nearDuplicatePairs = (cases: GoalAnnotatedCase[], prior: PriorCaseRow[], threshold: number) => {
  const priorGrams = prior.map((row) => ({ id: row.id, grams: trigrams(row.text) }))
  const newGrams = cases.map((sample) => ({ id: sample.id, grams: trigrams(sample.post.text) }))
  const similar = (a: Set<string>, b: Set<string>) => {
    const ratio = Math.min(a.size, b.size) / Math.max(a.size, b.size)
    return ratio < threshold ? 0 : jaccard(a, b)
  }
  return newGrams.flatMap((sample, index): SimilarPair[] =>
    [...priorGrams, ...newGrams.slice(index + 1)]
      .filter((other) => sample.grams.size > 0 && other.grams.size > 0)
      .map((other) => ({ id: sample.id, other: other.id, similarity: similar(sample.grams, other.grams) }))
      .filter((pair) => pair.similarity >= threshold)
  )
}

const overlapIssues = (cases: GoalAnnotatedCase[], prior: PriorCaseRow[]) => {
  const ids = new Set(prior.map((row) => row.id))
  const postIds = new Set(prior.map((row) => row.postId))
  const texts = new Set(prior.map((row) => benchmarkTextHash(row.text)))
  const groups = new Set(prior.map((row) => row.group))
  return cases.flatMap((sample) =>
    [
      ids.has(sample.id) && 'case id',
      postIds.has(sample.post.id) && 'post id',
      texts.has(benchmarkTextHash(sample.post.text)) && 'normalized text',
      groups.has(sample.group) && 'campaign group'
    ]
      .filter((kind) => kind !== false)
      .map((kind) => `${sample.id}: ${kind} overlaps the prior corpus`)
  )
}

// スキーマが黙って捨てた項目(綴り違いの正解キーなど)を拾い、採点から静かに消える注釈を防ぐ。
const strippedKeys = (raw: unknown, parsed: unknown, path: string): string[] => {
  if (Array.isArray(raw) && Array.isArray(parsed))
    return raw.flatMap((item, index) => strippedKeys(item, parsed[index], `${path}[${index}]`))
  const rawRecord = RecordSchema.safeParse(raw)
  const parsedRecord = RecordSchema.safeParse(parsed)
  if (!rawRecord.success || !parsedRecord.success) return []
  return Object.entries(rawRecord.data).flatMap(([key, value]) =>
    key in parsedRecord.data ? strippedKeys(value, parsedRecord.data[key], `${path}.${key}`) : [`${path}.${key}`]
  )
}

const caseIssues = (sample: GoalAnnotatedCase, row: RawCaseRow, profile: CorpusProfile) => {
  const issues: string[] = []
  const problem = (message: string) => issues.push(`${sample.id}: ${message}`)
  const positive = sample.expected.isEvent
  const { stageGold } = sample
  const kind = positive ? 'positive' : 'negative'
  if (sample.id !== `${profile.idPrefix}-${kind}-${sample.post.id}`)
    problem(`id must be ${profile.idPrefix}-<label>-<postId>`)
  for (const tag of ['goal-pipeline', profile.idPrefix, kind])
    if (!sample.tags.includes(tag)) problem(`missing tag ${tag}`)
  if (sample.source !== 'public-post') problem('source must be public-post')
  if (!sample.post.url.includes(`/status/${sample.post.id}`)) problem('post url does not reference the post id')
  for (const path of strippedKeys(row, sample, '$')) problem(`unknown field ${path}`)
  if (sample.post.extractionContext !== undefined) problem('post must not carry a precomputed extraction context')
  if (sample.provenance.textSha256 !== sha256Hex(sample.post.text)) problem('text provenance hash mismatch')
  if (sample.provenance.postSha256 !== sha256Hex(canonicalJson(row.post))) problem('full post projection hash mismatch')
  if (sample.expected.status !== null) problem('status must stay unannotated')
  if (sample.observedD1.job !== null || sample.observedD1.candidates.length > 0)
    problem('observed D1 diagnostics must not carry jobs or candidates')
  if (positive === (stageGold.action === 'not_event')) problem('isEvent and stage action disagree')
  if (positive === (stageGold.registration === 'not_applicable')) problem('isEvent and registration disagree')
  if (positive !== stageGold.items.length > 0)
    problem(positive ? 'positive has no item evidence' : 'negative has items')
  for (const item of stageGold.items)
    for (const evidence of item.evidence)
      if (!sample.post.text.includes(evidence)) problem(`evidence is not in the post: ${evidence}`)
  const unannotated = new Set(stageGold.unannotatedFields)
  if (unannotated.size !== stageGold.unannotatedFields.length) problem('duplicate unannotated field')
  for (const field of stageGold.unannotatedFields)
    if (!GOLD_FIELDS.some((name) => name === field)) problem(`unknown unannotated field ${field}`)
  // 確定(非null、[]は確認できた不在)と未確定(unannotatedFields)は各項目でちょうど一方。
  for (const field of GOLD_FIELDS)
    if ((sample.expected[field] !== null) === unannotated.has(field))
      problem(`${field} must be exactly one of confirmed or unannotated`)
  if (stageGold.registration === 'ready' && (stageGold.action !== 'new' || stageGold.unannotatedFields.length > 0))
    problem('ready registration needs a new action and every gold field confirmed')
  if (!CategoryGoldSchema.safeParse(sample.expected.category).success) problem('invalid category')
  if (!StoresGoldSchema.safeParse(sample.expected.stores).success) problem('invalid store key')
  if (!CharactersGoldSchema.safeParse(sample.expected.characterIds).success) problem('invalid character id')
  return issues
}

// D1登録イベントの参照は診断専用。参照先の来歴だけを列挙型で縛り、値そのものは検査しない。
const ReferencedEventSchema = z.object({
  eventId: z.uuid(),
  association: z.literal('reference-url'),
  referenceUrl: z.url(),
  origin: z.enum(['manual-or-seed', 'webhook-job-or-candidate', 'ai-judged-fields'])
})
// D1起点セット専用の検査。陽性は出典投稿の参考URLでD1イベントへ紐づき、陰性はどのイベントにも紐づかない。
const d1AnchorIssues = (cases: GoalAnnotatedCase[]) =>
  cases.flatMap((sample) => {
    const parsed = z.array(ReferencedEventSchema).safeParse(sample.observedD1.referencedEvents)
    if (!parsed.success) return [`${sample.id}: invalid referenced D1 event`]
    const positive = sample.expected.isEvent
    const missing = positive && parsed.data.length === 0 ? [`${sample.id}: positive has no D1 reference`] : []
    const extra = !positive && parsed.data.length > 0 ? [`${sample.id}: negative must not reference a D1 event`] : []
    const foreign = parsed.data
      .filter((ref) => !new RegExp(`/status/${sample.post.id}(?:\\D|$)`).test(ref.referenceUrl))
      .map((ref) => `${sample.id}: reference url does not point at the post (${ref.eventId})`)
    return [...missing, ...extra, ...foreign]
  })

// 同じD1イベントを参照する陽性は同一企画の告知・続報・終了で、統計的に独立でない。groupだけでは束ねられないので家族タグを必須にする。
const FAMILY_TAG = 'template-family:'
const sharedEventFamilyIssues = (cases: GoalAnnotatedCase[]) => {
  const links = cases.flatMap((sample) =>
    z
      .array(ReferencedEventSchema)
      .catch([])
      .parse(sample.observedD1.referencedEvents)
      .map((ref) => ({ eventId: ref.eventId, sample }))
  )
  return [...new Set(links.map((link) => link.eventId))].flatMap((eventId) => {
    const samples = links.filter((link) => link.eventId === eventId).map((link) => link.sample)
    if (samples.length < 2) return []
    const families = samples.map((sample) => sample.tags.filter((tag) => tag.startsWith(FAMILY_TAG)).join(','))
    const shared = families.every((family) => family !== '' && family === families[0])
    return shared ? [] : [`cases sharing D1 event ${eventId} must carry the same ${FAMILY_TAG} tag`]
  })
}

// 来歴の記録が実データと食い違わないことを確かめる。D1起点セットでは記録の欠落も不備とする。
const d1AnchoringIssues = (cases: GoalAnnotatedCase[], provenance: ExpandedProvenance) => {
  const anchoring = provenance.d1Anchoring
  if (anchoring === undefined) return ['provenance d1Anchoring is missing']
  const ids = new Set(cases.map((sample) => sample.id))
  const referenced = cases.reduce((sum, sample) => sum + sample.observedD1.referencedEvents.length, 0)
  const origins = Object.values(anchoring.selectedEventOrigins).reduce((sum, count) => sum + count, 0)
  return [
    ...(origins === referenced ? [] : ['provenance selected event origins do not account for every D1 reference']),
    ...anchoring.templateFamilies.flatMap((entry) =>
      entry.caseIds.filter((id) => !ids.has(id)).map((id) => `template family ${entry.family}: unknown case ${id}`)
    ),
    ...anchoring.priorTemplateRelated
      .filter((entry) => !ids.has(entry.caseId))
      .map((entry) => `prior template relation: unknown case ${entry.caseId}`)
  ]
}

const matchingIssues = (cases: GoalAnnotatedCase[]) => {
  return [...new Set(cases.map(monthAccountBucket))]
    .map((bucket) => {
      const rows = cases.filter((sample) => monthAccountBucket(sample) === bucket)
      return { bucket, positive: rows.filter((sample) => sample.expected.isEvent).length, total: rows.length }
    })
    .filter((row) => row.positive * 2 !== row.total)
    .map((row) => `unmatched month/account bucket ${row.bucket}: ${row.positive} positive of ${row.total}`)
}

type AuditInput = {
  cases: GoalAnnotatedCase[]
  rows: RawCaseRow[]
  prior: PriorCaseRow[]
  provenance: ExpandedProvenance
  profile?: CorpusProfile
}
// 新規コーパスの機械検証。問題を文字列で全件返し、空ならCLIがそのまま読み込める。
export const auditExpandedCorpus = ({ cases, rows, prior, provenance, profile = EXPANDED_PROFILE }: AuditInput) => {
  const positive = cases.filter((sample) => sample.expected.isEvent).length
  const archives = Object.values(provenance.sourceArchives).reduce((sum, count) => sum + count, 0)
  const near = nearDuplicatePairs(cases, prior, NEAR_DUPLICATE_THRESHOLD)
  return [
    ...(provenance.datasetRevision === profile.revision ? [] : ['provenance dataset revision differs from the profile']),
    ...(rows.length === cases.length ? [] : ['raw rows and parsed cases are not aligned']),
    ...cases.flatMap((sample, index) => {
      const row = rows[index]
      return row === undefined ? [`${sample.id}: raw row is missing`] : caseIssues(sample, row, profile)
    }),
    ...(profile.requireD1Reference ? [...d1AnchorIssues(cases), ...sharedEventFamilyIssues(cases), ...d1AnchoringIssues(cases, provenance)] : []),
    ...overlapIssues(cases, prior),
    ...matchingIssues(cases),
    ...near.map((pair) => `${pair.id}: near duplicate of ${pair.other} (${pair.similarity.toFixed(3)})`),
    ...(provenance.cases === cases.length ? [] : ['provenance case count differs from the files']),
    ...(provenance.positive === positive ? [] : ['provenance positive count differs from the files']),
    ...(provenance.negative === cases.length - positive ? [] : ['provenance negative count differs from the files']),
    ...(archives === cases.length ? [] : ['provenance source archives do not account for every case']),
    ...(provenance.priorCorpusCases === prior.length
      ? []
      : ['provenance prior corpus size differs from the prior files']),
    ...(provenance.sourceRecordsSha256 === sourceRecordsDigest(cases) ? [] : ['source records digest mismatch']),
    ...(provenance.annotationsSha256 === annotationsDigest(rows) ? [] : ['annotations digest mismatch'])
  ]
}
