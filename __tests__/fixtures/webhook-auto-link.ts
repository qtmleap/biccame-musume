import { insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import dayjs from 'dayjs'
import { z } from 'zod'
import { seedTargetEvent } from './webhook-link-ended'
import { candidateOf, ENDED, type Status, setup, type Value } from './webhook-linked-event'
import { makePost } from './webhook-multiple-events'

// 終了・継続の投稿の自動連携（提案の確率がしきい値以上で、保留の理由が状態だけのとき）の統合テストが共有するセットアップ。
// 判定の投稿は 2026-10-11T00:00Z（日本時間 9 時）なので、終了で書く ended_at は日本時間 10-11 の 0 時。

/** 終了の投稿（judge の既定の投稿日時）で連携先に書く ended_at。日本時間 2026-10-11 0 時。 */
export const ENDED_AT = '2026-10-10T15:00:00.000+00:00'

/** 連携先の更新投稿の有効なチャネル。 */
export type Channels = { x?: string; discord?: string }

/**
 * 連携提案つきのセットアップ。更新投稿のチャネルのフラグを付け、キューに積まれたメッセージを sent へ記録する（即時回収の確認用）。
 * 提案の確率の既定は 0.95（自動連携のしきい値以上）。確率を下げる・提案を消すテストは value.linked を書き換える。
 */
export const setupAuto = async (name: string, status: Status, channels: Channels = { x: 'true', discord: 'false' }) => {
  const value = await setup(name, status)
  const sent: unknown[] = []
  Object.assign(value.env, {
    X_POSTING_ENABLED: channels.x,
    DISCORD_POSTING_ENABLED: channels.discord,
    EVENT_DETECTION_QUEUE: {
      send: async (message: unknown) => {
        sent.push(message)
      }
    }
  })
  value.linked.probability = 0.95
  return { ...value, sent }
}
export type AutoValue = Awaited<ReturnType<typeof setupAuto>>

/** 公開済みの連携先イベント（akiba・限定名刺・日本時間 10-11 開始）を作り、3 段目の AI がそれを選ぶようにする。 */
export const seedLinkable = async (value: AutoValue, index: number) => {
  const seeded = await seedTargetEvent(value.env, index)
  value.linked.pick = seeded.eventId
  return seeded
}

/** 投稿者が店舗の公式アカウントでない場合などに使う、judge と同じ投稿（本文・店舗を指定して判定まで流す）。 */
export const judgeIn = async (
  env: Value['env'],
  id: string,
  options: { stores?: string[]; text?: string; screenName?: string } = {}
) => {
  const text = options.text === undefined ? ENDED : options.text
  const screenName = options.screenName === undefined ? 'bic_akiba' : options.screenName
  const stores = options.stores === undefined ? ['akiba'] : options.stores
  const post = { ...makePost(id, text), screenName, url: `https://x.com/${screenName}/status/${id}` }
  await insertWebhookJob(env, post)
  await processWebhookJob(env, post.id, {
    extractor: async () => ({ events: [{ item: '限定名刺', stores, characterIds: ['akiba'], evidence: [text] }] })
  })
  return post
}

export const eventRow = (value: Pick<Value, 'env'>, id: string) =>
  value.env.DB.prepare('SELECT ended_at,updated_at FROM events WHERE id=?').bind(id).first<{
    ended_at: string | null
    updated_at: string
  }>()

/** 候補の行（DB の生の値）。通知の状態と、保存した判定結果を読む。 */
export const candidateRow = (value: Pick<Value, 'env'>, postId: string) =>
  value.env.DB.prepare(
    'SELECT status,event_id,reasons_json,notification_status,last_error,result_json FROM webhook_event_candidates WHERE post_id=?'
  )
    .bind(postId)
    .first<{
      status: string
      event_id: string | null
      reasons_json: string
      notification_status: string
      last_error: string | null
      result_json: string | null
    }>()

/** 判定が保存した理由（result_json の reasons）。連携すると reasons_json は auto_linked に置き換わるので、判定の理由はこちらで確かめる。 */
export const judgedReasons = async (value: Pick<Value, 'env'>, postId: string) => {
  const row = await candidateRow(value, postId)
  const parsed = z.object({ reasons: z.array(z.string().nonempty()) }).safeParse(JSON.parse(String(row?.result_json)))
  if (!parsed.success) throw new Error('Invalid stored result')
  return parsed.data.reasons
}

/** 保存済みの提案の確率を書き換えて、途中で落ちた再試行（保存済みの判定結果を使う経路）の状態にする。 */
export const rewindToStoredResult = async (value: Pick<Value, 'env'>, postId: string, probability: number) => {
  await value.env.DB.prepare(
    `UPDATE webhook_event_candidates SET status='queued',reasons_json='[]',notification_status='pending',
      lease_token=NULL,lease_until=NULL,updated_at=?,
      result_json=json_set(result_json,'$.discovery.linkedEvent.probability',?) WHERE post_id=?`
  )
    .bind(dayjs().valueOf(), probability, postId)
    .run()
  await value.env.DB.prepare(
    "UPDATE webhook_event_jobs SET status='queued',notification_status='pending',lease_token=NULL,lease_until=NULL WHERE post_id=?"
  )
    .bind(postId)
    .run()
}

export { candidateOf }

/**
 * 連携先の読み取り（planEndedLink の SELECT updated_at,ended_at,start_date FROM events）が返った直後に run を実行する。
 * 読み取りの後に別経路が割り込んだ状況（連携先の更新・削除）や、その先の D1 の失敗を再現する。fired で実際に割り込んだことを確かめる。
 */
export const afterEventRead = (value: Pick<Value, 'env'>, run: () => Promise<void>) => {
  const state = { fired: false }
  const original = value.env.DB
  const watched = (statement: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(statement, {
      get: (target, property) => {
        if (property === 'bind') return (...values: unknown[]) => watched(target.bind(...values))
        if (property === 'first')
          return async (...args: unknown[]) => {
            const row = await Reflect.apply(Reflect.get(target, 'first'), target, args)
            state.fired = true
            await run()
            return row
          }
        const member = Reflect.get(target, property)
        return typeof member === 'function' ? member.bind(target) : member
      }
    })
  const db = new Proxy(original, {
    get: (target, property) => {
      if (property === 'prepare')
        return (sql: string) =>
          sql.startsWith('SELECT updated_at,ended_at,start_date FROM events')
            ? watched(target.prepare(sql))
            : target.prepare(sql)
      const member = Reflect.get(target, property)
      return typeof member === 'function' ? member.bind(target) : member
    }
  })
  Object.assign(value.env, { DB: db })
  return {
    state,
    restore: () => {
      Object.assign(value.env, { DB: original })
    }
  }
}
