import { BADGE_TEMPLATES } from '@/locales/app.content'
import type { StoreKey } from '@/schemas/store.dto'
import { formatTemplate } from '@/utils/template'
import { BADGE_AREA_LABELS, type BadgeArea, storeKeyToBadgeArea } from './area-mapping'
import { PHYSICAL_STORE_KEYS } from './store-exclusion'

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

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary'

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

// Human-readable store names for each physical store key.
const STORE_DISPLAY_NAMES: Record<StoreKey, string> = {
  abeno: 'あべのキューズモール店',
  akasaka: '赤坂見附駅店',
  akiba: 'AKIBA店',
  bicqlo: '新宿東口店',
  camera: '池袋東口カメラ館',
  chiba: '千葉駅前店',
  chofu: '京王調布店',
  fujisawa: '藤沢店',
  funabashi: '船橋駅FACE店',
  funato: '船橋東武店',
  hachioji: 'JR八王子駅店',
  hamamatsu: '浜松店',
  hiroshima: '広島駅前店',
  honten: '池袋本店',
  ikenishi: '池袋西口店',
  itt: '池袋西口IT tower店',
  kagoshima: '鹿児島中央駅店',
  kashiwa: '柏店',
  kawasaki: 'ラゾーナ川崎店',
  kumamoto: 'アミュプラザくまもと店',
  kyoto: 'JR京都駅店',
  machida: '町田店',
  mito: '水戸駅店',
  nagoya: '名古屋駅西店',
  nagoyagate: '名古屋JRゲートタワー店',
  nanba: 'なんば店',
  niigata: '新潟店',
  ohmiya: '大宮西口そごう店',
  okayama: '岡山駅前店',
  photo: '池袋フォトスタジオ',
  pkan: '池袋カメラ・パソコン館',
  sagami: '相模大野駅店',
  sapporo: '札幌店',
  seiseki: '聖蹟桜ヶ丘駅店',
  shibuhachi: '渋谷ハチ公口店',
  shibuto: '渋谷東口店',
  shinjyuku: '新宿西口店',
  shintou: '新宿東口駅前店',
  shinyoko: '新横浜店',
  tachikawa: '立川店',
  takasaki: '高崎東口店',
  takatsuki: '高槻阪急スクエア店',
  tamapla: 'イトーヨーカドーたまプラーザ店',
  tenjin: '天神1号館',
  tenjin2: '天神2号館',
  tokorozawa: '所沢駅店',
  yao: 'アリオ八尾店',
  yokonishi: '横浜西口店',
  yuurakuchou: '有楽町店',
  // excluded keys — not physical stores, but required to satisfy Record<StoreKey, string>
  biccamera: 'ビックカメラ',
  bicsim: 'ビックシム',
  naisen: 'ナイセン',
  oeraitan: 'お偉いたん',
  prosta: '池袋西口プロスタジアム'
}

// Generate milestone counts for population N.
// Returns [5, 10, 15, ..., M] where M is the largest multiple of 5 strictly less than N.
function milestoneSteps(n: number): number[] {
  const steps: number[] = []
  for (let i = 5; i < n; i += 5) {
    steps.push(i)
  }
  return steps
}

// Rarity for store/event_clear visit milestones by position (0-based index in steps array).
function visitMilestoneRarity(index: number, totalSteps: number): BadgeRarity {
  const position = index / totalSteps
  if (position < 0.4) return 'common'
  if (position < 0.75) return 'rare'
  return 'epic'
}

