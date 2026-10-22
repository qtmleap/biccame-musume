import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  type GoldCase,
  GoldCaseSchema,
  GoldFileSchema,
  goldBundleOf,
  groupByKey,
  loadGoldCases,
  sha256Hex
} from './d1-gold-schema'

// 開発用（規則を決めるのに使った投稿）・検証用（まだ AI に通していない投稿）・別枠（主指標に混ぜない投稿）の分割を固定する。
export const D1_GOLD_SPLIT_SEED = 'd1-gold-split-test-v1'
export const SPLIT_NAMES = ['dev', 'test', 'extra-post-after-start'] as const
export type SplitName = (typeof SPLIT_NAMES)[number]
export const SplitNameSchema = z.enum(SPLIT_NAMES)

// 別枠の元になる、cases.json の sidelined のバケット名。
export const EXTRA_BUCKETS: Readonly<Record<'extra-post-after-start', string>> = {
  'extra-post-after-start': 'post_after_start'
}

const GroupSchema = z.object({
  caseIds: z.array(z.string().nonempty()).nonempty(),
  postIds: z.array(z.string().nonempty()).nonempty(),
  posts: z.number().int().positive(),
  events: z.number().int().positive(),
  caseIdsSha256: z.string().nonempty()
})
export type SplitGroup = z.infer<typeof GroupSchema>

const SplitBodySchema = z.object({
  schemaVersion: z.literal(1),
  casesSha256: z.string().nonempty(),
  // 開発用は前回の測定が選んだ投稿そのもの。選択の指紋を残す。
  devSelectionSha256: z.string().nonempty(),
  testSeed: z.string().nonempty(),
  dev: GroupSchema,
  test: GroupSchema,
  extra: z.object({ 'extra-post-after-start': GroupSchema })
})
export const SplitFileSchema = SplitBodySchema.extend({ splitSha256: z.string().nonempty() })
export type SplitBody = z.infer<typeof SplitBodySchema>
export type SplitFile = z.infer<typeof SplitFileSchema>

const idsHash = (caseIds: readonly string[]) => sha256Hex(JSON.stringify(caseIds))

const groupOf = (cases: readonly GoldCase[]): SplitGroup => ({
  caseIds: cases.map((sample) => sample.caseId),
  postIds: cases.map((sample) => sample.postId),
  posts: cases.length,
  events: cases.reduce((sum, sample) => sum + sample.events.length, 0),
  caseIdsSha256: idsHash(cases.map((sample) => sample.caseId))
})

const duplicates = (values: readonly string[]) =>
  [...groupByKey(values, (value) => value)].filter(([, rows]) => rows.length > 1).map(([key]) => key)

export type BuildSplitInput = {
  main: readonly GoldCase[]
  extra: readonly GoldCase[]
  devCaseIds: readonly string[]
  devSelectionSha256: string
  casesSha256: string
  seed?: string
}

// 開発用 = 前回選んだ投稿、検証用 = main の残り。互いに重ならず、別枠は main と投稿も重ならないことを確かめる。
export const buildSplit = (input: BuildSplitInput): SplitFile => {
  const seed = input.seed === undefined ? D1_GOLD_SPLIT_SEED : input.seed
  const byId = new Map(input.main.map((sample) => [sample.caseId, sample]))
  if (duplicates(input.devCaseIds).length > 0) throw new Error('Duplicated case in the dev selection')
  const dev = input.devCaseIds.map((id) => {
    const sample = byId.get(id)
    if (sample === undefined) throw new Error('Dev case is missing from the main cases')
    return sample
  })
  const devIds = new Set(input.devCaseIds)
  const rank = (sample: GoldCase) => sha256Hex(`${seed}\n${sample.caseId}`)
  // 途中で打ち切っても無作為な部分集合になるよう、検証用はハッシュ順に並べる。
  const test = input.main.filter((sample) => !devIds.has(sample.caseId)).sort((a, b) => rank(a).localeCompare(rank(b)))
  const mainPostIds = new Set(input.main.map((sample) => sample.postId))
  if (input.extra.some((sample) => byId.has(sample.caseId) || mainPostIds.has(sample.postId)))
    throw new Error('An extra post overlaps the main cases')
  if (duplicates(input.extra.map((sample) => sample.caseId)).length > 0) throw new Error('Duplicated extra case')
  const body: SplitBody = {
    schemaVersion: 1,
    casesSha256: input.casesSha256,
    devSelectionSha256: input.devSelectionSha256,
    testSeed: seed,
    dev: groupOf(dev),
    test: groupOf(test),
    extra: { 'extra-post-after-start': groupOf(input.extra) }
  }
  if (dev.length + test.length !== input.main.length) throw new Error('Dev and test do not cover the main cases')
  return { ...body, splitSha256: sha256Hex(JSON.stringify(body)) }
}

