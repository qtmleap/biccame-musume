import { atom } from 'jotai'
import type { AckeyCampaign } from '@/schemas/ackey-campaign.dto'

/**
 * アクキー配布キャンペーン一覧のAtom（ローカル状態管理）
 */
export const ackeyCampaignsAtom = atom<AckeyCampaign[]>([])

/**
 * 選択中のアクキー配布キャンペーンのAtom
 */
export const selectedAckeyCampaignAtom = atom<AckeyCampaign | null>(null)
