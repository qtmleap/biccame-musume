import { BADGE_TEMPLATES } from '@/locales/app.content'
import { formatTemplate } from '@/utils/template'
import type { SortOrderCounter } from './generation-helpers'
import type { BadgeDef, BadgeRarity } from './types'

export function buildEventCountBadges(next: SortOrderCounter): BadgeDef[] {
  const badges: BadgeDef[] = []

  // -----------------------------------------------------------------------
  // 4. Event participation milestone badges (31)
  //
  // Thresholds: 1, 5, then 10-step from 10 to 100 (10 entries),
  //             then 25-step from 125 to 575 (19 entries) = 31 total
  // Rarity grading:
  //   common:    1, 5, 10, 20, 30      (5 entries)
  //   rare:      40–100                (7 entries)
  //   epic:      125–300               (8 entries)
  //   legendary: 325–575               (11 entries)
  //
  // All entries use the auto-name pattern 'イベント X 件'.
  // -----------------------------------------------------------------------
  const EVENT_COUNT_NAMED: Record<number, string> = {}
  function eventCountRarity(count: number): BadgeRarity {
    if (count <= 30) return 'common'
    if (count <= 100) return 'rare'
    if (count <= 300) return 'epic'
    return 'legendary'
  }
  const EVENT_COUNT_THRESHOLDS: number[] = [
    1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400, 425, 450,
    475, 500, 525, 550, 575
  ]
  for (const count of EVENT_COUNT_THRESHOLDS) {
    const t = BADGE_TEMPLATES.eventCount
    const name = EVENT_COUNT_NAMED[count] ?? formatTemplate(t.name, { count })
    const rarity = eventCountRarity(count)
    badges.push({
      code: `event_count_${count}`,
      category: 'event',
      subCategory: 'event_count',
      name,
      description: formatTemplate(t.description, { count }),
      hint: formatTemplate(t.hint, { count }),
      rarity,
      iconName: 'CalendarCheck',
      sortOrder: next(),
      conditionMeta: { count }
    })
  }

  return badges
}

export function buildVoteTotalBadges(next: SortOrderCounter): BadgeDef[] {
  const badges: BadgeDef[] = []

  // -----------------------------------------------------------------------
  // 8. Vote total milestone badges (20)
  //
  // Thresholds: 1, 10, 20, ..., 90, 100, 200, ..., 1000 = 20 entries.
  // Rarity grading:
  //   common:    1, 10, 20, 30, 40, 50     (6 entries)
  //   rare:      60, 70, 80, 90, 100       (5 entries)
  //   epic:      200, 300, 400, 500, 600   (5 entries)
  //   legendary: 700, 800, 900, 1000       (4 entries)
  // -----------------------------------------------------------------------
  const VOTE_TOTAL_NAMED: Record<number, string> = {}
  function voteTotalRarity(count: number): BadgeRarity {
    if (count <= 50) return 'common'
    if (count <= 100) return 'rare'
    if (count <= 600) return 'epic'
    return 'legendary'
  }
  const VOTE_TOTAL_THRESHOLDS: number[] = [
    1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000
  ]
  for (const count of VOTE_TOTAL_THRESHOLDS) {
    const t = BADGE_TEMPLATES.voteTotal
    const name = VOTE_TOTAL_NAMED[count] ?? formatTemplate(t.name, { count })
    const rarity = voteTotalRarity(count)
    badges.push({
      code: `vote_total_${count}`,
      category: 'vote',
      subCategory: 'vote_total',
      name,
      description: formatTemplate(t.description, { count }),
      hint: formatTemplate(t.hint, { count }),
      rarity,
      iconName: 'Vote',
      sortOrder: next(),
      conditionMeta: { count }
    })
  }

  return badges
}
