import { expect, test } from 'bun:test'
import { insertWebhookJob, listWebhookJobs } from '@api/services/webhook-jobs'
import { makeJob, withRejudgeEnv } from './fixtures/webhook-d1-jobs'

// 実D1の候補を返したまま、一覧のクエリ数が投稿件数に比例しないことを保証する。
test('一覧は候補を一括取得し、親子の対応・順序・発見状態を維持する', async () => {
  await withRejudgeEnv(async (env) => {
    const base = makeJob().post
    const ids = Array.from({ length: 50 }, (_, index) => `211000000000000${String(index + 60).padStart(4, '0')}`)
    for (const postId of ids) {
      await insertWebhookJob(env, { ...base, id: postId, url: `https://x.com/bic_akiba/status/${postId}` })
    }
    for (const [index, postId] of [ids[0], ids[1], ids[0]].entries()) {
      const discovery = {
        relevance: index === 2 ? 'detected' : 'not_detected',
        action: index === 2 ? 'review' : 'none',
        confidence: 0.96,
        evidence: ['model_event_confirmed'],
        missingFields: [],
        reasons: []
      }
      await env.DB.prepare(`INSERT INTO webhook_event_candidates
        (event_uuid,post_id,item,post_json,source_url,status,result_json,created_at,updated_at)
        VALUES (?,?,?,?,?,'held',?,?,?)`)
        .bind(
          crypto.randomUUID(),
          postId,
          `candidate-${index}`,
          JSON.stringify({ ...base, id: postId }),
          base.url,
          JSON.stringify({ discovery }),
          index,
          index
        )
        .run()
    }
    const queries: string[] = []
    const DB = new Proxy(env.DB, {
      get: (target, property, receiver) => {
        if (property !== 'prepare') return Reflect.get(target, property, receiver)
        return (query: string) => {
          queries.push(query)
          return target.prepare(query)
        }
      }
    })
    for (const verdict of [undefined, 'match'] as const) {
      queries.length = 0
      const page = await listWebhookJobs({ DB }, { limit: 50, verdict })
      expect(page.jobs).toHaveLength(50)
      expect(queries).toHaveLength(verdict === undefined ? 2 : 3)
      expect(queries.filter((query) => query.includes('FROM webhook_event_candidates j'))).toHaveLength(1)
      expect(page.jobs.find((job) => job.postId === ids[0])?.candidates.map((candidate) => candidate.item)).toEqual([
        'candidate-0',
        'candidate-2'
      ])
      expect(page.jobs.find((job) => job.postId === ids[0])?.discovery?.relevance).toBe('detected')
      expect(page.jobs.find((job) => job.postId === ids[1])?.candidates.map((candidate) => candidate.item)).toEqual([
        'candidate-1'
      ])
      expect(page.jobs.find((job) => job.postId === ids[2])?.candidates).toEqual([])
    }
    queries.length = 0
    expect((await listWebhookJobs({ DB }, { limit: 50, verdict: 'excluded' })).jobs).toEqual([])
    expect(queries).toHaveLength(1)
  })
}, 30000)
