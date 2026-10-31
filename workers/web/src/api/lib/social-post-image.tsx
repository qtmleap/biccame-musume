import type { AvatarImages } from '@api/lib/og-avatars'
import type { OgImageHeight } from '@api/lib/og-event-image'
import type { TextMetrics } from '@api/lib/og-text-metrics'
import type { EventCharacter } from '@biccame/shared/schemas/event.dto'
import type { SocialImage } from '@biccame/shared/social'
import { EventImageBody } from './social-post-event-image'
import { ROW_AVATAR_LIMIT, type SocialImageKind } from './social-post-image-common'
import { SummaryImageBody } from './social-post-summary-image'

export { clusterSlots, eventAvatarSlots, eventStoreCount, eventTitleLayout } from './social-post-event-image'
export type { SocialImageKind } from './social-post-image-common'
export { storeChunks } from './social-post-image-common'
export {
  dateColumnWidth,
  planSummaryRow,
  type SummaryRowLayout,
  summaryTitleLayout
} from './social-post-summary-layout'

/** 投稿画像1枚ぶんを描画する。入力スナップショット以外のデータは取得しない。 */
/** 追加・更新は 1200x630、毎朝・毎週（0件側を含む）は 1200x675。 */
export const socialImageHeight = (image: SocialImage): OgImageHeight => (image.type === 'event' ? 630 : 675)

/** 画像に描く娘（Avatar の読み込み対象）。 */
export const socialImageCharacters = (image: SocialImage): EventCharacter[] => {
  switch (image.type) {
    case 'event':
      return image.event.avatars
    case 'summary':
      return image.rows.flatMap((row) => row.avatars.slice(0, ROW_AVATAR_LIMIT))
    case 'empty':
      return []
  }
}

export type SocialPostImageProps = {
  /** 投稿の種類。追加・更新の色と、毎朝・毎週の文言を決める（画像からは読み取れない）。 */
  kind: SocialImageKind
  image: SocialImage
  metrics: TextMetrics
  avatars: AvatarImages
}

export const SocialPostImage = ({ kind, image, metrics, avatars }: SocialPostImageProps) =>
  image.type === 'event' ? (
    <EventImageBody kind={kind} image={image} metrics={metrics} avatars={avatars} />
  ) : (
    <SummaryImageBody kind={kind} image={image} metrics={metrics} avatars={avatars} />
  )
