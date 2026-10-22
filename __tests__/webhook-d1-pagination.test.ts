import { expect, test } from 'bun:test'
import adminWebhookRoutes from '@api/routes/admin-webhook'
import { listWebhookJobs } from '@api/services/webhook-jobs'
import { webhookKeywordVerdict } from '@biccame/shared/event-detect/detection'
import { WebhookJobListSchema } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import { withRejudgeEnv } from './fixtures/webhook-d1-jobs'
import {
  expectedOrder,
  HOUR,
  type ListSeed,
  MATCH_TEXT,
  pagingSeeds,
  postStatusSeeds,
  postStatusSeedsOf,
  seedListJobs,
  verdictOf,
  verdictSeeds,
  walkPages
} from './fixtures/webhook-d1-list'

test('list: every sort and order pages without duplicates or gaps, NULL confidence is the lowest', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, pagingSeeds)
    for (const sort of ['createdAt', 'confidence'] as const) {
      for (const order of ['asc', 'desc'] as const) {
        const expected = expectedOrder(pagingSeeds, sort, order)
        for (const limit of [1, 2, 3, 4, 100]) {
          const pages = await walkPages(env, { limit, sort, order })
          // 連結した結果が、順序・重複・欠落まで含めて期待順と完全に一致する。
          expect(pages.flat()).toEqual(expected)
          for (const page of pages.slice(0, -1)) expect(page).toHaveLength(limit)
        }
      }
    }
    // 並びを省略すると受信日時の新しい順。
    expect((await walkPages(env, { limit: 100 })).flat()).toEqual(expectedOrder(pagingSeeds, 'createdAt', 'desc'))
    // 精度の昇順は、未判定(NULL)が先頭に来る。
    const lowest = (await listWebhookJobs(env, { limit: 100, sort: 'confidence', order: 'asc' })).jobs
    expect(lowest.slice(0, 3).map((job) => job.confidence)).toEqual([null, null, null])
    expect(lowest.at(-1)?.confidence).toBe(1)
  })
}, 60000)

test('list: range keeps only jobs received within the window', async () => {
  await withRejudgeEnv(async (env) => {
    const now = dayjs().valueOf()
    // 境界ちょうどを避け、30分前・2時間前・25時間前にする。
    const seeds: ListSeed[] = [
      { postId: '201', createdAt: now - 30 * 60_000, confidence: 0.5, text: MATCH_TEXT },
      { postId: '202', createdAt: now - 2 * HOUR, confidence: 0.5, text: MATCH_TEXT },
      { postId: '203', createdAt: now - 25 * HOUR, confidence: 0.5, text: MATCH_TEXT },
      { postId: '204', createdAt: now - 10 * 60_000, confidence: null, text: MATCH_TEXT }
    ]
    await seedListJobs(env, seeds)
    const ids = async (range?: '1h' | '24h') => (await walkPages(env, { limit: 1, range })).flat()
    expect(await ids()).toEqual(['204', '201', '202', '203'])
    expect(await ids('1h')).toEqual(['204', '201'])
    expect(await ids('24h')).toEqual(['204', '201', '202'])
    // 他の条件と組み合わせても、窓は受信日時(created_at)で決まる。精度の昇順は未判定(NULL)が先頭。
    const byConfidence = await walkPages(env, { limit: 1, range: '24h', sort: 'confidence', order: 'asc' })
    expect(byConfidence.flat()).toEqual(['204', '201', '202'])
  })
}, 60000)

test('list verdict: the stored posts really produce match, mismatch and excluded', () => {
  expect(new Set(pagingSeeds.map(verdictOf))).toEqual(new Set(['match', 'mismatch', 'excluded']))
  expect(pagingSeeds.filter((seed) => verdictOf(seed) === 'match').length).toBeGreaterThan(0)
})

