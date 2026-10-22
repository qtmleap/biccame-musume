import {
  type AuditMode,
  confirmationsFor,
  type DeskInputs,
  EXPECTED_BASELINE,
  gateOutcome,
  unmeasuredBreakdown
} from './d1-confirm-desk'
import type { PlanItem } from './d1-confirm-plan'
import {
  CHARACTER_CONFIRM_A_KEY,
  CHARACTER_CONFIRM_B_KEY,
  STORE_CONFIRM_KEY,
  yesProbability
} from './d1-confirm-requests'
import type { ItemResult } from './d1-confirm-run'
import {
  DISTRIBUTION_HEADER,
  distributionRow,
  meanOf,
  percent,
  rateText,
  renderTable,
  spreadOf
} from './d1-confirm-stats'
import { quantile, rate } from './d1-gold-score'

// 1項目ぶんの観測。保存した応答から「はい」の確率だけを取り出す。
export type Observation = {
  item: PlanItem
  store: number | null
  a: number | null
  b: number | null
  durationMs: number
  inputTokens: number | null
}

export const observe = (item: PlanItem, result: ItemResult): Observation => {
  const answers = result.response.answers
  return {
    item,
    store: item.storeTarget === null ? null : yesProbability(answers, STORE_CONFIRM_KEY),
    a: item.characterTarget === null ? null : yesProbability(answers, CHARACTER_CONFIRM_A_KEY),
    b: item.characterTarget === null ? null : yesProbability(answers, CHARACTER_CONFIRM_B_KEY),
    durationMs: result.durationMs,
    inputTokens: result.response.usage === undefined ? null : result.response.usage.input_tokens
  }
}

const numbers = (values: readonly (number | null)[]) => values.flatMap((value) => (value === null ? [] : [value]))

const distributionTable = (title: string, groups: readonly (readonly [string, readonly number[]])[]) =>
  [
    title,
    renderTable(
      DISTRIBUTION_HEADER,
      groups.map(([label, values]) => distributionRow(label, values))
    )
  ].join('\n')

export const storeSection = (observations: readonly Observation[]) => {
  const rows = observations.filter((o) => o.item.storeTarget !== null)
  const of = (kind: 'T' | 'D', test: (o: Observation) => boolean = () => true) =>
    numbers(rows.filter((o) => o.item.kind === kind && test(o)).map((o) => o.store))
  return distributionTable(
    '1. Store: P(yes) of store_confirm. T = correct store (recall = share passing), D = decoy store (false pass = share passing). Population: candidates whose saved store top is a concrete store.',
    [
      ['T all', of('T')],
      ['T target == extraction hint', of('T', (o) => o.item.storeEqualsHint === true)],
      ['T target != extraction hint', of('T', (o) => o.item.storeEqualsHint === false)],
      ['T target == choice top', of('T', (o) => o.item.storeIsChoiceTop === true)],
      ['D all', of('D')],
      ['D target == extraction hint', of('D', (o) => o.item.storeEqualsHint === true)],
      ['D target != extraction hint', of('D', (o) => o.item.storeEqualsHint === false)]
    ]
  )
}

export const characterSection = (observations: readonly Observation[]) => {
  const rows = observations.filter((o) => o.item.characterTarget !== null)
  const of = (kind: 'T' | 'D', basis: 'explicit' | 'assumed', field: 'a' | 'b') =>
    numbers(rows.filter((o) => o.item.kind === kind && o.item.characterBasis === basis).map((o) => o[field]))
  const groups = (['a', 'b'] as const).flatMap((field) =>
    (['explicit', 'assumed'] as const).flatMap((basis) =>
      (['T', 'D'] as const).map((kind): readonly [string, readonly number[]] => [
        `${field} / ${basis} / ${kind}`,
        of(kind, basis, field)
      ])
    )
  )
  const paired = (['explicit', 'assumed'] as const).map((basis) => {
    const diffs = rows
      .filter((o) => o.item.kind === 'T' && o.item.characterBasis === basis && o.a !== null && o.b !== null)
      .map((o) => (o.b === null || o.a === null ? 0 : o.b - o.a))
    return [
      `T / ${basis}`,
      String(diffs.length),
      percent(meanOf(diffs)),
      percent(quantile(diffs, 0.5)),
      String(diffs.filter((diff) => diff > 0.005).length),
      String(diffs.filter((diff) => diff < -0.005).length)
    ]
  })
  return [
    distributionTable(
      '2. Character: P(yes) of character_confirm_a (with the "do not assume" note) and _b (without). Population: candidates whose saved character top is a concrete character. explicit = D1 names the character (certain); assumed = same character as the D1 store (provisional).',
      groups
    ),
    '',
    'Paired difference b - a on T (percentage points; counts are |diff| > 0.5pt):',
    renderTable(['group', 'n', 'mean(b-a)', 'median(b-a)', 'b higher', 'a higher'], paired)
  ].join('\n')
}

