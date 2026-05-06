import { describe, expect, test } from 'bun:test'
import { BADGE_REGISTRY } from '../../src/data/badges/registry'
import { PHYSICAL_STORE_KEYS } from '../../src/data/badges/store-exclusion'

// The vote-unique diversity series uses BICCAME_MUSUME_COUNT=50
const BICCAME_MUSUME_COUNT = 50

describe('badge registry', () => {
  test('has unique codes', () => {
    const codes = BADGE_REGISTRY.map((b) => b.code)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })

  test('total badge count is in expected range [230, 250]', () => {
    expect(BADGE_REGISTRY.length).toBeGreaterThanOrEqual(230)
    expect(BADGE_REGISTRY.length).toBeLessThanOrEqual(250)
  })

  test('every physical store has a visit badge', () => {
    const codes = new Set(BADGE_REGISTRY.map((b) => b.code))
    for (const storeKey of PHYSICAL_STORE_KEYS) {
      expect(codes.has(`store_visit_${storeKey}`)).toBe(true)
    }
  })

  test('every physical store has an event_clear_at_store badge', () => {
    const codes = new Set(BADGE_REGISTRY.map((b) => b.code))
    for (const storeKey of PHYSICAL_STORE_KEYS) {
      expect(codes.has(`event_clear_at_store_${storeKey}`)).toBe(true)
    }
  })

  test('visit milestone counts follow the 5-step rule', () => {
    const n = PHYSICAL_STORE_KEYS.length
    // expected steps: 5, 10, ..., M where M = largest multiple of 5 strictly < n
    const expectedSteps: number[] = []
    for (let i = 5; i < n; i += 5) {
      expectedSteps.push(i)
    }

    const milestoneBadges = BADGE_REGISTRY.filter((b) => b.subCategory === 'count' && b.code !== 'milestone_count_all')
    const actualCounts = milestoneBadges.map((b) => b.conditionMeta.count as number).sort((a, b) => a - b)

    expect(actualCounts).toEqual(expectedSteps)
  })

  test('visit milestone has a completion badge at exactly N (all stores)', () => {
    const n = PHYSICAL_STORE_KEYS.length
    const allBadge = BADGE_REGISTRY.find((b) => b.code === 'milestone_count_all')
    expect(allBadge).toBeDefined()
    expect(allBadge?.conditionMeta.count).toBe(n)
    expect(allBadge?.rarity).toBe('legendary')
  })

  test('event_clear_count milestones follow the same 5-step rule', () => {
    const n = PHYSICAL_STORE_KEYS.length
    const expectedSteps: number[] = []
    for (let i = 5; i < n; i += 5) {
      expectedSteps.push(i)
    }

    const clearCountBadges = BADGE_REGISTRY.filter((b) => b.subCategory === 'event_clear_count')
    const actualCounts = clearCountBadges.map((b) => b.conditionMeta.count as number).sort((a, b) => a - b)

    expect(actualCounts).toEqual(expectedSteps)
  })

  test('vote_unique milestones follow the 5-step rule against BICCAME_MUSUME_COUNT (50)', () => {
    const n = BICCAME_MUSUME_COUNT
    const expectedSteps: number[] = []
    for (let i = 5; i < n; i += 5) {
      expectedSteps.push(i)
    }

    const uniqueBadges = BADGE_REGISTRY.filter((b) => b.subCategory === 'vote_unique')
    const actualCounts = uniqueBadges.map((b) => b.conditionMeta.count as number).sort((a, b) => a - b)

    expect(actualCounts).toEqual(expectedSteps)
  })

  test('vote_all_biccame completion badge exists with legendary rarity', () => {
    const allBadge = BADGE_REGISTRY.find((b) => b.subCategory === 'vote_all_biccame')
    expect(allBadge).toBeDefined()
    expect(allBadge?.rarity).toBe('legendary')
  })

  test('every badge has a non-empty code, name, description, hint, iconName', () => {
    for (const b of BADGE_REGISTRY) {
      expect(b.code.length).toBeGreaterThan(0)
      expect(b.name.length).toBeGreaterThan(0)
      expect(b.description.length).toBeGreaterThan(0)
      expect(b.hint.length).toBeGreaterThan(0)
      expect(b.iconName.length).toBeGreaterThan(0)
    }
  })

  test('every badge rarity is one of the four allowed values', () => {
    const allowed = new Set(['common', 'rare', 'epic', 'legendary'])
    for (const b of BADGE_REGISTRY) {
      expect(allowed.has(b.rarity)).toBe(true)
    }
  })

  test('uses only positive-language naming — no banned words', () => {
    const banned = ['中毒', 'ガチ勢', '布教', 'ヘビー']
    for (const b of BADGE_REGISTRY) {
      for (const bad of banned) {
        expect(b.name).not.toContain(bad)
      }
    }
  })

  test('event participation badges (event_count) have 59 entries covering 1, 5, 10–570 in 10-steps', () => {
    const eventBadges = BADGE_REGISTRY.filter((b) => b.subCategory === 'event_count')
    expect(eventBadges).toHaveLength(59)
    const counts = eventBadges.map((b) => b.conditionMeta.count as number).sort((a, b) => a - b)
    const expected = [1, 5, ...Array.from({ length: 57 }, (_, i) => 10 + i * 10)]
    expect(counts).toEqual(expected)
  })

  test('vote_total badges have counts [1, 10, 50, 100, 500]', () => {
    const totalBadges = BADGE_REGISTRY.filter((b) => b.subCategory === 'vote_total')
    const counts = totalBadges.map((b) => b.conditionMeta.count as number).sort((a, b) => a - b)
    expect(counts).toEqual([1, 10, 50, 100, 500])
  })

  test('vote_devotion badges have counts [10, 100]', () => {
    const devotionBadges = BADGE_REGISTRY.filter((b) => b.subCategory === 'vote_devotion')
    const counts = devotionBadges.map((b) => b.conditionMeta.count as number).sort((a, b) => a - b)
    expect(counts).toEqual([10, 100])
  })

  test('area badges: 10 area_any and 10 area_complete badges', () => {
    const anyBadges = BADGE_REGISTRY.filter((b) => b.subCategory === 'area_any')
    const completeBadges = BADGE_REGISTRY.filter((b) => b.subCategory === 'area_complete')
    expect(anyBadges).toHaveLength(10)
    expect(completeBadges).toHaveLength(10)
  })

  test('event_clear area badges: 10 area_any and 10 area_complete', () => {
    const anyBadges = BADGE_REGISTRY.filter((b) => b.subCategory === 'event_clear_area_any')
    const completeBadges = BADGE_REGISTRY.filter((b) => b.subCategory === 'event_clear_area_complete')
    expect(anyBadges).toHaveLength(10)
    expect(completeBadges).toHaveLength(10)
  })

  test('sortOrder values are unique', () => {
    const orders = BADGE_REGISTRY.map((b) => b.sortOrder)
    const unique = new Set(orders)
    expect(unique.size).toBe(orders.length)
  })

  test('visit badges for physical stores have storeKey in conditionMeta', () => {
    const visitBadges = BADGE_REGISTRY.filter((b) => b.subCategory === 'visit')
    for (const b of visitBadges) {
      const sk = b.conditionMeta.storeKey
      expect(sk).toBeDefined()
      if (sk !== undefined) {
        expect((PHYSICAL_STORE_KEYS as readonly string[]).includes(sk)).toBe(true)
      }
    }
  })

  test('area badges have region in conditionMeta', () => {
    const areaBadges = BADGE_REGISTRY.filter((b) => b.subCategory === 'area_any' || b.subCategory === 'area_complete')
    for (const b of areaBadges) {
      expect(b.conditionMeta.region).toBeDefined()
    }
  })
})