// 保存した分割が、改ざんされていないことと、手元の cases.json と同じ入力から作られたことを確かめて読む。
export const loadSplit = async (path: string, casesSha256: string): Promise<SplitFile> => {
  const parsed = SplitFileSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
  if (!parsed.success) throw new Error('Invalid split file')
  const { splitSha256, ...body } = parsed.data
  if (sha256Hex(JSON.stringify(body)) !== splitSha256) throw new Error('Split file hash mismatch')
  if (body.casesSha256 !== casesSha256) throw new Error('cases.json changed since the split was saved')
  const groups = [body.dev, body.test, body.extra['extra-post-after-start']]
  if (groups.some((group) => idsHash(group.caseIds) !== group.caseIdsSha256))
    throw new Error('Split group hash mismatch')
  const all = groups.flatMap((group) => group.caseIds)
  if (duplicates(all).length > 0) throw new Error('A case belongs to more than one split group')
  return parsed.data
}

// cases.json の sidelined のバケットを、main と同じ形式として読む。1件でも読めなければ止める。
export const loadSidelinedCases = async (path: string, bucket: string): Promise<GoldCase[]> => {
  const file = GoldFileSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
  if (!file.success) throw new Error('Invalid D1 gold case file')
  const rows = file.data.sidelined[bucket]
  if (rows === undefined) throw new Error('Unknown sidelined bucket')
  const parsed = z.array(GoldCaseSchema).safeParse(rows)
  if (!parsed.success) throw new Error('Invalid sidelined case')
  return parsed.data
}

// 指定した分割の投稿を、保存した順序のまま返す。複数の名前を指定したときは、その順に連結する。
export const resolveSplitCases = (split: SplitFile, names: readonly SplitName[], pool: readonly GoldCase[]) => {
  const byId = new Map(pool.map((sample) => [sample.caseId, sample]))
  const groupOfName = (name: SplitName) => (name === 'extra-post-after-start' ? split.extra[name] : split[name])
  if (duplicates(names).length > 0) throw new Error('Duplicated split name')
  return names.flatMap((name) =>
    groupOfName(name).caseIds.map((id) => {
      const sample = byId.get(id)
      if (sample === undefined) throw new Error('A split case is missing from the case pool')
      return sample
    })
  )
}

export const parseSplitNames = (value: string) => {
  const parsed = z.array(SplitNameSchema).nonempty().safeParse(value.split(','))
  if (!parsed.success) throw new Error(`Invalid --split (use ${SPLIT_NAMES.join(', ')} separated by commas)`)
  return parsed.data
}

// 追加の別枠: D1 のイベントの start 参照が指す投稿。採点側が SPLIT_NAMES を巡回するため、SPLIT_NAMES には入れない。
export const EXTRA_START_POST = 'extra-start-post'
const ALSO_IN_CASES_FLAG = 'also-in-cases-json'
export type StartPostOwner = 'dev' | 'test' | 'extra-post-after-start'
export type ExcludedStartPost = { postId: string; caseId: string; group: StartPostOwner }

// 既存の測定（開発用・検証用・別枠）に入っている投稿を、投稿 ID で除く。caseId は別形式なので比べない。
export const planExtraStartPost = (split: SplitFile, extra: readonly GoldCase[]) => {
  const groups: readonly (readonly [StartPostOwner, SplitGroup])[] = [
    ['dev', split.dev],
    ['test', split.test],
    ['extra-post-after-start', split.extra['extra-post-after-start']]
  ]
  const owner = new Map(
    groups.flatMap(([name, group]) => group.postIds.map((id): [string, StartPostOwner] => [id, name]))
  )
  const taken = new Set(groups.flatMap(([, group]) => group.caseIds))
  if (extra.some((sample) => taken.has(sample.caseId))) throw new Error('An extra start case reuses a split case id')
  if (duplicates(extra.map((sample) => sample.caseId)).length > 0) throw new Error('Duplicated extra start case')
  const excluded = extra.flatMap((sample): ExcludedStartPost[] => {
    const group = owner.get(sample.postId)
    return group === undefined ? [] : [{ postId: sample.postId, caseId: sample.caseId, group }]
  })
  // 入力ファイルの印と食い違うなら、除外が正しく働いていない。測定の前に止める。
  const flagged = extra.filter((sample) => sample.flags.includes(ALSO_IN_CASES_FLAG)).map((sample) => sample.postId)
  const excludedIds = new Set(excluded.map((item) => item.postId))
  if (flagged.length !== excludedIds.size || flagged.some((id) => !excludedIds.has(id)))
    throw new Error('Excluded start posts disagree with the also-in-cases-json flags')
  const cases = extra.filter((sample) => !owner.has(sample.postId))
  if (cases.length === 0) throw new Error('No extra start post is left to measure')
  const caseIds = cases.map((sample) => sample.caseId)
  return { cases, caseIds, caseIdsSha256: idsHash(caseIds), excluded }
}