// 現行の choice の最上位確率が 90% 以上だった割合と、2段階目の「はい」が 90% 以上の割合を、同じ候補で比べる。
export const comparisonSection = (observations: readonly Observation[]) => {
  const line = (
    label: string,
    rows: readonly Observation[],
    current: (o: Observation) => number,
    yes: (o: Observation) => number | null
  ) => {
    const yesValues = rows.flatMap((o) => {
      const value = yes(o)
      return value === null ? [] : [value]
    })
    const now = rows.map(current)
    return [
      label,
      String(rows.length),
      percent(quantile(now, 0.5)),
      rateText(rate(now.filter((value) => value >= 0.9).length, now.length)),
      percent(quantile(yesValues, 0.5)),
      rateText(rate(yesValues.filter((value) => value >= 0.9).length, yesValues.length))
    ]
  }
  const storeRows = observations.filter((o) => o.item.kind === 'T' && o.item.storeTarget !== null)
  const characterRows = observations.filter((o) => o.item.kind === 'T' && o.item.characterTarget !== null)
  return [
    '3. Current choice top probability vs stage-2 P(yes), same candidates (T items).',
    renderTable(
      ['group', 'n', 'choice top median', 'choice top >= 90%', 'yes median', 'yes >= 90%'],
      [
        line(
          'store (all)',
          storeRows,
          (o) => o.item.storeTopProbability,
          (o) => o.store
        ),
        line(
          'store (target == choice top)',
          storeRows.filter((o) => o.item.storeIsChoiceTop === true),
          (o) => o.item.storeTopProbability,
          (o) => o.store
        ),
        line(
          'character a (all)',
          characterRows,
          (o) => o.item.characterTopProbability,
          (o) => o.a
        ),
        line(
          'character a (target == choice top)',
          characterRows.filter((o) => o.item.characterIsChoiceTop === true),
          (o) => o.item.characterTopProbability,
          (o) => o.a
        ),
        line(
          'character b (target == choice top)',
          characterRows.filter((o) => o.item.characterIsChoiceTop === true),
          (o) => o.item.characterTopProbability,
          (o) => o.b
        )
      ]
    )
  ].join('\n')
}

const AUDITS: readonly { mode: AuditMode; label: string }[] = [
  { mode: 'none', label: 'no item-count audit gate' },
  { mode: 'saved-0.9', label: 'with item-count audit gate (saved threshold 0.9)' },
  { mode: 'alt-0.7', label: 'with item-count audit gate (0.7)' }
]

// 机上の入力にする確認の結果（候補ごと）。T の項目だけを使う。
const confirmationMap = (observations: readonly Observation[]) => {
  const byId = new Map(observations.map((o) => [o.item.itemId, o]))
  return confirmationsFor(
    observations.map((o) => o.item),
    (item, key) => {
      const found = byId.get(item.itemId)
      if (found === undefined) return null
      return key === STORE_CONFIRM_KEY ? found.store : key === CHARACTER_CONFIRM_A_KEY ? found.a : found.b
    },
    { store: STORE_CONFIRM_KEY, a: CHARACTER_CONFIRM_A_KEY, b: CHARACTER_CONFIRM_B_KEY }
  )
}

const cell = (outcome: ReturnType<typeof gateOutcome>) =>
  `${outcome.registered} reg / ${outcome.exact} exact / ${outcome.wrong} wrong (unmatched ${outcome.unmatched})`

