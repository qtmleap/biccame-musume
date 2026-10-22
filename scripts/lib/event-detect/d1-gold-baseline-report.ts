import { z } from 'zod'
import type { Rate, scoreRecords } from './d1-gold-score'
import type { SettingMetrics } from './d1-gold-settings'
import { SPLIT_NAMES, type SplitName } from './d1-gold-split'

const RateSchema = z.object({ n: z.number(), d: z.number(), rate: z.number().nullable() })
// 終了日を announce-time（R1）で比べた数字。古い report.json には無いので、あるときだけ読む。
const AnnounceTimeSchema = z.object({ exact: z.number(), precision: RateSchema, exactRegistrationRate: RateSchema })
// 採点結果(settings.json)のうち、横断の表に使う項目だけ。
export const SplitSummarySchema = z.object({
  name: z.enum(SPLIT_NAMES),
  label: z.string().nonempty(),
  sample: z.object({
    posts: z.number(),
    completedPosts: z.number(),
    goldEvents: z.number(),
    candidates: z.number(),
    errorPosts: z.number(),
    notAttemptedPosts: z.number()
  }),
  capture: RateSchema,
  settings: z.array(
    z.object({
      id: z.string().nonempty(),
      label: z.string().nonempty(),
      registered: z.number(),
      exact: z.number(),
      precision: RateSchema,
      exactRegistrationRate: RateSchema,
      announceTime: AnnounceTimeSchema.optional()
    })
  )
})
export type SplitSummary = z.infer<typeof SplitSummarySchema>

export const pct = (value: Rate | { n: number; d: number; rate: number | null }) =>
  `${value.n}/${value.d}${value.rate === null ? '' : ` (${(value.rate * 100).toFixed(1)}%)`}`

