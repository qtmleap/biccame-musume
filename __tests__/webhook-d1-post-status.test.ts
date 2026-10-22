import { expect, test } from 'bun:test'
import { listWebhookJobs } from '@api/services/webhook-jobs'
import { withRejudgeEnv } from './fixtures/webhook-d1-jobs'
import {
  expectedOrder,
  POST_STATUS_IDS,
  POST_STATUSES,
  postStatusSeeds,
  postStatusSeedsOf,
  seedListJobs,
  verdictOf,
  walkPages
} from './fixtures/webhook-d1-list'

test('list postStatus: the seeded answers really include broken rows that would make an unguarded json_extract fail', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, postStatusSeeds)
    // 保護なしの json_extract は、壊れた JSON の行でエラーになる。だから listFilter は json_valid で守っている。
    await expect(
      env.DB.prepare(
        "SELECT json_extract(answers_json,'$.status.type') AS v FROM webhook_event_jobs WHERE post_id='18'"
      ).all()
    ).rejects.toThrow()
    // 守れば、壊れた行も NULL（どの値にも一致しない）として扱える。
    const guarded = await env.DB.prepare(
      "SELECT post_id AS id, CASE WHEN json_valid(answers_json) THEN json_extract(answers_json,'$.status.type') END AS v FROM webhook_event_jobs WHERE post_id IN ('17','18','19','20')"
    ).all<{ id: string; v: string | null }>()
    expect(guarded.results.map((row) => row.v)).toEqual([null, null, null, null])
  })
}, 60000)

test('list postStatus: each value matches what the status column shows, and ignored wins over the saved answer', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, postStatusSeeds)
    const all = (await listWebhookJobs(env, { limit: 100 })).jobs
    expect(all).toHaveLength(postStatusSeeds.length)
    for (const postStatus of POST_STATUSES) {
      const expected = POST_STATUS_IDS[postStatus]
      expect(expected.length).toBeGreaterThan(0)
      const page = await listWebhookJobs(env, { limit: 100, postStatus })
      expect(page.jobs.map((job) => job.postId).toSorted()).toEqual(expected.toSorted())
      expect(page.nextCursor).toBeNull()
      // 画面のステータス列の規則（webhookPostStatusLabel）から導いた期待値とも一致する。
      const shown = all
        .filter((job) =>
          postStatus === 'ignored'
            ? job.status === 'ignored'
            : job.status !== 'ignored' && job.postStatus === postStatus
        )
        .map((job) => job.postId)
      expect(page.jobs.map((job) => job.postId).toSorted()).toEqual(shown.toSorted())
    }
    // 却下のジョブは、保存済み回答が announce でも announce には一致しない。
    const announce = (await listWebhookJobs(env, { limit: 100, postStatus: 'announce' })).jobs.map((job) => job.postId)
    expect(announce).not.toContain('15')
    expect(
      (await listWebhookJobs(env, { limit: 100, postStatus: 'ignored' })).jobs.find((job) => job.postId === '15')
    ).toMatchObject({ status: 'ignored', postStatus: 'announce' })
    // 回答が無い・壊れている・status が選択式でない・4値にない選択肢の行は、どの値にも一致せず、エラーにもならない。
    const returned = new Set<string>()
    for (const postStatus of POST_STATUSES) {
      for (const job of (await listWebhookJobs(env, { limit: 100, postStatus })).jobs) returned.add(job.postId)
    }
    for (const postId of ['17', '18', '19', '20', '21', '23']) expect(returned.has(postId)).toBe(false)
    // 絞り込みなしでは、それらの行も含めて全行が返る。
    expect(all.map((job) => job.postId).toSorted()).toEqual(postStatusSeeds.map((seed) => seed.postId).toSorted())
  })
}, 60000)

test('list postStatus: every sort and order pages without duplicates or gaps', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, postStatusSeeds)
    for (const postStatus of POST_STATUSES) {
      const matching = postStatusSeedsOf(POST_STATUS_IDS[postStatus])
      for (const sort of ['createdAt', 'confidence'] as const) {
        for (const order of ['asc', 'desc'] as const) {
          for (const limit of [1, 2, 100]) {
            const pages = await walkPages(env, { limit, sort, order, postStatus })
            expect(pages.flat()).toEqual(expectedOrder(matching, sort, order))
            for (const page of pages.slice(0, -1)) expect(page).toHaveLength(limit)
          }
        }
      }
    }
  })
}, 60000)

