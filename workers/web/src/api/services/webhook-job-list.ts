import type { Bindings } from '@api/types/bindings'
import { webhookKeywordVerdict } from '@biccame/shared/event-detect/detection'
import { type DetectPost, DetectPostSchema } from '@biccame/shared/event-detect/post'
import {
  DEFAULT_WEBHOOK_JOB_ORDER,
  DEFAULT_WEBHOOK_JOB_SORT,
  type WebhookJob,
  type WebhookJobQuerySchema,
  type WebhookJobRange,
  type WebhookJobSort,
  type WebhookPostStatusFilter
} from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import type { z } from 'zod'
import { aggregateWebhookDiscovery } from './webhook-discovery-aggregate'
import { webhookDiscoveryFilterClause } from './webhook-discovery-query'
import {
  JobColumns,
  JobTables,
  storedItemCountAudit,
  storedJson,
  toJob,
  webhookCandidatesByPostIds
} from './webhook-job-record'

/** 受信日時の窓（ms）。 */
const RANGE_WINDOW_MS = { '1h': 3_600_000, '24h': 86_400_000 } as const satisfies Record<WebhookJobRange, number>
/** 並べ替えキーの SQL。confidence の NULL（未判定）は最小値として扱う。 */
const SORT_KEY_SQL = {
  createdAt: (alias: string) => `${alias}.created_at`,
  confidence: (alias: string) => `COALESCE(${alias}.confidence,-1)`
} as const satisfies Record<WebhookJobSort, (alias: string) => string>
const ORDER_SQL = { asc: { direction: 'ASC', compare: '>' }, desc: { direction: 'DESC', compare: '<' } } as const

/**
 * 判定（キーワードルール）の絞り込みは SQL で書けないため、一定件数ずつ取りながら JS で走査する。
 * batch は 1 回に取る行数、maxBatches は 1 リクエストで走査する回数の上限（既定で最大 2000 行）。
 */
export type WebhookVerdictScan = { batch: number; maxBatches: number }
export const WEBHOOK_VERDICT_SCAN: WebhookVerdictScan = { batch: 200, maxBatches: 10 }

type ListQuery = z.infer<typeof WebhookJobQuerySchema>
/** listWebhookJobs の引数。並びを省略したら既定（受信日時の新しい順）にする。 */
export type ListWebhookJobsQuery = Omit<ListQuery, 'sort' | 'order'> & Partial<Pick<ListQuery, 'sort' | 'order'>>
type ListFilter = { where: string; values: (string | number)[] }

/**
 * 保存済みの回答（answers_json）の JSON パスを値に取る。壊れた JSON は json_extract がエラーにするので、
 * AND の短絡評価に頼らず、式ごとに json_valid で守る。NULL や不正な JSON、パスが無い行は NULL になる。
 */
const storedAnswerSql = (path: string) =>
  `CASE WHEN json_valid(j.answers_json) THEN json_extract(j.answers_json,'${path}') END`

/**
 * 一覧のステータス列（webhookPostStatusLabel）と同じ規則。
 * ignored は、ジョブの状態が ignored の行（画面では却下が最優先）。
 * それ以外は、ジョブが ignored ではなく、保存済みの回答で status が選択式（choice）かつ選ばれたのがその値の行。
 */
const postStatusFilter = (postStatus: WebhookPostStatusFilter): ListFilter =>
  postStatus === 'ignored'
    ? { where: "j.status='ignored'", values: [] }
    : {
        where: `(j.status<>'ignored' AND ${storedAnswerSql('$.status.type')}='choice' AND ${storedAnswerSql('$.status.choice')}=?)`,
        values: [postStatus]
      }

/**
 * 判定以外の条件（状態・期間・ステータス・並びの続き）を SQL の WHERE に組み立てる。
 * 続きの位置は投稿IDで受け取り、その行の並べ替えキーをサブクエリで引いて keyset 比較する。
 * 同じキーの行は投稿IDで同じ向きに順序付けるので、どの並べ替えの組でもページをまたいで重複・欠落しない。
 */
const listFilter = (query: ListQuery, cursor: string | undefined, now: number): ListFilter => {
  const { compare } = ORDER_SQL[query.order]
  const key = SORT_KEY_SQL[query.sort]('j')
  const cursorKey = `(SELECT ${SORT_KEY_SQL[query.sort]('c')} FROM webhook_event_jobs c WHERE c.post_id=?)`
  const clauses: ListFilter[] = [
    ...(query.status === undefined ? [] : [{ where: 'j.status=?', values: [query.status] }]),
    ...(query.discovery === undefined ? [] : [webhookDiscoveryFilterClause(query.discovery)]),
    ...(query.screenName === undefined
      ? []
      : [
          {
            where:
              "(CASE WHEN json_valid(j.post_json) THEN json_extract(j.post_json,'$.screenName') END) = ? COLLATE NOCASE",
            values: [query.screenName]
          }
        ]),
    ...(query.range === undefined ? [] : [{ where: 'j.created_at>=?', values: [now - RANGE_WINDOW_MS[query.range]] }]),
    ...(query.postStatus === undefined ? [] : [postStatusFilter(query.postStatus)]),
    ...(cursor === undefined
      ? []
      : [
          {
            where: `(${key} ${compare} ${cursorKey} OR (${key} = ${cursorKey} AND j.post_id ${compare} ?))`,
            values: [cursor, cursor, cursor]
          }
        ])
  ]
  return {
    where: clauses.length === 0 ? '' : `WHERE ${clauses.map((clause) => clause.where).join(' AND ')}`,
    values: clauses.flatMap((clause) => clause.values)
  }
}