export const table = (header: readonly string[], rows: readonly (readonly string[])[]) =>
  [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`)
  ].join('\n')

export const counts = (value: Record<string, number>) =>
  Object.entries(value)
    .sort(([, a], [, b]) => b - a)
    .map(([key, n]) => `${key}=${n}`)
    .join(', ')

// 開発用・検証用・別枠を並べた横断の表。各分割の標本数と、開発用が開発に使った投稿であることを併記する。
export const formatSummary = (summaries: readonly SplitSummary[]) => {
  const order = (name: SplitName) => SPLIT_NAMES.indexOf(name)
  const sorted = [...summaries].sort((a, b) => order(a.name) - order(b.name))
  return [
    '# D1 gold baseline (frozen pipeline v5-webhook-v15-concise-author, current-source evaluateDetection)',
    '',
    '- 登録の精度 = 全項目一致の登録 / 登録に進んだ候補 (D1 に対応づかない登録は不正解)',
    '- 全項目一致の登録率 = 全項目一致の登録 / D1 の正解イベント',
    '- 終了日の見方: R1 (announce-time) が主指標。D1 の終了日は終了後に確定した値で開始時点の投稿からは取れないので、候補に終了日が無ければ一致とする。',
    '  strict は候補の終了日 = D1 の終了日 (終了日なし同士も一致) で、参考。',
    '- dev は規則を決めるのに使った開発用の投稿。数字は過学習している可能性があり、検証には使えない。test が検証用。',
    '',
    table(
      ['分割', '投稿', '完了', '未完', 'エラー記録のあった投稿', '未着手', '正解イベント', '候補', '候補にできた正解'],
      sorted.map((item) => [
        item.name,
        String(item.sample.posts),
        String(item.sample.completedPosts),
        String(item.sample.posts - item.sample.completedPosts),
        String(item.sample.errorPosts),
        String(item.sample.notAttemptedPosts),
        String(item.sample.goldEvents),
        String(item.sample.candidates),
        pct(item.capture)
      ])
    ),
    '',
    table(
      [
        '分割',
        '設定',
        '登録',
        '全項目一致 (R1)',
        '登録の精度 (R1)',
        '全項目一致の登録率 (R1)',
        '全項目一致 (strict)',
        '登録の精度 (strict)',
        '全項目一致の登録率 (strict)'
      ],
      sorted.flatMap((item) =>
        item.settings.map((setting) => {
          const r1 = setting.announceTime
          return [
            item.name,
            `(${setting.id}) ${setting.label}`,
            String(setting.registered),
            r1 === undefined ? '-' : String(r1.exact),
            r1 === undefined ? '-' : pct(r1.precision),
            r1 === undefined ? '-' : pct(r1.exactRegistrationRate),
            String(setting.exact),
            pct(setting.precision),
            pct(setting.exactRegistrationRate)
          ]
        })
      )
    )
  ].join('\n')
}

type Score = ReturnType<typeof scoreRecords>
export type Integrity = {
  frozenReplayParity: { checked: number; mismatched: number; ok: boolean }
  auditParity: { checked: number; mismatched: number }
  evaluatorDelta: {
    checked: number
    savedChanged: number
    topOneChanged: number
    savedTransitions: Record<string, number>
  }
  matchParity: { checked: number; mismatched: number }
  // 70% で最初の抽出が不一致になっていたはずの投稿（本番なら抽出をやり直す。再現していないので (d) は近似）。
  audit70ReextractNotSimulated: number
  sourceSha256: { detection: string; detectionConditions: string; eventDetectDirectory: string }
  calibration: { expected: { registered: number; exact: number }; actual: { registered: number; exact: number } } | null
}
export type SplitReport = {
  name: SplitName
  label: string
  runDirectory: string
  sample: {
    posts: number
    completedPosts: number
    incompletePosts: number
    errorPosts: number
    notAttemptedPosts: number
    goldEvents: number
    candidates: number
    realCandidates: number
    contextOnlyCandidates: number
    calls: number
    auditStatus: Record<string, number>
  }
  capture: Rate
  captureDetail: Score['capture']
  argmaxFields: Score['predicted']
  settings: SettingMetrics[]
  errors: Score['errors']
  integrity: Integrity
}

// 1つの分割の詳細。標本数を最初の表に置き、設定ごとの表はすべて同じ標本に対する数字であることを明記する。
export const formatSplitReport = (report: SplitReport) => {
  const { sample, settings, integrity } = report
  const registeredFields = settings.flatMap((setting) =>
    Object.keys(setting.registeredFieldMatch).map((name) => ({ setting, name }))
  )
  const fieldNames = [...new Set(registeredFields.map((item) => item.name))]
  return [
    `# ${report.name}: ${report.label}`,
    `run directory: ${report.runDirectory}`,
    '',
    table(
      ['投稿', '完了', '未完', 'エラー記録のあった投稿', '未着手', '正解イベント', '候補 (抽出/文脈のみ)', '呼び出し'],
      [
        [
          String(sample.posts),
          String(sample.completedPosts),
          String(sample.incompletePosts),
          String(sample.errorPosts),
          String(sample.notAttemptedPosts),
          String(sample.goldEvents),
          `${sample.candidates} (${sample.realCandidates}/${sample.contextOnlyCandidates})`,
          String(sample.calls)
        ]
      ]
    ),
    `件数監査(保存値): ${counts(sample.auditStatus)}; エラー: ${counts(report.errors.byKind)} (投稿 ${report.errors.postsWithErrors})`,
    '',
    '## 設定ごとの登録 (標本は上の表と同じ。未完の投稿の正解イベントも分母に残す)',
    '終了日の見方: R1 (announce-time) が主指標。strict (候補の終了日 = D1 の終了日) は参考。登録の可否・終了日以外の項目は同じ。',
    table(
      [
        '設定',
        '登録',
        '全項目一致 (R1)',
        '誤り(対応あり, R1)',
        '誤り(対応なし)',
        '登録の精度 (R1)',
        '全項目一致の登録率 (R1)',
        '全項目一致 (strict)',
        '登録の精度 (strict)',
        '全項目一致の登録率 (strict)',
        '登録のあった投稿'
      ],
      settings.map((setting) => [
        `(${setting.id}) ${setting.label}`,
        String(setting.registered),
        String(setting.announceTime.exact),
        String(setting.announceTime.wrongMatched),
        `${setting.wrongUnmatched} (文脈 ${setting.registeredContextOnly})`,
        pct(setting.announceTime.precision),
        pct(setting.announceTime.exactRegistrationRate),
        String(setting.exact),
        pct(setting.precision),
        pct(setting.exactRegistrationRate),
        pct(setting.postsWithRegister)
      ])
    ),
    `文脈候補を除く登録の精度 (R1 / strict): ${settings.map((setting) => `(${setting.id}) ${pct(setting.announceTime.precisionRealOnly)} / ${pct(setting.precisionRealOnly)}`).join(' ; ')}`,
    '',
    '## 登録された候補の項目別の一致 (D1 に対応づいた登録のみ。娘は D1 に明示があるものだけ。endDate は strict、endDateAnnounceTime は R1)',
    table(
      ['項目', ...settings.map((setting) => `(${setting.id})`)],
      fieldNames.map((name) => [name, ...settings.map((setting) => pct(setting.registeredFieldMatch[name]))])
    ),
    table(
      ['設定', '誤りの項目別 (対応あり, R1)', '誤りの項目別 (対応あり, strict)'],
      settings.map((setting) => [
        `(${setting.id})`,
        counts(setting.announceTime.wrongByField),
        counts(setting.wrongByField)
      ])
    ),
    '',
    '## 取りこぼし (正解イベントを候補にできた割合)',
    table(
      ['指標', '値'],
      [
        ['正解イベント全体 (未完の投稿も分母)', pct(report.captureDetail.allGoldEvents)],
        ['  取りこぼし', `${report.captureDetail.allGoldEvents.d - report.captureDetail.allGoldEvents.n}`],
        ['全正解を取り切った投稿', pct(report.captureDetail.postsWithAllGoldCaptured)],
        ['対応づけの根拠', counts(report.captureDetail.byBasis)],
        ['対応づかなかった候補', String(report.captureDetail.unmatchedCandidates)]
      ]
    ),
    '',
    `## 最上位予測 (しきい値なし、現行ソースの下書き) の項目別の一致 (対応づけた候補 ${report.argmaxFields.matchedCandidates} 件)`,
    table(
      ['項目', '対応づけた候補に対する一致', '正解イベント全体に対する一致'],
      Object.entries(report.argmaxFields.fields).map(([name, value]) => [
        name,
        pct(value.ofMatchedCandidates),
        pct(value.ofAllGoldEvents)
      ])
    ),
    `全項目一致 (娘は明示分のみ) R1: ${pct(report.argmaxFields.allMatchAnnounceTime)} / strict: ${pct(report.argmaxFields.allMatch)}; 項目別の不一致 (strict): ${counts(report.argmaxFields.missByField)}`,
    '',
    '## held の理由コード (延べ。件数監査で止めたものは distribution_item_count_*)',
    table(
      ['設定', 'held', '状態', '理由'],
      settings.map((setting) => [
        `(${setting.id})`,
        String(setting.held),
        counts(setting.statusCounts),
        counts(setting.heldReasons)
      ])
    ),
    table(
      ['設定', '先頭の理由'],
      settings.map((setting) => [`(${setting.id})`, counts(setting.heldFirstReason)])
    ),
    '',
    '## 整合',
    `- 凍結版で保存応答を再評価して保存した判定と一致: ${integrity.frozenReplayParity.checked - integrity.frozenReplayParity.mismatched}/${integrity.frozenReplayParity.checked}`,
    `- 現行ソースの件数監査を保存しきい値で再計算して保存値と一致: ${integrity.auditParity.checked - integrity.auditParity.mismatched}/${integrity.auditParity.checked}`,
    `- 現行ソースと凍結版で判定が変わった候補 (保存応答 / 最上位採用): ${integrity.evaluatorDelta.savedChanged} / ${integrity.evaluatorDelta.topOneChanged} (${integrity.evaluatorDelta.checked} 件中; 保存応答の変化 ${counts(integrity.evaluatorDelta.savedTransitions)})`,
    `- 下書きを現行ソースで作り直しても正解との対応づけが変わらない投稿: ${integrity.matchParity.checked - integrity.matchParity.mismatched}/${integrity.matchParity.checked}`,
    `- 件数監査 70% で最初の抽出が不一致になっていたはずの投稿 (本番なら抽出をやり直す。再現していないので (d) は近似): ${integrity.audit70ReextractNotSimulated}`,
    `- 評価ロジックの指紋: detection.ts ${integrity.sourceSha256.detection.slice(0, 12)}, detection-conditions.ts ${integrity.sourceSha256.detectionConditions.slice(0, 12)}, event-detect 全体 ${integrity.sourceSha256.eventDetectDirectory.slice(0, 12)}`,
    ...(integrity.calibration === null
      ? []
      : [
          `- 机上の基準 (開発用の最上位採用・件数監査なし・文脈候補を除く): 期待 登録 ${integrity.calibration.expected.registered} / 全項目一致 ${integrity.calibration.expected.exact}; 今回 ${integrity.calibration.actual.registered} / ${integrity.calibration.actual.exact}`
        ])
  ].join('\n')
}
