import type { Badge } from '@prisma/client'
import type { Bindings } from '@/types/bindings'

/**
 * 評価関数が返した Badge[] を UserPushDO 経由でクライアントに push する。
 * 接続中の WS には即送信、 未接続なら DO 内部の pending: バッファに 5 分積む。
 * 失敗しても caller 側のトランザクションを汚さないよう例外は飲み込む
 * (バッジ獲得 toast は UX 上のおまけであって、 ここで throw すると waitUntil
 * の他処理にも波及するため)。
 */
export const pushEarnedBadges = async (env: Bindings, userId: string, badges: Badge[]): Promise<void> => {
  if (badges.length === 0) return
  try {
    const stub = env.USER_PUSH.get(env.USER_PUSH.idFromName(userId))
    await Promise.all(
      badges.map((b) =>
        stub.pushBadge({
          code: b.code,
          name: b.name,
          description: b.description,
          iconName: b.iconName,
          rarity: b.rarity
        })
      )
    )
  } catch (err) {
    console.error('[badge-push] failed to push badges:', err)
  }
}
