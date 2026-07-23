import { describe, expect, test } from 'bun:test'
import { BADGE_REGISTRY } from '../src/data/badges/registry'
import { ACTIVE_PHYSICAL_STORE_KEYS } from '../src/data/badges/store-exclusion'

describe('BADGE_REGISTRY size sanity', () => {
  // 以前は registry.ts の module load 時に throw していたが、
  // 店舗の増減で全 API が 500 になるリスクがあったため、ここに移した。
  test('size is within expected range [310, 320]', () => {
    expect(BADGE_REGISTRY.length).toBeGreaterThanOrEqual(310)
    expect(BADGE_REGISTRY.length).toBeLessThanOrEqual(320)
  })
})

describe('milestone conquest badges reflect ACTIVE store count', () => {
  // 閉店店舗を除いた現役店舗数を「N 店舗中 N 到達」の N として使うこと。
  // ここが PHYSICAL_STORE_KEYS.length に戻ると mythic バッジが永久未達になる。
  const activeCount = ACTIVE_PHYSICAL_STORE_KEYS.length

  test('milestone_visit_count_all has count === active store count', () => {
    const badge = BADGE_REGISTRY.find((b) => b.code === 'milestone_visit_count_all')
    expect(badge).toBeDefined()
    expect(badge?.conditionMeta.count).toBe(activeCount)
  })

  test('milestone_clear_count_all has count === active store count', () => {
    const badge = BADGE_REGISTRY.find((b) => b.code === 'milestone_clear_count_all')
    expect(badge).toBeDefined()
    expect(badge?.conditionMeta.count).toBe(activeCount)
  })

  test('milestone_visit_count_* steps stay strictly below active store count', () => {
    const steps = BADGE_REGISTRY.filter(
      (b) => b.code.startsWith('milestone_visit_count_') && b.code !== 'milestone_visit_count_all'
    ).map((b) => b.conditionMeta.count ?? 0)
    for (const s of steps) {
      expect(s).toBeLessThan(activeCount)
    }
  })

  test('milestone_clear_count_* steps stay strictly below active store count', () => {
    const steps = BADGE_REGISTRY.filter(
      (b) => b.code.startsWith('milestone_clear_count_') && b.code !== 'milestone_clear_count_all'
    ).map((b) => b.conditionMeta.count ?? 0)
    for (const s of steps) {
      expect(s).toBeLessThan(activeCount)
    }
  })
})