test('list postStatus: combines with verdict, status and range without duplicates or gaps', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, postStatusSeeds)
    // 判定の走査（複数バッチ）でも、ステータスの条件が SQL 側で効いている。
    for (const postStatus of POST_STATUSES) {
      for (const verdict of ['match', 'mismatch', 'excluded'] as const) {
        const matching = postStatusSeedsOf(POST_STATUS_IDS[postStatus]).filter((seed) => verdictOf(seed) === verdict)
        for (const scan of [{ batch: 2, maxBatches: 100 }, { batch: 3, maxBatches: 100 }, undefined] as const) {
          for (const limit of [1, 2, 100]) {
            for (const sort of ['createdAt', 'confidence'] as const) {
              const pages = await walkPages(env, { limit, sort, order: 'desc', postStatus, verdict }, scan)
              expect(pages.flat()).toEqual(expectedOrder(matching, sort, 'desc'))
            }
          }
        }
      }
    }
    // 少なくとも一つの組は空でなく、複数ページにまたがる（検証が空振りしない）。
    const announceMatch = await walkPages(
      env,
      { limit: 1, postStatus: 'announce', verdict: 'match' },
      { batch: 2, maxBatches: 100 }
    )
    expect(announceMatch.flat()).toEqual(['22', '9'])
    expect(announceMatch.length).toBeGreaterThan(1)
    // ジョブの状態との組み合わせ。登録済みの announce は 22 だけ。
    expect((await walkPages(env, { limit: 1, postStatus: 'announce', status: 'registered' })).flat()).toEqual(['22'])
    expect((await walkPages(env, { limit: 1, postStatus: 'announce', status: 'held' })).flat()).toEqual(
      expectedOrder(postStatusSeedsOf(['9', '10']), 'createdAt', 'desc')
    )
    // 却下はジョブの状態が ignored の行だけ。状態を held にすると重ならない。
    expect(await listWebhookJobs(env, { limit: 100, postStatus: 'ignored', status: 'held' })).toEqual({
      jobs: [],
      nextCursor: null
    })
    // 受信日時の窓と組み合わせても、窓の外の行は出ない（シードは過去なので 1 時間の窓は空）。
    expect(await listWebhookJobs(env, { limit: 100, postStatus: 'announce', range: '1h' })).toEqual({
      jobs: [],
      nextCursor: null
    })
  })
}, 60000)

test('list postStatus: a verdict scan that hits the cap still continues exactly under a postStatus filter', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, postStatusSeeds)
    const scan = { batch: 2, maxBatches: 2 }
    const query = { limit: 5, postStatus: 'announce' as const, verdict: 'match' as const }
    // 打ち切りを挟んでも、辿った結果は上限なしの結果と同じ（重複も欠落も無い）。
    const capped = await walkPages(env, query, scan)
    const uncapped = await walkPages(env, query, { batch: 2, maxBatches: 100 })
    expect(capped.flat()).toEqual(uncapped.flat())
    expect(capped.flat()).toEqual(expectedOrder(postStatusSeedsOf(['9', '22']), 'createdAt', 'desc'))
  })
}, 60000)

// ---- 受信履歴のキャラクター絞り込み ----

test('list: character account is case-insensitive and combines with verdict, status and pagination', async () => {
  await withRejudgeEnv(async (env) => {
    const seeds = postStatusSeeds.map((seed, index) => ({
      ...seed,
      screenName: index % 3 === 0 ? 'BIC_ABENO' : index % 3 === 1 ? 'bic_abeno' : 'bic_akiba'
    }))
    await seedListJobs(env, seeds)
    for (const sort of ['createdAt', 'confidence'] as const) {
      for (const order of ['asc', 'desc'] as const) {
        const selected = seeds.filter((seed) => seed.screenName.toLowerCase() === 'bic_abeno')
        const pages = await walkPages(env, { limit: 2, screenName: 'bic_ABENO', sort, order })
        expect(pages.flat()).toEqual(expectedOrder(selected, sort, order))
        const matching = selected.filter((seed) => verdictOf(seed) === 'match' && seed.status === 'ignored')
        const combined = await walkPages(env, {
          limit: 1,
          screenName: 'bic_abeno',
          verdict: 'match',
          postStatus: 'ignored',
          sort,
          order
        })
        expect(combined.flat()).toEqual(expectedOrder(matching, sort, order))
      }
    }
    const empty = await listWebhookJobs(env, { limit: 25, screenName: 'unknown' })
    expect(empty).toEqual({ jobs: [], nextCursor: null })
  })
})
