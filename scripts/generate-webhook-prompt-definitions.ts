import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { z } from 'zod'
import { createConfirmRequest } from '../packages/shared/src/event-detect/association-confirm'
import { ClefRequestSchema } from '../packages/shared/src/event-detect/clef'
import { createDetectionRequests, DETECTION_VERSION } from '../packages/shared/src/event-detect/detection'
import { createItemCountRequest, EXTRACTION_VERSION } from '../packages/shared/src/event-detect/extraction'
import { DetectPostSchema } from '../packages/shared/src/event-detect/post'
import { WebhookPromptDefinitionSchema } from '../packages/shared/src/schemas/webhook.dto'

// 旧版の原本を固定し、実行時のGit参照やDB内コードの実行を不要にする。
const revision = '61f22bcd'
const directory = path.resolve('.wrangler/production-sync/prompt-definition-generator')
const output = path.resolve('packages/shared/src/generated/webhook-prompt-definitions.json')
const sampleTexts = [
  '11/7から11/30まで名刺・アクキー・アクスタ・ギフトカードを税込4,000円以上お買い上げで先着100個配布。ふなたん、ふなとーたん、アキバたん。',
  '本日から名刺をどなたでも全員に配布します。',
  '明日から名刺を先着100名に配布します。',
  '11/7から名刺を抽選で配布します。',
  '11/7から税込4,000円以上購入で名刺を抽選で配布します。',
  '11/7から税込4,000円以上購入で名刺を配布します。',
  '有楽町たん記念デザインギフトカードを11/7から入金金額1,000円以上で数量限定販売します。',
  '11/7から1,000円以上チャージで先着100枚の記念ギフトカードを提供します。',
  '11/7から1,000円以上入金で記念ギフトカードの抽選に参加できます。',
  '11/7から4,000円以上購入と1,000円以上チャージで記念ギフトカードを提供します。',
  '11/7から4,000円以上購入と1,000円以上チャージで先着100枚を提供します。',
  '11/7から4,000円以上購入と1,000円以上チャージで抽選に参加できます。'
]
const posts = sampleTexts.map((text) => {
  const result = DetectPostSchema.safeParse({
    id: '1000000000000000000',
    screenName: 'unknown',
    kind: 'original',
    url: 'https://x.com/unknown/status/1000000000000000000',
    text,
    createdAt: '2026-10-20T03:00:00Z',
    media: []
  })
  if (!result.success) throw new Error('Invalid prompt definition fixture')
  return result.data
})
const requestGroupsSchema = z.object({
  detection: z.array(ClefRequestSchema),
  extraction: z.array(ClefRequestSchema)
})
const gitText = (file: string) =>
  execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const gitPath = (base: string) => {
  const candidates = [base, `${base}.ts`, `${base}.json`, `${base}/index.ts`]
  const found = candidates.find((candidate) => {
    try {
      gitText(candidate)
      return true
    } catch {
      return false
    }
  })
  if (found === undefined) throw new Error(`Missing historical prompt dependency: ${base}`)
  return found
}
await mkdir(directory, { recursive: true })
const bundle = path.join(directory, 'legacy.mjs')
await build({
  stdin: {
    contents: `import {createDetectionRequest} from 'legacy:packages/shared/src/event-detect/detection.ts';
import {createItemCountRequest} from 'legacy:packages/shared/src/event-detect/extraction.ts';
const posts=${JSON.stringify(posts)};
console.log(JSON.stringify({detection:posts.map(post=>createDetectionRequest(post)),extraction:posts.map(post=>createItemCountRequest(post))}));`,
    resolveDir: process.cwd(),
    sourcefile: 'historical-prompts.ts'
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: bundle,
  plugins: [
    {
      name: 'frozen-prompt-source',
      setup(builder) {
        builder.onResolve({ filter: /^legacy:/ }, (args) => ({ path: args.path.slice(7), namespace: 'frozen' }))
        builder.onResolve({ filter: /^\.|^@biccame\/shared\//, namespace: 'frozen' }, (args) => {
          const base = args.path.startsWith('@biccame/shared/')
            ? `packages/shared/src/${args.path.slice('@biccame/shared/'.length)}`
            : path.posix.normalize(path.posix.join(path.posix.dirname(args.importer), args.path))
          return { path: gitPath(base), namespace: 'frozen' }
        })
        builder.onResolve({ filter: /^(zod|dayjs)(\/|$)/, namespace: 'frozen' }, (args) => ({
          path: args.path,
          external: true
        }))
        builder.onLoad({ filter: /.*/, namespace: 'frozen' }, (args) => ({
          contents: gitText(args.path),
          loader: args.path.endsWith('.json') ? 'json' : 'ts'
        }))
      }
    }
  ]
})
const legacy = requestGroupsSchema.safeParse(
  JSON.parse(execFileSync('bun', ['--no-env-file', bundle], { encoding: 'utf8' }))
)
if (!legacy.success) throw new Error('Invalid historical prompt definitions')
// 投稿ごとに選択肢が変わる質問。定義には固定値ではなくプレースホルダを載せる。
// store は v2 だけが投稿ごとに候補を絞る。v13 以降は 44 店舗を固定の選択肢で持つため、版ごとに指定を分ける。
const LEGACY_DYNAMIC_KEYS = ['store', 'start_date', 'end_date', 'quantity', 'purchase_amount', 'charge_amount']
const CURRENT_DYNAMIC_KEYS = LEGACY_DYNAMIC_KEYS.filter((key) => key !== 'store')
// v19 から配布物（category）の選択肢も投稿ごとに変わる（質問文は v18 のまま）。gift_card を出す投稿は other の説明がギフトカードを外した版になり、同じ other でも説明が2通りになるため、
// 固定の選択肢では保存時の検査（webhook-prompt.ts）がどちらかを不一致にしてしまう。v18 までの定義は固定のまま（保存済みで、ここでは作り直さない）。
const GIFT_CARD_DYNAMIC_KEYS = [...CURRENT_DYNAMIC_KEYS, 'category']
const CATEGORY_DYNAMIC_LABEL =
  '投稿本文の根拠語と、抽出された物品の名前から生成（固定値ではありません）。名刺・アクキー・アクスタは本文に根拠語があるときだけ、gift_card は物品名にギフトカードを含むときだけ選択肢に出ます。gift_card が出るとき、other の説明はギフトカードを外した版になります。other と none は常に出ます'
const LEGACY_DYNAMIC_CRITERIA =
  'これは版ごとの質問定義です。日付・数量・金額・店舗候補・本文の根拠語による質問の有無や選択肢は、投稿ごとに生成されます。全候補を示した定義であり、過去に実送信した入力を記録したものではありません。'
const CURRENT_DYNAMIC_CRITERIA =
  'これは版ごとの質問定義です。日付・数量・金額・本文の根拠語による質問の有無や選択肢は、投稿ごとに生成されます。開催・配布店舗（store）と対象ビッカメ娘（character）の選択肢は版ごとに固定で、全投稿で同じです。全候補を示した定義であり、過去に実送信した入力を記録したものではありません。'
// state の「投稿者」の行に入る店舗名のひな形。判定の入力（DETECTION_VERSION）は v15 から短い名前で、
// 他の版と配布物の抽出は従来の「店舗名（店舗ID）」のまま。過去の版の定義は保存済みのものを変えない。
// 版を上げたときは、前の版（v15・v16 を含む）の定義をここで作り直さず、保存済みの定義を残す。現行のソースは前の版の質問を作れないため。
const FULL_AUTHOR_PLACEHOLDER = '{{その版の店舗辞書で解決した投稿者}}'
const SHORT_AUTHOR_PLACEHOLDER =
  '{{投稿者の店舗の短い名前（店舗の選択肢の説明と同じ。社名の接頭辞や括弧書きの店舗IDは付けない）。店舗アカウントが複数なら「・」で連結、店舗アカウントでなければ「店舗以外」}}'
type DefinitionOptions = {
  dynamicKeys?: readonly string[]
  dynamicCriteria?: string
  stateTemplateExtra?: string
  // 質問ごとの dynamic のプレースホルダの文言。指定が無い質問は共通の文言。
  dynamicLabels?: Readonly<Record<string, string>>
}
const definitionOf = (
  questionVersion: string,
  origin: string,
  requests: z.infer<typeof ClefRequestSchema>[],
  {
    dynamicKeys = LEGACY_DYNAMIC_KEYS,
    dynamicCriteria = LEGACY_DYNAMIC_CRITERIA,
    stateTemplateExtra = '',
    dynamicLabels = {}
  }: DefinitionOptions = {}
) => {
  const keys = [...new Set(requests.flatMap((request) => Object.keys(request.questions)))]
  const questions = keys.map((key) => {
    const variants = requests.flatMap((request) => {
      const question = request.questions[key]
      return question === undefined ? [] : [question]
    })
    const first = variants[0]
    if (first === undefined) throw new Error('Missing prompt question')
    const dynamic = dynamicKeys.includes(key)
    const label = dynamicLabels[key]
    const criteria = dynamic
      ? { dynamic: label === undefined ? '投稿本文・投稿日・当時の店舗候補から生成（固定値ではありません）' : label }
      : Object.fromEntries(
          variants.flatMap((question) =>
            question.type === 'choice'
              ? Object.entries(question.criteria)
              : question.type === 'score'
                ? question.criteria.map((value, index) => [String(index), value])
                : []
          )
        )
    return { key, type: first.type, instructions: first.instructions, criteria }
  })
  const parsed = WebhookPromptDefinitionSchema.safeParse({
    questionVersion,
    origin,
    stateTemplate:
      `投稿日: {{投稿日を日本時間で表示}}（{{曜日}}）\n投稿者: @{{screenName}} / ${questionVersion === DETECTION_VERSION ? SHORT_AUTHOR_PLACEHOLDER : FULL_AUTHOR_PLACEHOLDER}\n画像: {{画像数}} 枚（画像の内容は含まれない）\n本文:\n{{保存された投稿本文}}\n{{引用元があれば引用アカウントと本文}}` +
      (origin.startsWith('git:') ? '' : '\n{{抽出文脈がある場合: 今回の対象物・対象根拠・参考原投稿/引用。別物品だけの日時/条件/数量は流用しない}}') +
      (questionVersion === DETECTION_VERSION
        ? '\n{{物品未抽出の確認候補は企画の存在も不在も前提にしない。参考原文だけで関連性を判断する}}\n{{抽出段階の開催店舗候補（未確定）がある場合のみ: 「抽出段階の開催店舗候補（未確定）: <店舗キー>」の1行。店舗の質問はこの店舗でこの企画が実施されるかを判定する}}'
        : '') +
      stateTemplateExtra,
    questions,
    dynamicCriteria
  })
  if (!parsed.success) throw new Error('Invalid prompt definition')
  return parsed.data
}
// v16 から続く2段目（v17 の質問は v16 と同一。v18 は店舗の確認の質問だけが v17 と違う。v19 は2段目の質問を変えていない）。確認の質問と state の末尾の行は、1段目で最上位に選んだ店舗・娘が具体的なときだけ、別の呼び出しで送る。
// 注: 下の CONFIRM_STATE_TEMPLATE / CONFIRM_DYNAMIC_CRITERIA の説明は、保存済みの版定義（変えると例外になる）に入っており、現行の挙動とは 2 点違う。
//   1. 説明は「店舗の娘には娘の確認を聞かない」だが、現行は店舗の娘にも娘の確認を聞く（二回チェック）。
//   2. 説明は「具体的なら必ず聞く」だが、現行は最上位の確率が下限（既定 70%）以上なら確認を聞かない。
//   版を上げるまで直せない。管理画面のプロンプト表示には、版を上げるまで古い説明が出る（v18 は質問文だけ、v19 は category の選択肢だけを直した版なので、この説明は v17 までと同じ）。
// 定義には確認の質問を載せるため、店舗と別の娘の両方を対象にした確認の request を 1 つ足す。
const CONFIRM_STATE_TEMPLATE =
  '\n{{2段目（確認）の呼び出しだけ: 上の入力の末尾に「確認対象の開催店舗: <1段目で最上位に選んだ店舗の短い名前>」「確認対象のビッカメ娘: <1段目で最上位に選んだ娘の名前>」の行を足す。最上位が具体的な店舗のときだけ店舗の行と質問が作られ、最上位が具体的な娘で、かつ店舗の娘（最上位の店舗と同じ ID）ではないときだけ娘の行と質問が作られる}}'
const CONFIRM_DYNAMIC_CRITERIA = `${CURRENT_DYNAMIC_CRITERIA}確認の質問（store_confirm・character_confirm）は、1段目で最上位に選んだ開催店舗・対象ビッカメ娘が具体的なときだけ、別の呼び出しで送られます（はい/いいえの質問で、選択肢はありません）。ただし最上位の娘が最上位の店舗の娘（同じ ID）のときは、特に指定がなければ店舗の娘とみなして、character_confirm は送られません。`
// v19 の配布物（category）の質問。質問文は v18 から変えておらずどの投稿でも同じで、選択肢だけが投稿ごとに変わる。
const CATEGORY_DYNAMIC_CRITERIA =
  '配布物（category）の選択肢は投稿ごとに決まります（根拠語がある名刺・アクキー・アクスタだけ、抽出された物品の名前にギフトカードを含むときだけ gift_card）。質問文は全投稿で同じです。'
const confirmRequests = posts.map((post) =>
  createConfirmRequest(createDetectionRequests(post)[0], { store: 'akiba', character: 'funato' })
)
const generated = [
  definitionOf('v2-webhook-v4', `git:${revision}`, legacy.data.detection),
  definitionOf('giveaways-v2', `git:${revision}`, legacy.data.extraction),
  definitionOf(
    DETECTION_VERSION,
    'versioned-source',
    [...posts.flatMap((post) => createDetectionRequests(post)), ...confirmRequests],
    {
      dynamicKeys: GIFT_CARD_DYNAMIC_KEYS,
      dynamicCriteria: `${CONFIRM_DYNAMIC_CRITERIA}${CATEGORY_DYNAMIC_CRITERIA}`,
      stateTemplateExtra: CONFIRM_STATE_TEMPLATE,
      dynamicLabels: { category: CATEGORY_DYNAMIC_LABEL }
    }
  ),
  definitionOf(EXTRACTION_VERSION, 'versioned-source', posts.map((post) => createItemCountRequest(post)))
]
const previous = z.array(WebhookPromptDefinitionSchema).safeParse(existsSync(output) ? JSON.parse(await readFile(output, 'utf8')) : [])
if (!previous.success) throw new Error('Invalid previous prompt definitions')
for (const definition of generated) {
  const saved = previous.data.find((entry) => entry.questionVersion === definition.questionVersion)
  if (saved !== undefined && JSON.stringify(saved) !== JSON.stringify(definition))
    throw new Error(`Prompt definition changed without a version change: ${definition.questionVersion}`)
}
// 保存済みの版は並びを変えずにその位置へ残し（上のチェックで内容は一致している）、まだ無い版だけを末尾へ足す。
// 版を上げても、過去の版の定義が並び替えで差分に出ないようにする。
const definitions = [
  ...previous.data,
  ...generated.filter((definition) => !previous.data.some((entry) => entry.questionVersion === definition.questionVersion))
]
await writeFile(output, `${JSON.stringify(definitions, null, 2)}\n`)
const migration = process.argv[2]
if (migration !== undefined) {
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
  const schema = await readFile(migration, 'utf8')
  if (schema.includes('-- 版定義の初期登録')) throw new Error('Do not rewrite an already seeded migration')
  const seeds = definitions.map(
    (definition) =>
      `INSERT INTO "webhook_prompt_versions" ("version", "definition_json") VALUES (${quote(definition.questionVersion)}, ${quote(JSON.stringify(definition))});`
  )
  await writeFile(migration, `${schema}\n-- 版定義の初期登録（固定原本から生成、過去の送信記録ではない）\n${seeds.join('\n')}\n`)
}
console.log(`Generated ${definitions.length} immutable prompt definitions`)