// All areas in stable order.
const ALL_AREAS: BadgeArea[] = [
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
const STORES_BY_AREA: Record<BadgeArea, StoreKey[]> = (() => {
  const map = {} as Record<BadgeArea, StoreKey[]>
  for (const area of ALL_AREAS) {
    map[area] = []
  }
  for (const key of PHYSICAL_STORE_KEYS) {
    map[storeKeyToBadgeArea[key]].push(key)
  }
  return map
})()

function getBadgeRegistry(): BadgeDef[] {
  const badges: BadgeDef[] = []
  let sortOrder = 0

  const next = () => ++sortOrder

  // -----------------------------------------------------------------------
  // 1. Store visit badges (~50)
  // -----------------------------------------------------------------------
  for (const storeKey of PHYSICAL_STORE_KEYS) {
    const storeName = STORE_DISPLAY_NAMES[storeKey]
    const t = BADGE_TEMPLATES.storeVisit
    badges.push({
      code: `store_visit_${storeKey}`,
      category: 'store',
      subCategory: 'visit',
      name: formatTemplate(t.name, { storeName }),
      description: formatTemplate(t.description, { storeName }),
      hint: formatTemplate(t.hint, { storeName }),
      rarity: 'common',
      iconName: 'MapPin',
      sortOrder: next(),
      conditionMeta: { storeKey }
    })
  }

  // -----------------------------------------------------------------------
  // 2. Area visit badges — area_any (10) + area_complete (10)
  // -----------------------------------------------------------------------
  for (const area of ALL_AREAS) {
    const areaLabel = BADGE_AREA_LABELS[area]
    const t = BADGE_TEMPLATES.areaAny
    badges.push({
      code: `area_any_${area}`,
      category: 'area',
      subCategory: 'area_any',
      name: formatTemplate(t.name, { areaLabel }),
      description: formatTemplate(t.description, { areaLabel }),
      hint: formatTemplate(t.hint, { areaLabel }),
      rarity: 'common',
      iconName: 'Navigation',
      sortOrder: next(),
      conditionMeta: { region: area }
    })
  }
  for (const area of ALL_AREAS) {
    const areaLabel = BADGE_AREA_LABELS[area]
    const storeCount = STORES_BY_AREA[area].length
    const t = BADGE_TEMPLATES.areaComplete
    badges.push({
      code: `area_complete_${area}`,
      category: 'area',
      subCategory: 'area_complete',
      name: formatTemplate(t.name, { areaLabel, storeCount }),
      description: formatTemplate(t.description, { areaLabel, storeCount }),
      hint: formatTemplate(t.hint, { areaLabel, storeCount }),
      rarity: 'rare',
      iconName: 'Trophy',
      sortOrder: next(),
      conditionMeta: { region: area }
    })
  }

  // -----------------------------------------------------------------------
  // 3. Store visit milestone badges
  // -----------------------------------------------------------------------
  const physicalCount = PHYSICAL_STORE_KEYS.length
  const visitSteps = milestoneSteps(physicalCount)
  for (let i = 0; i < visitSteps.length; i++) {
    const count = visitSteps[i]
    const rarity = visitMilestoneRarity(i, visitSteps.length)
    const t = BADGE_TEMPLATES.visitMilestone
    badges.push({
      code: `milestone_visit_count_${count}`,
      category: 'milestone',
      subCategory: 'count',
      name: formatTemplate(t.name, { count }),
      description: formatTemplate(t.description, { count }),
      hint: formatTemplate(t.hint, { count }),
      rarity,
      iconName: 'Star',
      sortOrder: next(),
      conditionMeta: { count }
    })
  }
  // "All stores" completion badge
  const visitAllT = BADGE_TEMPLATES.visitMilestoneAll
  badges.push({
    code: 'milestone_visit_count_all',
    category: 'conquest',
    subCategory: 'count',
    name: formatTemplate(visitAllT.name, { totalStores: physicalCount }),
    description: formatTemplate(visitAllT.description, { totalStores: physicalCount }),
    hint: formatTemplate(visitAllT.hint, { totalStores: physicalCount }),
    rarity: 'legendary',
    iconName: 'Crown',
    sortOrder: next(),
    conditionMeta: { count: physicalCount }
  })
  // "All areas visited" meta badge
  const visitAreasT = BADGE_TEMPLATES.visitAllAreas
  badges.push({
    code: 'milestone_visit_areas',
    category: 'conquest',
    subCategory: 'all_areas_any_visit',
    name: visitAreasT.name,
    description: visitAreasT.description,
    hint: visitAreasT.hint,
    rarity: 'epic',
    iconName: 'Globe',
    sortOrder: next(),
    conditionMeta: {}
  })

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

  // -----------------------------------------------------------------------
  // 5. Per-store event clear badges (50 stores × 3 thresholds = 150)
  //
  // Thresholds: 1 (common), 5 (rare), 10 (epic).
  // count=1 は既存コード `event_clear_at_store_${storeKey}` を維持。
  // -----------------------------------------------------------------------
  const EVENT_CLEAR_AT_STORE_TIERS: { count: number; rarity: BadgeRarity }[] = [
    { count: 1, rarity: 'common' },
    { count: 5, rarity: 'rare' },
    { count: 10, rarity: 'epic' }
  ]
  for (const storeKey of PHYSICAL_STORE_KEYS) {
    const storeName = STORE_DISPLAY_NAMES[storeKey]
    for (const tier of EVENT_CLEAR_AT_STORE_TIERS) {
      const isFirst = tier.count === 1
      const t = isFirst ? BADGE_TEMPLATES.eventClearAtStore : BADGE_TEMPLATES.eventClearAtStoreMultiple
      const code = isFirst ? `event_clear_at_store_${storeKey}` : `event_clear_at_store_${storeKey}_${tier.count}`
      const vars = { storeName, count: tier.count }
      badges.push({
        code,
        category: 'event_clear_store',
        subCategory: 'event_clear_at_store',
        name: formatTemplate(t.name, vars),
        description: formatTemplate(t.description, vars),
        hint: formatTemplate(t.hint, vars),
        rarity: tier.rarity,
        iconName: 'MapPinCheck',
        sortOrder: next(),
        conditionMeta: { storeKey, ...(isFirst ? {} : { count: tier.count }) }
      })
    }
  }

  // -----------------------------------------------------------------------
  // 6. Area event clear badges — area_any (10) + area_complete (10)
  // -----------------------------------------------------------------------
  for (const area of ALL_AREAS) {
    const areaLabel = BADGE_AREA_LABELS[area]
    const t = BADGE_TEMPLATES.eventClearAreaAny
    badges.push({
      code: `event_clear_area_any_${area}`,
      category: 'event_clear_area',
      subCategory: 'event_clear_area_any',
      name: formatTemplate(t.name, { areaLabel }),
      description: formatTemplate(t.description, { areaLabel }),
      hint: formatTemplate(t.hint, { areaLabel }),
      rarity: 'rare',
      iconName: 'Compass',
      sortOrder: next(),
      conditionMeta: { region: area }
    })
  }
  for (const area of ALL_AREAS) {
    const areaLabel = BADGE_AREA_LABELS[area]
    const storeCount = STORES_BY_AREA[area].length
    const t = BADGE_TEMPLATES.eventClearAreaComplete
    badges.push({
      code: `event_clear_area_complete_${area}`,
      category: 'event_clear_area',
      subCategory: 'event_clear_area_complete',
      name: formatTemplate(t.name, { areaLabel, storeCount }),
      description: formatTemplate(t.description, { areaLabel, storeCount }),
      hint: formatTemplate(t.hint, { areaLabel, storeCount }),
      rarity: 'epic',
      iconName: 'Award',
      sortOrder: next(),
      conditionMeta: { region: area }
    })
  }

  // -----------------------------------------------------------------------
  // 7. Event clear store-count milestone badges
  // -----------------------------------------------------------------------
  const clearSteps = milestoneSteps(physicalCount)
  for (let i = 0; i < clearSteps.length; i++) {
    const count = clearSteps[i]
    const rarity = visitMilestoneRarity(i, clearSteps.length)
    const t = BADGE_TEMPLATES.clearMilestone
    badges.push({
      code: `milestone_clear_count_${count}`,
      category: 'milestone',
      subCategory: 'event_clear_count',
      name: formatTemplate(t.name, { count }),
      description: formatTemplate(t.description, { count }),
      hint: formatTemplate(t.hint, { count }),
      rarity,
      iconName: 'Swords',
      sortOrder: next(),
      conditionMeta: { count }
    })
  }
  // "All stores" event clear completion badge
  const clearAllT = BADGE_TEMPLATES.clearMilestoneAll
  badges.push({
    code: 'milestone_clear_count_all',
    category: 'conquest',
    subCategory: 'event_clear_all',
    name: formatTemplate(clearAllT.name, { totalStores: physicalCount }),
    description: formatTemplate(clearAllT.description, { totalStores: physicalCount }),
    hint: formatTemplate(clearAllT.hint, { totalStores: physicalCount }),
    rarity: 'legendary',
    iconName: 'Sparkles',
    sortOrder: next(),
    conditionMeta: { count: physicalCount }
  })
  // "All areas event clear" meta badge
  const clearAreasT = BADGE_TEMPLATES.clearAllAreas
  badges.push({
    code: 'milestone_clear_areas',
    category: 'conquest',
    subCategory: 'all_areas_any_event_clear',
    name: clearAreasT.name,
    description: clearAreasT.description,
    hint: clearAreasT.hint,
    rarity: 'legendary',
    iconName: 'Globe',
    sortOrder: next(),
    conditionMeta: {}
  })

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

export { getBadgeRegistry }

export const BADGE_REGISTRY: readonly BadgeDef[] = Object.freeze(getBadgeRegistry())

/**
 * code -> registry entry のマップ。フロントで code から name/description/hint を引くのに使う。
 */
export const BADGE_REGISTRY_BY_CODE: ReadonlyMap<string, BadgeDef> = new Map(BADGE_REGISTRY.map((b) => [b.code, b]))

// Sanity assertion: registry size must be in [310, 320].
if (BADGE_REGISTRY.length < 310 || BADGE_REGISTRY.length > 320) {
  throw new Error(`BADGE_REGISTRY size out of expected range [310, 320]: got ${BADGE_REGISTRY.length}`)
}
