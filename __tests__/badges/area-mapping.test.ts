import { describe, expect, test } from 'bun:test'
import { type BadgeArea, storeKeyToBadgeArea } from '../../src/data/badges/area-mapping'
import { EXCLUDED_STORE_KEYS, PHYSICAL_STORE_KEYS } from '../../src/data/badges/store-exclusion'
import { StoreKeySchema } from '../../src/schemas/store.dto'

const ALL_STORE_KEYS = StoreKeySchema.options

const ALL_BADGE_AREAS: BadgeArea[] = [
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

describe('area mapping', () => {
  test('every PHYSICAL_STORE_KEY appears in storeKeyToBadgeArea', () => {
    for (const key of PHYSICAL_STORE_KEYS) {
      expect(storeKeyToBadgeArea).toHaveProperty(key)
    }
  })

  test('every PHYSICAL_STORE_KEY maps to a valid BadgeArea', () => {
    const validAreas = new Set<BadgeArea>(ALL_BADGE_AREAS)
    for (const key of PHYSICAL_STORE_KEYS) {
      const area = storeKeyToBadgeArea[key]
      expect(validAreas.has(area)).toBe(true)
    }
  })

  test('every BadgeArea has at least one physical store assigned to it', () => {
    const areaStores = new Map<BadgeArea, string[]>()
    for (const area of ALL_BADGE_AREAS) {
      areaStores.set(area, [])
    }
    for (const key of PHYSICAL_STORE_KEYS) {
      const area = storeKeyToBadgeArea[key]
      areaStores.get(area)?.push(key)
    }
    for (const area of ALL_BADGE_AREAS) {
      const stores = areaStores.get(area) ?? []
      expect(stores.length).toBeGreaterThan(0)
    }
  })

  test('EXCLUDED_STORE_KEYS plus PHYSICAL_STORE_KEYS covers all StoreKeys exactly', () => {
    const all = new Set(ALL_STORE_KEYS)
    const physical = new Set<string>(PHYSICAL_STORE_KEYS)
    const excluded = new Set<string>(EXCLUDED_STORE_KEYS)

    // Every store key must be either physical or excluded — never both, never neither.
    for (const key of all) {
      const isPhysical = physical.has(key)
      const isExcluded = excluded.has(key)
      // exactly one of the two must be true
      expect(isPhysical !== isExcluded).toBe(true)
    }

    // The union of physical + excluded must equal the full set.
    const union = new Set([...physical, ...excluded])
    expect(union.size).toBe(all.size)
  })

  test('excluded store keys are not in PHYSICAL_STORE_KEYS', () => {
    const physical = new Set<string>(PHYSICAL_STORE_KEYS)
    for (const key of EXCLUDED_STORE_KEYS) {
      expect(physical.has(key)).toBe(false)
    }
  })

  test('storeKeyToBadgeArea covers all StoreKey values (including excluded)', () => {
    // The record is typed as Record<StoreKey, BadgeArea> so all keys must be present.
    for (const key of ALL_STORE_KEYS) {
      expect(storeKeyToBadgeArea).toHaveProperty(key)
    }
  })
})