const listOrderBy = (query: ListQuery): string => {
  const { direction } = ORDER_SQL[query.order]
  return `ORDER BY ${SORT_KEY_SQL[query.sort]('j')} ${direction}, j.post_id ${direction}`
}

/** 一覧の候補取得は1ページにつき1回にまとめ、親子の対応と候補順を維持する。 */
const listedJobs = async (env: Pick<Bindings, 'DB'>, rows: Record<string, unknown>[]): Promise<WebhookJob[]> => {
  const jobs = rows.map(toJob)
  const byPostId = await webhookCandidatesByPostIds(
    env,
    jobs.map((job) => job.postId)
  )
  return jobs.map((job, index) => {
    const candidates = byPostId.get(job.postId)
    if (candidates === undefined) throw new Error('Missing webhook candidate group')
    return {
      ...job,
      discovery: aggregateWebhookDiscovery(job.discovery, candidates),
      candidates,
      itemCountAudit: storedItemCountAudit(rows[index]?.extractionJson)
    }
  })
}

/** 保存済みの投稿を読み取る。壊れた行は判定できないので null（どの判定にも一致させない）。 */
const storedPost = (value: string): DetectPost | null => {
  try {
    const post = DetectPostSchema.safeParse(storedJson(value))
    return post.success ? post.data : null
  } catch {
    return null
  }
}

type VerdictScanResult = { postIds: string[]; nextCursor: string | null }

/**
 * 判定が一致する投稿IDを、並びの順に limit 件（+続きの有無）集める。再帰で batch ずつ走査する。
 * - limit+1 件集まったら、返す最後の行（limit 件目）を nextCursor にする。1 件余分に見つけたのは続きがある印で、返さない。
 * - 走査の上限に達して先が残っていそうなら、集まった分（0 件もある）を返し、最後に走査した行を nextCursor にする。
 * - 行を使い切ったら nextCursor は null。
 */
const scanByVerdict = async (
  env: Pick<Bindings, 'DB'>,
  query: ListQuery & { verdict: NonNullable<ListQuery['verdict']> },
  now: number,
  scan: WebhookVerdictScan,
  cursor: string | undefined,
  scanned: number,
  collected: readonly string[]
): Promise<VerdictScanResult> => {
  const filter = listFilter(query, cursor, now)
  const rows = await env.DB.prepare(
    `SELECT j.post_id AS postId, j.post_json AS postJson FROM webhook_event_jobs j ${filter.where} ${listOrderBy(query)} LIMIT ?`
  )
    .bind(...filter.values, scan.batch)
    .all<{ postId: string; postJson: string }>()
  const matched = [
    ...collected,
    ...rows.results
      .filter((row) => {
        const post = storedPost(row.postJson)
        return post !== null && webhookKeywordVerdict(post) === query.verdict
      })
      .map((row) => row.postId)
  ]
  const returned = matched.slice(0, query.limit)
  const lastReturned = returned.at(-1)
  if (matched.length > query.limit && lastReturned !== undefined) {
    return { postIds: returned, nextCursor: lastReturned }
  }
  const lastScanned = rows.results.at(-1)
  // 取得件数が batch に満たなければ、もう行が無い。
  if (rows.results.length < scan.batch || lastScanned === undefined) return { postIds: matched, nextCursor: null }
  if (scanned + 1 >= scan.maxBatches) return { postIds: matched, nextCursor: lastScanned.postId }
  return scanByVerdict(env, query, now, scan, lastScanned.postId, scanned + 1, matched)
}

/** 走査で見つかった投稿IDの行を、見つかった順のまま本体の列つきで引く（IN は D1 の上限 100 件以内）。 */
const jobsByPostIds = async (env: Pick<Bindings, 'DB'>, postIds: readonly string[]): Promise<WebhookJob[]> => {
  if (postIds.length === 0) return []
  const rows = await env.DB.prepare(
    `SELECT ${JobColumns},j.extraction_json AS extractionJson FROM ${JobTables} WHERE j.post_id IN (${postIds.map(() => '?').join(',')})`
  )
    .bind(...postIds)
    .all()
  const byPostId = new Map(rows.results.map((row) => [row.postId, row]))
  return listedJobs(
    env,
    postIds.flatMap((postId) => {
      const row = byPostId.get(postId)
      return row === undefined ? [] : [row]
    })
  )
}

export const listWebhookJobs = async (
  env: Pick<Bindings, 'DB'>,
  input: ListWebhookJobsQuery,
  scan: WebhookVerdictScan = WEBHOOK_VERDICT_SCAN
) => {
  const query: ListQuery = {
    ...input,
    sort: input.sort === undefined ? DEFAULT_WEBHOOK_JOB_SORT : input.sort,
    order: input.order === undefined ? DEFAULT_WEBHOOK_JOB_ORDER : input.order
  }
  // 窓の基準は 1 リクエストで揃える（走査の途中で時間が進んでも、同じ範囲を見る）。
  const now = dayjs().valueOf()
  if (query.verdict !== undefined) {
    const result = await scanByVerdict(env, { ...query, verdict: query.verdict }, now, scan, query.cursor, 0, [])
    return { jobs: await jobsByPostIds(env, result.postIds), nextCursor: result.nextCursor }
  }
  const filter = listFilter(query, query.cursor, now)
  const result = await env.DB.prepare(
    `SELECT ${JobColumns},j.extraction_json AS extractionJson FROM ${JobTables} ${filter.where} ${listOrderBy(query)} LIMIT ?`
  )
    .bind(...filter.values, query.limit + 1)
    .all()
  const rows = result.results
  const jobs = await listedJobs(env, rows.slice(0, query.limit))
  const last = jobs.at(-1)
  return { jobs, nextCursor: rows.length > query.limit && last ? last.postId : null }
}