export type LoadExtraStartInput = { splitPath: string; casesSha256: string; extraPath: string }
// 保存した分割（改ざんの検査つき）と追加の入力ファイルを読み、測定する投稿の計画を返す。
export const loadExtraStartPlan = async (input: LoadExtraStartInput) => {
  const split = await loadSplit(input.splitPath, input.casesSha256)
  const extra = await loadGoldCases(input.extraPath)
  const plan = planExtraStartPost(split, extra.cases)
  return {
    split: { splitSha256: split.splitSha256 },
    names: [EXTRA_START_POST],
    inputSha256: extra.sha256,
    ...plan
  }
}

export type ExtraStartPlan = Awaited<ReturnType<typeof loadExtraStartPlan>>

// 再開のとき、保存した選択が同じ入力・同じ投稿の並びから作られたことだけを確かめる（cases.json は引かない）。
export const assertSavedSelection = async (
  directory: string,
  expected: { inputSha256: string; caseIdsSha256: string }
) => {
  const parsed = z
    .object({ inputSha256: z.string().nonempty(), selection: z.object({ caseIdsSha256: z.string().nonempty() }) })
    .safeParse(JSON.parse(await readFile(join(directory, 'selection.json'), 'utf8')))
  if (!parsed.success) throw new Error('Invalid selection.json')
  if (parsed.data.inputSha256 !== expected.inputSha256)
    throw new Error('The extra start cases changed since the selection was saved')
  if (parsed.data.selection.caseIdsSha256 !== expected.caseIdsSha256)
    throw new Error('Saved selection differs from the planned cases')
}

const extraStartReadme = (callLimit: number, excludedPosts: number) =>
  [
    '# D1 gold measurement on the extra start posts: pipeline v5-webhook-v15-concise-author',
    '',
    "Started on the user's explicit instruction (add held-out Golden posts and measure them with the real AI).",
    'These are X posts that D1 events point to as their start post. None of them went through the AI before.',
    `${excludedPosts} posts of the input file are left out because an earlier measurement (dev, test or extra-post-after-start) already holds them.`,
    'This run only records the AI responses. Scoring and rule evaluation are done separately.',
    '',
    '- Ground truth: human-corrected D1 events (cases-extra-start-post.json). Model input is the public post fields only; gold stays in gold.json.',
    `- Call ledger: live-attempts.jsonl in this directory (appended before each send), limit ${callLimit}, concurrency <= 2, no automatic retry.`,
    '- Separate from every other ledger (run-v15-100, run-v15-test, confirm-v15, goal-pipeline): none of them is read or written.',
    '- Endpoints: local evaluation API only (decide / extract-evaluate). No D1, notification or production writes.'
  ].join('\n')

// 追加の別枠の出力先を整える。保存済みなら同じ計画かを確かめ、初回なら選択・正解・説明を書く（どれも既存を上書きしない）。
export const prepareExtraStartDirectory = async (directory: string, plan: ExtraStartPlan, callLimit: number) => {
  if (await Bun.file(join(directory, 'selection.json')).exists()) return await assertSavedSelection(directory, plan)
  const write = async (name: string, body: string) =>
    await writeFile(join(directory, name), body, { mode: 0o600, flag: 'wx' })
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
  await write(
    'selection.json',
    json({
      inputSha256: plan.inputSha256,
      selection: { caseIds: plan.caseIds, forcedCaseIds: [], caseIdsSha256: plan.caseIdsSha256 },
      split: { names: plan.names, splitSha256: plan.split.splitSha256, excluded: plan.excluded }
    })
  )
  await write('gold.json', json(goldBundleOf(plan.cases, plan.inputSha256)))
  await write('README.md', `${extraStartReadme(callLimit, plan.excluded.length)}\n`)
}
