import { countByKey, type GoldCase, groupByKey, sha256Hex } from './d1-gold-schema'

export const D1_GOLD_DEFAULT_SEED = 'd1-gold-v1'
export const D1_GOLD_DEFAULT_SIZE = 100

type Stratum = { key: string; population: number; selected: number }
type Row = { key: string; n: number; quota: number; count: number }

// 投稿の層は「投稿年(JST) × 主カテゴリ」。主カテゴリは投稿内で最も多いカテゴリ（同数なら辞書順の先頭）。
export const stratumOf = (sample: GoldCase) => {
  const counts = Object.entries(countByKey(sample.events, (event) => event.category))
  const primary = counts.sort(([a, x], [b, y]) => y - x || a.localeCompare(b))[0]
  return `${sample.postCreatedAtJst.slice(0, 4)}|${primary[0]}`
}

// 比例配分（最大剰余法）。どの層にも最低 1 件を割り当て、合計をちょうど size に揃える。
export const allocateStrata = (populations: ReadonlyMap<string, number>, size: number) => {
  const entries = [...populations].sort(([a], [b]) => a.localeCompare(b))
  const total = entries.reduce((sum, [, n]) => sum + n, 0)
  if (!Number.isInteger(size) || size < entries.length || size > total) throw new Error('Invalid cohort size')
  const initial: Row[] = entries.map(([key, n]) => {
    const quota = (size * n) / total
    return { key, n, quota, count: Math.min(n, Math.max(1, Math.floor(quota))) }
  })
  const sumOf = (rows: Row[]) => rows.reduce((sum, row) => sum + row.count, 0)
  const settle = (rows: Row[]): Row[] => {
    const diff = size - sumOf(rows)
    if (diff === 0) return rows
    const target =
      diff > 0
        ? rows
            .filter((row) => row.count < row.n)
            .sort((a, b) => b.quota - b.count - (a.quota - a.count) || a.key.localeCompare(b.key))[0]
        : rows
            .filter((row) => row.count > 1)
            .sort((a, b) => b.count - b.quota - (a.count - a.quota) || a.key.localeCompare(b.key))[0]
    if (target === undefined) throw new Error('Cannot settle the cohort allocation')
    const step = diff > 0 ? 1 : -1
    return settle(rows.map((row) => (row.key === target.key ? { ...row, count: row.count + step } : row)))
  }
  return new Map(settle(initial).map((row) => [row.key, row.count]))
}

// D1 に明示されたビッカメ娘を持つイベントがある投稿。娘の正解を測れるのはこの投稿だけなので、全件を必ず含める。
export const hasExplicitCharacter = (sample: GoldCase) => sample.events.some((event) => event.characterIds.length > 0)

// 固定seedのハッシュ順で各層から取り、実行順も全体のハッシュ順にする（途中で打ち切っても無作為な部分集合になる）。
// 明示された娘を持つ投稿は専用の枠として全件を入れ、残りの枠を「投稿年(JST) × 主カテゴリ」の層へ比例配分する。
export const selectGoldCohort = (cases: readonly GoldCase[], size: number, seed: string) => {
  const rank = (sample: GoldCase) => sha256Hex(`${seed}\n${sample.caseId}`)
  const byRank = (a: GoldCase, b: GoldCase) => rank(a).localeCompare(rank(b))
  const forced = cases.filter(hasExplicitCharacter)
  const regular = cases.filter((sample) => !hasExplicitCharacter(sample))
  if (forced.length >= size) throw new Error('Invalid cohort size')
  const groups = groupByKey(regular, stratumOf)
  const allocation = allocateStrata(new Map([...groups].map(([key, rows]) => [key, rows.length])), size - forced.length)
  const quotaOf = (key: string) => {
    const quota = allocation.get(key)
    if (quota === undefined) throw new Error('Missing stratum allocation')
    return quota
  }
  const sampled = [...groups].flatMap(([key, rows]) => [...rows].sort(byRank).slice(0, quotaOf(key)))
  const ordered = [...forced, ...sampled].sort(byRank)
  const strata: Stratum[] = [...groups]
    .map(([key, rows]) => ({ key, population: rows.length, selected: quotaOf(key) }))
    .sort((a, b) => a.key.localeCompare(b.key))
  const caseIds = ordered.map((sample) => sample.caseId)
  return {
    cases: ordered,
    selection: {
      seed,
      size,
      population: cases.length,
      method:
        'forced-explicit-character-posts-plus-stratified-by-post-year-jst-and-primary-category-proportional-min-1-hash-ordered',
      forced: {
        population: forced.length,
        selected: forced.length,
        events: forced.reduce((n, c) => n + c.events.length, 0)
      },
      forcedCaseIds: forced.map((sample) => sample.caseId).sort(),
      strata,
      caseIds,
      postIds: ordered.map((sample) => sample.postId),
      caseIdsSha256: sha256Hex(JSON.stringify(caseIds)),
      events: ordered.reduce((sum, sample) => sum + sample.events.length, 0)
    }
  }
}
export type GoldSelection = ReturnType<typeof selectGoldCohort>['selection']
