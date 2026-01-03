import { atom } from 'jotai'
import type { AckeyCampaign } from '@/schemas/ackey-campaign.dto'

/**
 * イベント一覧のアクティブタブ
 */
export const eventListActiveTabAtom = atom<AckeyCampaign['category']>('limited_card')

/**
 * イベント一覧の各タブのページ番号
 */
export const eventListPagesAtom = atom<Record<AckeyCampaign['category'], number>>({
  limited_card: 1,
  ackey: 1,
  other: 1
})
