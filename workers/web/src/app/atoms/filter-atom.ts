import type { Region } from '@biccame/shared/domain/regions'
import { atom } from 'jotai'

export type RegionType = Region

/**
 * キャラクター一覧専用の地域フィルター。
 * 初訪問は全国を表示し、イベント検索のURL条件とは共有しない。
 */
export const regionFilterAtom = atom<RegionType>('all')