test('list verdict: filters by the same rule the list column shows, across every sort and order', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, pagingSeeds)
    for (const verdict of ['match', 'mismatch', 'excluded'] as const) {
      const matching = pagingSeeds.filter((seed) => verdictOf(seed) === verdict)
      expect(matching.length).toBeGreaterThan(0)
      for (const sort of ['createdAt', 'confidence'] as const) {
        for (const order of ['asc', 'desc'] as const) {
          // 走査を小さくして、複数バッチにまたがる経路も通す。上限を十分大きくして取りこぼしを無くす。
          for (const scan of [{ batch: 2, maxBatches: 100 }, { batch: 3, maxBatches: 100 }, undefined] as const) {
            for (const limit of [1, 2, 100]) {
              const pages = await walkPages(env, { limit, sort, order, verdict }, scan)
              expect(pages.flat()).toEqual(expectedOrder(matching, sort, order))
              // 一覧の「判定」列の表示と同じ判定になっている。
              const page = await listWebhookJobs(env, { limit: 100, sort, order, verdict }, scan)
              for (const job of page.jobs) expect(webhookKeywordVerdict(job.post)).toBe(verdict)
            }
          }
        }
      }
    }
  })
}, 60000)

test('list verdict: combines with status in SQL, then filters the rest by verdict', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, pagingSeeds)
    await env.DB.prepare("UPDATE webhook_event_jobs SET status='registered' WHERE post_id IN ('9','12')").run()
    const registered = await walkPages(
      env,
      { limit: 5, status: 'registered', verdict: 'match' },
      { batch: 2, maxBatches: 100 }
    )
    expect(registered.flat()).toEqual(
      expectedOrder(
        pagingSeeds.filter((seed) => ['9', '12'].includes(seed.postId) && verdictOf(seed) === 'match'),
        'createdAt',
        'desc'
      )
    )
  })
}, 60000)

test('list verdict: a scan that hits the cap returns an empty page whose cursor continues from the last scanned row', async () => {
  await withRejudgeEnv(async (env) => {
    // 新しい順に 一致 ×1, 不一致 ×7, 一致 ×1。batch 2 × 最大 2 回 = 4 行を走査して打ち切る。
    const seeds = verdictSeeds([
      'match',
      'mismatch',
      'mismatch',
      'mismatch',
      'mismatch',
      'mismatch',
      'mismatch',
      'mismatch',
      'match'
    ])
    await seedListJobs(env, seeds)
    const scan = { batch: 2, maxBatches: 2 }
    const query = { limit: 5, verdict: 'excluded' as const }
    // 除外は 1 件も無い。上限に達しても行は残っているので、0件のまま続きの印(最後に走査した行)を返す。
    const first = await listWebhookJobs(env, query, scan)
    expect(first.jobs).toEqual([])
    expect(first.nextCursor).toBe(seeds[3]?.postId)
    // その印から続けて辿ると、最後は行を使い切って null になる。
    const rest = await walkPages(env, query, scan, first.nextCursor === null ? undefined : first.nextCursor)
    expect(rest.flat()).toEqual([])
    expect(rest.length).toBeGreaterThan(0)

    // 一致の絞り込み: 先頭の 1 件は上限内で見つかり、後ろの 1 件は次ページ以降で見つかる。
    const matchQuery = { limit: 5, verdict: 'match' as const }
    const page1 = await listWebhookJobs(env, matchQuery, scan)
    expect(page1.jobs.map((job) => job.postId)).toEqual([seeds[0]?.postId])
    expect(page1.nextCursor).toBe(seeds[3]?.postId)
    const page2 = await listWebhookJobs(
      env,
      { ...matchQuery, cursor: page1.nextCursor === null ? undefined : page1.nextCursor },
      scan
    )
    expect(page2.jobs).toEqual([])
    expect(page2.nextCursor).toBe(seeds[7]?.postId)
    const page3 = await listWebhookJobs(
      env,
      { ...matchQuery, cursor: page2.nextCursor === null ? undefined : page2.nextCursor },
      scan
    )
    expect(page3.jobs.map((job) => job.postId)).toEqual([seeds[8]?.postId])
    expect(page3.nextCursor).toBeNull()
    // 打ち切りを挟んでも、全ページを連結すれば一致行がすべて順に出る。
    expect((await walkPages(env, matchQuery, scan)).flat()).toEqual([seeds[0]?.postId, seeds[8]?.postId])
  })
}, 60000)

