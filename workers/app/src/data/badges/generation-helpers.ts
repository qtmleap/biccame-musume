import type { StoreKey } from '@/schemas/store.dto'
import { type BadgeArea, storeKeyToBadgeArea } from './area-mapping'
import { ACTIVE_PHYSICAL_STORE_KEYS } from './store-exclusion'

export type SortOrderCounter = () => number

// Generate milestone counts for population N.
// Returns [5, 10, 15, ..., M] where M is the largest multiple of 5 strictly less than N.
export function milestoneSteps(n: number): number[] {
  const steps: number[] = []
  for (let i = 5; i < n; i += 5) {
    steps.push(i)
  }
  return steps
}

// All areas in stable order.
export const ALL_AREAS: BadgeArea[] = [
  'hokkaido',
  'kanto_north',
  'chiba',
  'tokyo_metro',
  'shinjuku_shibuya',
  'ikebukuro',
  'kanagawa',
  'chubu',
  'sanyo_kinki',
  'kyushu'
]

// Stores grouped by area (computed once).
// 現役店舗のみで集計。エリアの storeCount 表示と area_complete 系の判定基準を揃える。
export const STORES_BY_AREA: Record<BadgeArea, StoreKey[]> = (() => {
  const map = {} as Record<BadgeArea, StoreKey[]>
  for (const area of ALL_AREAS) {
    map[area] = []
  }
  for (const key of ACTIVE_PHYSICAL_STORE_KEYS) {
    map[storeKeyToBadgeArea[key]].push(key)
  }
  return map
})()
