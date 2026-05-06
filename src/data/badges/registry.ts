import type { StoreKey } from '@/schemas/store.dto'
import { BADGE_AREA_LABELS, type BadgeArea, storeKeyToBadgeArea } from './area-mapping'
import { PHYSICAL_STORE_KEYS } from './store-exclusion'

export type BadgeCategory =
  | 'store'
  | 'area'
  | 'milestone'
  | 'event'
  | 'event_clear_store'
  | 'event_clear_area'
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
  | 'vote_unique'
  | 'vote_devotion'
  | 'vote_all_biccame'
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
    badges.push({
      code: `store_visit_${storeKey}`,
      category: 'store',
      subCategory: 'visit',
      name: `${storeName}訪問`,
      description: `${storeName}を訪問しました`,
      hint: `${storeName}を訪問するとゲットできます`,
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
    badges.push({
      code: `area_any_${area}`,
      category: 'area',
      subCategory: 'area_any',
      name: `${areaLabel}デビュー`,
      description: `${areaLabel}のいずれかの店舗を訪問しました`,
      hint: `${areaLabel}の店舗を 1 店以上訪問するとゲットできます`,
      rarity: 'rare',
      iconName: 'Navigation',
      sortOrder: next(),
      conditionMeta: { region: area }
    })
  }
  for (const area of ALL_AREAS) {
    const areaLabel = BADGE_AREA_LABELS[area]
    const storeCount = STORES_BY_AREA[area].length
    badges.push({
      code: `area_complete_${area}`,
      category: 'area',
      subCategory: 'area_complete',
      name: `${areaLabel}コンプ`,
      description: `${areaLabel}の全 ${storeCount} 店舗を訪問しました`,
      hint: `${areaLabel}の全店舗を訪問するとゲットできます`,
      rarity: 'epic',
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
    badges.push({
      code: `milestone_count_${count}`,
      category: 'milestone',
      subCategory: 'count',
      name: `${count} 店訪問`,
      description: `累計 ${count} 店舗を訪問しました`,
      hint: `${count} 店舗を訪問するとゲットできます`,
      rarity,
      iconName: 'Star',
      sortOrder: next(),
      conditionMeta: { count }
    })
  }
  // "All stores" completion badge
  badges.push({
    code: `milestone_count_all`,
    category: 'milestone',
    subCategory: 'count',
    name: '全店制覇',
    description: `全 ${physicalCount} 店舗を訪問しました`,
    hint: `全 ${physicalCount} 店舗を訪問するとゲットできます`,
    rarity: 'legendary',
    iconName: 'Crown',
    sortOrder: next(),
    conditionMeta: { count: physicalCount }
  })
  // "All areas visited" meta badge
  badges.push({
    code: 'milestone_all_areas_visit',
    category: 'milestone',
    subCategory: 'all_areas_any_visit',
    name: '全国デビュー',
    description: '全 10 地区それぞれで 1 店舗以上を訪問しました',
    hint: '各地区から 1 店ずつ訪問するとゲット',
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
  // Named entries (stable codes preserved):
  //   event_count_1   → はじめてのイベント
  //   event_count_5   → 常連さん
  //   event_count_10  → イベントマスター
  //   event_count_20  → イベント愛好家
  //   event_count_50  → イベントの主
  //   event_count_575 → イベント極み   (new legendary peak)
  //   all others      → イベント X 件
  // -----------------------------------------------------------------------
  const EVENT_COUNT_NAMED: Record<number, string> = {
    1: 'はじめてのイベント',
    5: '常連さん',
    10: 'イベントマスター',
    20: 'イベント愛好家',
    50: 'イベントの主',
    575: 'イベント極み'
  }
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
    const name = EVENT_COUNT_NAMED[count] ?? `イベント ${count} 件`
    const rarity = eventCountRarity(count)
    badges.push({
      code: `event_count_${count}`,
      category: 'event',
      subCategory: 'event_count',
      name,
      description: `イベントを ${count} 件完了しました`,
      hint: `イベントを ${count} 件完了するとゲットできます`,
      rarity,
      iconName: 'CalendarCheck',
      sortOrder: next(),
      conditionMeta: { count }
    })
  }

  // -----------------------------------------------------------------------
  // 5. Per-store event clear badges (~50)
  // -----------------------------------------------------------------------
  for (const storeKey of PHYSICAL_STORE_KEYS) {
    const storeName = STORE_DISPLAY_NAMES[storeKey]
    badges.push({
      code: `event_clear_at_store_${storeKey}`,
      category: 'event_clear_store',
      subCategory: 'event_clear_at_store',
      name: `${storeName}制覇`,
      description: `${storeName}のイベントを達成しました`,
      hint: `${storeName}で開催されたイベントを 1 件以上完了するとゲットできます`,
      rarity: 'rare',
      iconName: 'MapPinCheck',
      sortOrder: next(),
      conditionMeta: { storeKey }
    })
  }

  // -----------------------------------------------------------------------
  // 6. Area event clear badges — area_any (10) + area_complete (10)
  // -----------------------------------------------------------------------
  for (const area of ALL_AREAS) {
    const areaLabel = BADGE_AREA_LABELS[area]
    badges.push({
      code: `event_clear_area_any_${area}`,
      category: 'event_clear_area',
      subCategory: 'event_clear_area_any',
      name: `${areaLabel}イベントデビュー`,
      description: `${areaLabel}のいずれかの店舗でイベントを達成しました`,
      hint: `${areaLabel}の店舗で 1 件以上イベントを完了するとゲットできます`,
      rarity: 'epic',
      iconName: 'Compass',
      sortOrder: next(),
      conditionMeta: { region: area }
    })
  }
  for (const area of ALL_AREAS) {
    const areaLabel = BADGE_AREA_LABELS[area]
    const storeCount = STORES_BY_AREA[area].length
    badges.push({
      code: `event_clear_area_complete_${area}`,
      category: 'event_clear_area',
      subCategory: 'event_clear_area_complete',
      name: `${areaLabel}制覇`,
      description: `${areaLabel}の全 ${storeCount} 店舗でイベントを達成しました`,
      hint: `${areaLabel}の全店舗でイベントを完了するとゲットできます`,
      rarity: 'legendary',
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
    badges.push({
      code: `event_clear_count_${count}`,
      category: 'milestone',
      subCategory: 'event_clear_count',
      name: `${count} 店制覇`,
      description: `${count} 店舗でイベントを達成しました`,
      hint: `${count} 店舗でイベントを完了するとゲットできます`,
      rarity,
      iconName: 'Swords',
      sortOrder: next(),
      conditionMeta: { count }
    })
  }
  // "All stores" event clear completion badge
  badges.push({
    code: 'event_clear_all',
    category: 'milestone',
    subCategory: 'event_clear_all',
    name: '全店イベント制覇',
    description: `全 ${physicalCount} 店舗でイベントを達成しました`,
    hint: `全 ${physicalCount} 店舗でイベントを完了するとゲットできます`,
    rarity: 'legendary',
    iconName: 'Sparkles',
    sortOrder: next(),
    conditionMeta: { count: physicalCount }
  })
  // "All areas event clear" meta badge
  badges.push({
    code: 'event_clear_all_areas',
    category: 'milestone',
    subCategory: 'all_areas_any_event_clear',
    name: '全国達成',
    description: '全 10 地区それぞれで 1 件以上イベント完了しました',
    hint: '各地区で 1 件ずつイベントクリアするとゲット',
    rarity: 'legendary',
    iconName: 'Globe',
    sortOrder: next(),
    conditionMeta: {}
  })

  // -----------------------------------------------------------------------
  // 8. Vote total milestone badges (11)
  //
  // Thresholds: 1, then 100-step from 100 to 1000 = 11 entries.
  // Rarity grading:
  //   common:    1, 100              (2 entries)
  //   rare:      200, 300            (2 entries)
  //   epic:      400, 500, 600, 700  (4 entries)
  //   legendary: 800, 900, 1000      (3 entries)
  // -----------------------------------------------------------------------
  const VOTE_TOTAL_NAMED: Record<number, string> = {
    1: '初投票',
    100: '投票熟練',
    500: '票職人',
    1000: '投票名人'
  }
  function voteTotalRarity(count: number): BadgeRarity {
    if (count <= 100) return 'common'
    if (count <= 300) return 'rare'
    if (count <= 700) return 'epic'
    return 'legendary'
  }
  const VOTE_TOTAL_THRESHOLDS: number[] = [1, ...Array.from({ length: 10 }, (_, i) => (i + 1) * 100)]
  for (const count of VOTE_TOTAL_THRESHOLDS) {
    const name = VOTE_TOTAL_NAMED[count] ?? `${count} 票`
    const rarity = voteTotalRarity(count)
    badges.push({
      code: `vote_total_${count}`,
      category: 'vote',
      subCategory: 'vote_total',
      name,
      description: `累計 ${count} 票投票しました`,
      hint: `累計 ${count} 票投票するとゲットできます`,
      rarity,
      iconName: 'Vote',
      sortOrder: next(),
      conditionMeta: { count }
    })
  }

  // -----------------------------------------------------------------------
  // 9. Vote unique (diversity) badges — 5-step milestones + all_biccame (10)
  // -----------------------------------------------------------------------
  const BICCAME_MUSUME_COUNT = 50
  const uniqueSteps = milestoneSteps(BICCAME_MUSUME_COUNT)
  const uniqueStepRarities: BadgeRarity[] = ['common', 'common', 'rare', 'rare', 'rare', 'epic', 'epic', 'epic', 'epic']
  for (let i = 0; i < uniqueSteps.length; i++) {
    const count = uniqueSteps[i]
    const rarity = uniqueStepRarities[i] ?? 'epic'
    badges.push({
      code: `vote_unique_${count}`,
      category: 'vote',
      subCategory: 'vote_unique',
      name: `推し ${count} 人`,
      description: `${count} 人の異なるキャラクターに投票しました`,
      hint: `${count} 人の異なるキャラクターに投票するとゲットできます`,
      rarity,
      iconName: 'Users',
      sortOrder: next(),
      conditionMeta: { count }
    })
  }
  // All biccame musume legendary badge
  badges.push({
    code: 'vote_unique_all_biccame',
    category: 'vote',
    subCategory: 'vote_all_biccame',
    name: '全員推し',
    description: `ビッカメ娘全 ${BICCAME_MUSUME_COUNT} キャラクターに 1 票以上投票しました`,
    hint: `ビッカメ娘全員に 1 票以上投票するとゲットできます`,
    rarity: 'legendary',
    iconName: 'Heart',
    sortOrder: next(),
    conditionMeta: { count: BICCAME_MUSUME_COUNT }
  })

  // -----------------------------------------------------------------------
  // 10. Vote devotion badges (2)
  // -----------------------------------------------------------------------
  const devotionBadges: Array<{ count: number; name: string; rarity: BadgeRarity }> = [
    { count: 10, name: '推し決定', rarity: 'common' },
    { count: 100, name: '推し一筋', rarity: 'epic' }
  ]
  for (const { count, name, rarity } of devotionBadges) {
    badges.push({
      code: `vote_devotion_${count}`,
      category: 'vote',
      subCategory: 'vote_devotion',
      name,
      description: `同じキャラクターに累計 ${count} 票投票しました`,
      hint: `同じキャラクターに累計 ${count} 票投票するとゲットできます`,
      rarity,
      iconName: 'HeartHandshake',
      sortOrder: next(),
      conditionMeta: { count }
    })
  }

  return badges
}

export { getBadgeRegistry }

export const BADGE_REGISTRY: readonly BadgeDef[] = Object.freeze(getBadgeRegistry())

// Sanity assertion: registry size must be in [200, 220].
if (BADGE_REGISTRY.length < 200 || BADGE_REGISTRY.length > 220) {
  throw new Error(`BADGE_REGISTRY size out of expected range [200, 220]: got ${BADGE_REGISTRY.length}`)
}
