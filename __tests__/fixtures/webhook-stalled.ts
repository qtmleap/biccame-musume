import type { Bindings } from '@api/types/bindings'
import dayjs from 'dayjs'
import { heldSeed, type RejudgeSeed, seedRejudgeJob } from './webhook-d1-jobs'
import { seedCandidate } from './webhook-relink'

// 止まっている処理待ち・処理中の再実行テストの共通の準備。
// サーバーは現在時刻を読むので、種データの時刻もテスト開始時の現在時刻からの相対にする（固定の日付だと、実時計が先なら「古い」にならない）。
export const NOW = dayjs().valueOf()
/** 90 分前。60 分の閾値を超えているので、queued / processing のままだと止まっている扱い。 */
export const OLD = NOW - 90 * 60_000
export const childId = '11111111-1111-4111-8111-111111111111'
export const siblingId = '22222222-2222-4222-8222-222222222222'
export const oldEvent = '33333333-3333-4333-8333-333333333333'

export const judging = (status: 'queued' | 'processing', overrides: Partial<RejudgeSeed> = {}): RejudgeSeed => ({
  ...heldSeed,
  status,
  notificationStatus: 'pending',
  reasons: [],
  updatedAt: OLD,
  ...overrides
})

/** 実データの形: 親は failed（attempts 12）、候補は queued（attempts 9、last_error もリースも無い）で止まっている。 */
export const seedStalledPair = async (
  env: Bindings,
  index: number,
  childStatus: 'queued' | 'processing' = 'queued'
) => {
  const postId = await seedRejudgeJob(env, index, { ...heldSeed, status: 'failed', reasons: [], updatedAt: OLD })
  await env.DB.prepare("UPDATE webhook_event_jobs SET attempts=12,last_error='processing_failed' WHERE post_id=?")
    .bind(postId)
    .run()
  await seedCandidate(env, postId, {
    uuid: childId,
    status: childStatus,
    reasons: [],
    eventId: null,
    notificationStatus: 'pending',
    createdAt: 1791676800000,
    updatedAt: OLD,
    attempts: 9
  })
  await env.DB.prepare('UPDATE webhook_event_candidates SET last_error=NULL WHERE event_uuid=?').bind(childId).run()
  return postId
}