test('list verdict: stops exactly at the limit, and the cursor is the last returned row', async () => {
  await withRejudgeEnv(async (env) => {
    // 新しい順に 一致 ×3 のみ。limit 3 ちょうどで行を使い切る / limit 2 だと続きがある。
    const seeds = verdictSeeds(['match', 'match', 'match'])
    await seedListJobs(env, seeds)
    const scan = { batch: 2, maxBatches: 10 }

    // limit+1 件目が見つかる: 返した最後の行が nextCursor(余分に見つけた行は返さない)。
    const more = await listWebhookJobs(env, { limit: 2, verdict: 'match' }, scan)
    expect(more.jobs.map((job) => job.postId)).toEqual([seeds[0]?.postId, seeds[1]?.postId])
    expect(more.nextCursor).toBe(seeds[1]?.postId)
    const tail = await listWebhookJobs(
      env,
      { limit: 2, verdict: 'match', cursor: more.nextCursor === null ? undefined : more.nextCursor },
      scan
    )
    expect(tail.jobs.map((job) => job.postId)).toEqual([seeds[2]?.postId])
    expect(tail.nextCursor).toBeNull()

    // limit 件ぴったりで行を使い切った: 続きは無いので null。
    const exact = await listWebhookJobs(env, { limit: 3, verdict: 'match' }, scan)
    expect(exact.jobs.map((job) => job.postId)).toEqual(seeds.map((seed) => seed.postId))
    expect(exact.nextCursor).toBeNull()
  })
}, 60000)

test('list verdict: ends with a null cursor when the cap and the last row coincide', async () => {
  await withRejudgeEnv(async (env) => {
    // 4 行を batch 2 × 2 回でちょうど走査し終える。最後のバッチが満杯でも、次の取得は空で null になる。
    const seeds = verdictSeeds(['mismatch', 'mismatch', 'mismatch', 'mismatch'])
    await seedListJobs(env, seeds)
    const result = await listWebhookJobs(env, { limit: 5, verdict: 'match' }, { batch: 2, maxBatches: 2 })
    expect(result.jobs).toEqual([])
    // 上限に達した時点では先があるか分からないので、最後に走査した行を印にする。続きを辿れば null で終わる。
    expect(result.nextCursor).toBe(seeds[3]?.postId)
    const next = await listWebhookJobs(
      env,
      { limit: 5, verdict: 'match', cursor: seeds[3]?.postId },
      { batch: 2, maxBatches: 2 }
    )
    expect(next).toEqual({ jobs: [], nextCursor: null })
  })
}, 60000)

test('list route: validates the new query over HTTP', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, postStatusSeeds)
    const get = (search: string) => adminWebhookRoutes.request(`/admin/webhook/jobs?${search}`, undefined, env)
    expect((await get('range=7d')).status).toBe(400)
    expect((await get('sort=status')).status).toBe(400)
    expect((await get('verdict=unknown')).status).toBe(400)
    expect((await get('postStatus=foo')).status).toBe(400)
    // ジョブの状態名はステータスの値ではない。
    expect((await get('postStatus=held')).status).toBe(400)
    const ok = await get('sort=confidence&order=asc&postStatus=announce&range=24h')
    expect(ok.status).toBe(200)
    const body = await ok.json()
    expect(body).toMatchObject({ jobs: [], nextCursor: null })
    // ステータスの絞り込みと並びが効く。
    const sorted = await get('limit=100&sort=confidence&order=desc&postStatus=end')
    expect(sorted.status).toBe(200)
    const sortedBody = WebhookJobListSchema.safeParse(await sorted.json())
    expect(sortedBody.success ? sortedBody.data.jobs.map((job) => job.postId) : null).toEqual(
      expectedOrder(postStatusSeedsOf(['13', '14']), 'confidence', 'desc')
    )
    // 精度の下限・上限はもう受け付けない。未知のキーとして捨てるので 400 にならず、絞り込みにも効かない。
    const unfiltered = await get('limit=100')
    const withBounds = await get('limit=100&minConfidence=0.9&maxConfidence=0.1')
    expect(withBounds.status).toBe(200)
    expect(await withBounds.json()).toEqual(await unfiltered.json())
  })
}, 60000)
