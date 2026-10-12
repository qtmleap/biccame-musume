import { renderSocialImage } from '@api/lib/social-image'
import { isSocialSnapshotPublic } from '@api/lib/social-public-snapshot'
import { postDiscordImages } from '@api/services/discord'
import { createPostingTransport } from '@api/services/posting-transport'
import type { Bindings } from '@api/types/bindings'
import { type SocialSnapshot, SocialSnapshotSchema } from '@biccame/shared/social'
import type { TwitterTransport } from '@biccame/shared/x/transport'
import dayjs from 'dayjs'
import { z } from 'zod'

const MAX_ATTEMPTS = 5
const JobSchema = z.object({
  id: z.string().nonempty(),
  channel: z.enum(['x', 'discord']),
  snapshot_json: z.string().nonempty(),
  attempts: z.number().int(),
  lease_token: z.string().nonempty()
})
type Outcome = { status: 'sent'; id: string } | { status: 'failed' | 'unknown'; kind: string; retry?: number }
/** スナップショットの images[index] を PNG にする。 */
export type SocialImageRenderer = (
  env: Bindings,
  snapshot: SocialSnapshot,
  index: number
) => Promise<Uint8Array<ArrayBuffer>>
export type SocialDependencies = {
  render: SocialImageRenderer
  send: (
    env: Bindings,
    channel: 'x' | 'discord',
    snapshot: SocialSnapshot,
    pngs: Uint8Array[],
    nonce: string
  ) => Promise<Outcome>
}

/** 画像は images の順に1枚ずつ描画する。並列にすると描画の wasm メモリが画像数の分だけ同時に必要になる。 */
const renderSocialImages = async (
  env: Bindings,
  render: SocialImageRenderer,
  snapshot: SocialSnapshot
): Promise<Uint8Array<ArrayBuffer>[]> => {
  const pngs: Uint8Array<ArrayBuffer>[] = []
  for (const index of snapshot.images.keys()) pngs.push(await render(env, snapshot, index))
  return pngs
}

/** X の upload エンドポイントへ同時にリクエストを投げないよう、画像の順に1枚ずつ upload する。 */
const uploadImages = async (transport: TwitterTransport, pngs: Uint8Array[]): Promise<string[]> => {
  const mediaIds: string[] = []
  for (const png of pngs) mediaIds.push(await transport.uploadImage(png))
  return mediaIds
}

export const sendSocialPost = async (
  env: Pick<Bindings, 'TWITTER_AUTH_TOKEN' | 'TWITTER_CSRF_TOKEN' | 'DISCORD_TOKEN' | 'DISCORD_CHANNEL_ID'>,
  channel: 'x' | 'discord',
  snapshot: SocialSnapshot,
  pngs: Uint8Array[],
  nonce: string
): Promise<Outcome> => {
  // 画像が欠けたまま、または画像なしで公開しない。再試行しても直らないため、再試行なしの失敗にする。
  if (pngs.length === 0 || pngs.length !== snapshot.images.length) return { status: 'failed', kind: 'invalid_images' }
  if (channel === 'discord') {
    const result = await postDiscordImages(env, snapshot.text, pngs, nonce)
    return result.status === 'sent'
      ? { status: 'sent', id: result.messageId }
      : {
          status: result.status,
          kind: result.kind,
          ...(result.status === 'failed' && result.kind === 'rate_limit' && result.retryAfterSeconds !== undefined
            ? { retry: result.retryAfterSeconds }
            : {})
        }
  }
  const transport = createPostingTransport(env)
  if (!transport) return { status: 'failed', kind: 'configuration' }
  const mediaIds = await (async () => {
    await transport.checkAuthenticatedSession()
    return uploadImages(transport, pngs)
  })().catch(() => null)
  // 認証・画像upload失敗の段階では公開tweetはまだ送信していない。
  if (mediaIds === null) return { status: 'failed', kind: 'media_preparation_failed', retry: 60 }
  try {
    return {
      status: 'sent',
      id: await transport.tweet(snapshot.text, { mediaIds, quoteTweetId: snapshot.quoteTweetId })
    }
  } catch (error) {
    const parsed = z.object({ kind: z.string().nonempty() }).safeParse(error)
    const kind = parsed.success ? parsed.data.kind : 'delivery_unknown'
    return kind === 'rate_limit'
      ? { status: 'failed', kind, retry: 60 }
      : { status: kind === 'rejected' ? 'failed' : 'unknown', kind }
  }
}
const dependencies: SocialDependencies = { render: renderSocialImage, send: sendSocialPost }

export const socialInsertStatements = (
  env: Pick<Bindings, 'DB' | 'X_POSTING_ENABLED' | 'DISCORD_POSTING_ENABLED'>,
  snapshot: SocialSnapshot,
  guard = '',
  values: (string | number)[] = []
) => {
  const now = dayjs().valueOf()
  const channels = [
    ...(env.X_POSTING_ENABLED === 'true' ? ['x'] : []),
    ...(env.DISCORD_POSTING_ENABLED === 'true' ? ['discord'] : [])
  ]
  return channels.map((channel) =>
    env.DB.prepare(`INSERT INTO social_post_jobs
    (id,channel,key,snapshot_json,status,available_at,created_at,updated_at)
    SELECT ?,?,?,?,'pending',?,?,? ${guard} ON CONFLICT(channel,key) DO NOTHING`).bind(
      crypto.randomUUID(),
      channel,
      snapshot.key,
      JSON.stringify(snapshot),
      now,
      now,
      now,
      ...values
    )
  )
}

