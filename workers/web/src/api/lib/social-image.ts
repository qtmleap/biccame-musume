import { loadAvatars } from '@api/lib/og-avatars'
import { loadOgFonts, renderOgPng } from '@api/lib/og-event-image'
import { textMetricsFor } from '@api/lib/og-text-metrics'
import { SocialPostImage, socialImageCharacters, socialImageHeight } from '@api/lib/social-post-image'
import type { Bindings } from '@api/types/bindings'
import type { SocialSnapshot } from '@biccame/shared/social'
import { createElement } from 'react'

const ASSET_ORIGIN = 'https://biccame-musume.com'

/**
 * スナップショットの index 枚目（0 起点）の画像を PNG にする。
 * 保存された内容だけで描き、データベースは触らない。index が範囲外なら例外にする。
 */
export const renderSocialImage = async (
  env: Bindings,
  snapshot: SocialSnapshot,
  index: number
): Promise<Uint8Array<ArrayBuffer>> => {
  const image = Number.isInteger(index) ? snapshot.images[index] : undefined
  if (image === undefined) throw new Error(`Social image index is out of range: ${index}`)
  const fonts = await loadOgFonts(env, ASSET_ORIGIN)
  const avatars = await loadAvatars(env, ASSET_ORIGIN, socialImageCharacters(image))
  return renderOgPng(
    env,
    ASSET_ORIGIN,
    createElement(SocialPostImage, { kind: snapshot.kind, image, metrics: textMetricsFor(fonts), avatars }),
    socialImageHeight(image)
  )
}
