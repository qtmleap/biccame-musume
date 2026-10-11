import type { StoreKey } from '@/schemas/store.dto'
import type { BadgeArea } from './area-mapping'

export type BadgeCategory =
  | 'store'
  | 'area'
  | 'milestone'
  | 'event'
  | 'event_clear_store'
  | 'event_clear_area'
  | 'conquest'
  | 'vote'
  | 'special'

export type BadgeSubCategory =
  | 'visit'
  | 'area_any'
  | 'area_complete'
  | 'count'
  | 'event_count'
  | 'event_clear_at_store'
  | 'event_clear_area_any'
  | 'event_clear_area_complete'
  | 'event_clear_count'
  | 'event_clear_all'
  | 'all_areas_any_visit'
  | 'all_areas_any_event_clear'
  | 'vote_total'
  | 'special_multi_store_clear'
  | 'special_event_id'

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'

export type BadgeConditionMeta = {
  storeKey?: StoreKey
  region?: BadgeArea
  count?: number
  storeKeys?: StoreKey[]
  eventId?: string
}

export type BadgeDef = {
  code: string
  category: BadgeCategory
  subCategory: BadgeSubCategory
  name: string
  description: string
  hint: string
  rarity: BadgeRarity
  iconName: string
  sortOrder: number
  conditionMeta: BadgeConditionMeta
}