export const deskSection = (desk: DeskInputs, observations: readonly Observation[]) => {
  const confirmations = confirmationMap(observations)
  const tables = AUDITS.flatMap(({ mode, label }) =>
    (['a', 'b'] as const).map((characterQuestion) => {
      const base = gateOutcome(desk.rows, confirmations, {
        threshold: 0,
        policy: 'pass',
        audit: mode,
        characterQuestion
      })
      const rows = [0.9, 0.8, 0.7].map((threshold) => [
        `X = ${Math.round(threshold * 100)}%`,
        cell(gateOutcome(desk.rows, confirmations, { threshold, policy: 'hold', audit: mode, characterQuestion })),
        cell(gateOutcome(desk.rows, confirmations, { threshold, policy: 'pass', audit: mode, characterQuestion }))
      ])
      return [
        `[${label}; character question ${characterQuestion}] no confirm gate: ${base.registered} registered, ${base.exact} exact`,
        renderTable(['gate', 'unmeasured = hold (lower bound)', 'unmeasured = pass (upper bound)'], rows)
      ].join('\n')
    })
  )
  return [
    `4. Desk: registrations if the store/character gate is "choice top AND confirm yes >= X". evaluateDetection is called from the working tree source on saved responses with the store/character tops pinned to 1.0. Candidates that fail the confirm gate are held. Unmeasured candidates (no D1 match, or the T target differs from the choice top) are shown as both bounds; do not read the hold column alone (it drops the unmatched registrations, which are known to be wrong).`,
    `Baseline (no confirm gate, no audit): ${desk.baseline.registered} registered / ${desk.baseline.exact} exact (expected ${EXPECTED_BASELINE.registered} / ${EXPECTED_BASELINE.exact}); registered without a D1 match: ${desk.baseline.unmatchedRegistered}`,
    ...tables
  ].join('\n\n')
}

export const deskUnmeasured = (desk: DeskInputs, observations: readonly Observation[]) =>
  unmeasuredBreakdown(desk.rows, confirmationMap(observations))

export type CostInputs = {
  // 保存した測定の、抽出が1件以上ある候補（文脈候補を除く）の数と、その総呼び出し数。
  realCandidates: number
  // うち、店舗か娘の最上位が具体的で、確認が要る候補の数。
  needingConfirm: number
  savedCalls: number
  judgeInputTokens: number[]
}

export const costSection = (observations: readonly Observation[], inputs: CostInputs) => {
  const spread = spreadOf(observations.map((o) => o.durationMs / 1000))
  const tokens = numbers(observations.map((o) => o.inputTokens))
  const seconds = (value: number | null) => (value === null ? '-' : `${value.toFixed(2)}s`)
  const tokenMedian = quantile(tokens, 0.5)
  const judgeMedian = quantile(inputs.judgeInputTokens, 0.5)
  const share = (count: number) =>
    `+${count} (${((count / inputs.savedCalls) * 100).toFixed(0)}% of the saved run's ${inputs.savedCalls} calls)`
  return [
    '5. Cost',
    '- Per candidate: judge 1 request (unchanged) + confirm 1 request (store and character questions share one request) = 2 requests; the confirm cannot start before the judge answers, so it adds serial latency.',
    `- Added requests for the saved run: ${share(inputs.needingConfirm)} if a candidate whose store and character tops are both special is not confirmed, ${share(inputs.realCandidates)} if every real candidate is.`,
    `- Input tokens per request: confirm median ${tokenMedian === null ? '-' : tokenMedian} (n=${tokens.length}) vs judge median ${judgeMedian === null ? '-' : judgeMedian} (n=${inputs.judgeInputTokens.length}).`,
    `- Confirm request duration this run (n=${spread.n}): median ${seconds(spread.median)}, q1 ${seconds(spread.q1)}, q3 ${seconds(spread.q3)}, max ${seconds(spread.max)}. The earlier judge run saw the model slow down to a median near 100s for about 30 minutes, so this speed should not be extrapolated.`
  ].join('\n')
}

// ひっかけ (D) のうち、「はい」が 70% 以上になったもの。どんな誤りが通るかを見るための一覧。
export const passedDecoySection = (observations: readonly Observation[]) => {
  const rows = observations.filter(
    (o) => o.item.kind === 'D' && ((o.store !== null && o.store >= 0.7) || (o.a !== null && o.a >= 0.7))
  )
  return [
    `Decoys (D) with P(yes) >= 70% on the store question or character question a (${rows.length} of ${observations.filter((o) => o.item.kind === 'D').length} D requests):`,
    renderTable(
      ['item', 'decoy store', 'store yes', 'decoy character', 'char a yes', 'extraction hint', 'D1 stores'],
      rows.map((o) => [
        o.item.itemId.slice(-22),
        o.item.storeTarget === null ? '-' : o.item.storeTarget,
        percent(o.store),
        o.item.characterTarget === null ? '-' : o.item.characterTarget,
        percent(o.a),
        o.item.extractionStore === null ? '-' : o.item.extractionStore,
        o.item.goldStores.join('+')
      ])
    )
  ].join('\n')
}