export const saveSocialSnapshot = async (env: Bindings, input: SocialSnapshot): Promise<void> => {
  const parsed = SocialSnapshotSchema.safeParse(input)
  if (!parsed.success) throw new Error('Invalid social snapshot')
  const statements = socialInsertStatements(env, parsed.data)
  if (statements.length > 0) await env.DB.batch(statements)
  await recoverSocialJobs(env)
}

/** Queue投入失敗や期限切れの未送信leaseをcronから回収する。送信開始済みunknownは回収しない。 */
export const recoverSocialJobs = async (env: Bindings): Promise<void> => {
  if (!env.EVENT_DETECTION_QUEUE) return
  const now = dayjs().valueOf()
  await env.DB.prepare(`UPDATE social_post_jobs SET status='failed',last_error='retry_exhausted',updated_at=?
    WHERE status='pending' AND attempts>=? AND (lease_until IS NULL OR lease_until<?)`)
    .bind(now, MAX_ATTEMPTS, now)
    .run()
  const jobs = await env.DB.prepare(`SELECT id FROM social_post_jobs WHERE status='pending'
    AND available_at<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY created_at,id LIMIT 100`)
    .bind(now, now)
    .all<{ id: string }>()
  for (const job of jobs.results) {
    try {
      await env.EVENT_DETECTION_QUEUE.send({ kind: 'social', jobId: job.id })
    } catch {
      console.error('[social] queue submission failed')
    }
  }
}

export const processSocialJob = async (
  env: Bindings,
  jobId: string,
  deps: SocialDependencies = dependencies
): Promise<number | null> => {
  const now = dayjs().valueOf()
  const token = crypto.randomUUID()
  const claimed =
    await env.DB.prepare(`UPDATE social_post_jobs SET lease_token=?,lease_until=?,attempts=attempts+1,updated_at=?
    WHERE id=? AND status='pending' AND available_at<=? AND (lease_until IS NULL OR lease_until<?) AND attempts<?`)
      .bind(token, now + 300000, now, jobId, now, now, MAX_ATTEMPTS)
      .run()
  if (claimed.meta.changes !== 1) return null
  const raw = await env.DB.prepare(
    'SELECT id,channel,snapshot_json,attempts,lease_token FROM social_post_jobs WHERE id=? AND lease_token=?'
  )
    .bind(jobId, token)
    .first()
  const job = JobSchema.safeParse(raw)
  if (!job.success) throw new Error('Invalid social job')
  const complete = async (status: string, kind: string | null, id: string | null = null, retry = 0) => {
    await env.DB.prepare(
      `UPDATE social_post_jobs SET status=?,last_error=?,delivery_id=?,available_at=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`
    )
      .bind(status, kind, id, dayjs().valueOf() + retry * 1000, dayjs().valueOf(), jobId, token)
      .run()
  }
  const retry = async (kind: string, seconds: number): Promise<number | null> => {
    const delay = Math.min(Math.max(1, Math.ceil(seconds)), 43200)
    await complete(job.data.attempts < MAX_ATTEMPTS ? 'pending' : 'failed', kind, null, delay)
    return job.data.attempts < MAX_ATTEMPTS ? delay : null
  }
  const enabled = job.data.channel === 'x' ? env.X_POSTING_ENABLED === 'true' : env.DISCORD_POSTING_ENABLED === 'true'
  if (!enabled) {
    await complete('skipped', 'disabled')
    return null
  }
  const parsed = (() => {
    try {
      return SocialSnapshotSchema.safeParse(JSON.parse(job.data.snapshot_json))
    } catch {
      return SocialSnapshotSchema.safeParse(null)
    }
  })()
  if (!parsed.success) {
    await complete('failed', 'invalid_snapshot')
    return null
  }
  if (!(await isSocialSnapshotPublic(env, parsed.data))) {
    await complete('skipped', 'not_public')
    return null
  }
  // 1枚でも描画に失敗したら送信せず、投稿全体を再試行する（画像単位の再試行はしない）。
  const pngs = await renderSocialImages(env, deps.render, parsed.data).catch(() => null)
  if (pngs === null) return retry('image_failed', 30 * 2 ** job.data.attempts)
  // 配信開始を保存してから外部送信する。クラッシュ時の重複投稿を防ぐため再送は停止する。
  const started = await env.DB.prepare(
    `UPDATE social_post_jobs SET status='unknown',last_error='delivery_in_progress',updated_at=? WHERE id=? AND lease_token=? AND status='pending'`
  )
    .bind(dayjs().valueOf(), jobId, token)
    .run()
  if (started.meta.changes !== 1) return null
  try {
    // 描画中の非公開化も検出し、外部送信直前に現在の公開状態を再確認する。
    if (!(await isSocialSnapshotPublic(env, parsed.data))) {
      await complete('skipped', 'not_public')
      return null
    }
    const result = await deps.send(env, job.data.channel, parsed.data, pngs, jobId.replaceAll('-', '').slice(0, 24))
    if (result.status === 'sent') await complete('sent', null, result.id)
    else if (result.status === 'failed' && result.retry !== undefined) return retry(result.kind, result.retry)
    else await complete(result.status, result.kind)
  } catch {
    await complete('unknown', 'delivery_unknown')
  }
  return null
}

export const exhaustSocialJob = async (env: Bindings, jobId: string) => {
  await env.DB.prepare(
    "UPDATE social_post_jobs SET status='failed',last_error='retry_exhausted' WHERE id=? AND status='pending'"
  )
    .bind(jobId)
    .run()
}
