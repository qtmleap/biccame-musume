import type { Bindings } from '@api/types/bindings'
import { type SocialSnapshot, snapshotEventIds } from '@biccame/shared/social'

/** D1 は1文あたりの束縛変数が100までなので、uuid をこれ以上は1回の問い合わせに載せられない。 */
const D1_MAX_BOUND_VARIABLES = 100

/**
 * 固定内容だけでなく現在の公開状態も確認し、削除・非公開化された画像を配信しない。
 * 「ほか N件」に隠れたイベントも含め、スナップショットに現れる全 uuid が公開済み（is_verified=1）であることを要求する。
 * 1投稿の uuid は多くても約50件なので1回の問い合わせで確認する。上限を超えたら黙って false にせず例外にする。
 */
export const isSocialSnapshotPublic = async (env: Bindings, snapshot: SocialSnapshot): Promise<boolean> => {
  const ids = snapshotEventIds(snapshot)
  if (ids.length === 0) return false
  if (ids.length > D1_MAX_BOUND_VARIABLES) {
    throw new Error(`Social snapshot has ${ids.length} event ids, over the D1 bound variable limit`)
  }
  const result = await env.DB.prepare(
    `SELECT id FROM events WHERE id IN (${ids.map(() => '?').join(',')}) AND is_verified = 1`
  )
    .bind(...ids)
    .all<{ id: string }>()
  return result.results.length === ids.length
}
