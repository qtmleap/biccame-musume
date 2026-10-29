import { readdir, readFile } from 'node:fs/promises'
import { insertWebhookJob } from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { WebhookJobSchema } from '@biccame/shared/schemas/webhook.dto'
import { HTTPException } from 'hono/http-exception'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

export const event: EventRequest = {
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  category: 'limited_card',
  title: 'テスト配布',
  stores: ['akiba'],
  characterIds: ['akiba'],
  startDate: '2026-10-11T00:00:00+09:00',
  isVerified: true,
  isPreliminary: false,
  shouldTweet: false,
  conditions: [{ uuid: '11111111-1111-4111-a111-111111111111', type: 'everyone' }],
  referenceUrls: [
    {
      uuid: '22222222-2222-4222-a222-222222222222',
      type: 'announce',
      url: 'https://x.com/bic_akiba/status/2109221721773576390'
    }
  ]
}

export const makeJob = () => {
  const parsed = WebhookJobSchema.safeParse({
    postId: '2109221721773576390',
    post: {
      id: '2109221721773576390',
      screenName: 'bic_akiba',
      text: '本日より限定名刺を全員に配布',
      createdAt: '2026-10-11T00:00:00Z',
      kind: 'original',
      url: event.referenceUrls[0].url,
      media: []
    },
    sourceUrl: event.referenceUrls[0].url,
    eventUUID: event.uuid,
    status: 'processing',
    reasons: [],
    candidate: event,
    confidence: 0.99,
    model: 'clef',
    questionVersion: 'test-v1',
    eventId: null,
    eventTitle: null,
    postStatus: 'start',
    postStatusProbability: 0.99,
    answers: null,
    draft: null,
    attempts: 1,
    notificationStatus: 'pending',
    notificationId: null,
    notificationError: null,
    notificationAttempts: 0,
    lastError: null,
    createdAt: '2026-10-11T00:00:00Z',
    updatedAt: '2026-10-11T00:00:00Z',
    judgedAt: '2026-10-11T00:00:00Z'
  })
  if (!parsed.success) throw new Error('Invalid test job')
  return parsed.data
}

// 再判定のテスト。モックのキューを持つ Bindings とマイグレーション済みのローカルD1を用意する。
export const withRejudgeEnv = async (run: (env: Bindings, sent: string[]) => Promise<void>) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-rejudge-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const sent: string[] = []
    const env = Object.assign(await mf.getBindings<Bindings>(), {
      EVENT_DETECTION_QUEUE: {
        send: async (message: { postId: string }) => {
          sent.push(message.postId)
        }
      }
    })
    const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations) {
      const sql = await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')
      await env.DB.exec(sql.replace(/^--.*$/gm, '').replace(/\n/g, ' '))
    }
    await run(env, sent)
  } finally {
    await mf.dispose()
  }
}

export const rejudgePostId = (index: number) => `210922172177357${String(index).padStart(4, '0')}`

export type RejudgeSeed = {
  status: string
  notificationStatus: string
  leaseUntil: number | null
  reasons: string[]
  /** 最後の更新（updated_at、ms）。省略すると古い固定値（止まっていると見なされる側）。新しい処理待ちを作るときは現在時刻を渡す。 */
  updatedAt?: number
}

/** 既定の updated_at。現在時刻よりずっと前なので、queued / processing のままだと「止まっている」扱いになる。 */
export const SEED_UPDATED_AT = 1791676800000

export const heldSeed: RejudgeSeed = {
  status: 'held',
  notificationStatus: 'failed',
  leaseUntil: null,
  reasons: ['needs_review']
}

// AI が自動で対象外にしたジョブ。対象外のジョブは通知を送らないため notification_status は skipped。
export const ignoredSeed: RejudgeSeed = {
  status: 'ignored',
  notificationStatus: 'skipped',
  leaseUntil: null,
  reasons: ['not_distribution_event']
}

// 管理画面で人が却下したジョブ。resolveWebhookJob の reject が書く reasons と同じ。
export const rejectedSeed: RejudgeSeed = { ...ignoredSeed, reasons: ['manually_rejected'] }

/** 保存済みの判定結果・回答・エラーをすべて埋めたジョブを作る。消えるべき列が最初から null だと検証にならない。 */
export const seedRejudgeJob = async (env: Bindings, index: number, seed: RejudgeSeed) => {
  const postId = rejudgePostId(index)
  const post: DetectPost = {
    id: postId,
    screenName: 'bic_akiba',
    text: '本日より限定名刺を全員に配布',
    createdAt: '2026-10-11T00:00:00Z',
    kind: 'original',
    url: `https://x.com/bic_akiba/status/${postId}`,
    media: []
  }
  await insertWebhookJob(env, post)
  await env.DB.prepare(`UPDATE webhook_event_jobs SET status=?,result_json=?,answers_json=?,candidate_json=?,
    reasons_json=?,confidence=?,model=?,question_version=?,judged_at=?,semantic_key=?,event_id=?,attempts=?,
    notification_status=?,notification_id=?,notification_error=?,notification_attempts=?,last_error=?,
    lease_token=?,lease_until=?,created_at=?,updated_at=? WHERE post_id=?`)
    .bind(
      seed.status,
      '{"answers":{"is_event":{"type":"noul","noul":0.72}}}',
      '{"is_event":{"type":"noul","noul":0.72}}',
      JSON.stringify(event),
      JSON.stringify(seed.reasons),
      0.72,
      'clef-flash',
      'old-v1',
      1791676800000,
      `semantic-${postId}`,
      event.uuid,
      3,
      seed.notificationStatus,
      'message-1',
      'previous notification error',
      2,
      'previous processing error',
      seed.leaseUntil === null ? null : 'other-worker',
      seed.leaseUntil,
      1791676800000,
      seed.updatedAt === undefined ? SEED_UPDATED_AT : seed.updatedAt,
      postId
    )
    .run()
  return postId
}

export const rawRejudgeRow = (env: Bindings, postId: string) =>
  env.DB.prepare('SELECT * FROM webhook_event_jobs WHERE post_id=?').bind(postId).first()

export const conflictOf = async (run: Promise<unknown>) => {
  try {
    await run
  } catch (error) {
    if (error instanceof HTTPException) return { status: error.status, message: error.message }
    throw error
  }
  throw new Error('Expected a conflict')
}
