import type { StoreKey } from '@/schemas/store.dto'
import { PHYSICAL_STORE_KEYS } from './store-exclusion'

export type BadgeArea =
  | 'hokkaido'
  | 'kanto_north'
  | 'chiba'
  | 'tokyo_metro'
  | 'shinjuku_shibuya'
  | 'ikebukuro'
  | 'kanagawa'
  | 'chubu'
  | 'sanyo_kinki'
  | 'kyushu'

export const BADGE_AREA_LABELS: Record<BadgeArea, string> = {
  hokkaido: '北海道地区',
  kanto_north: '埼玉・茨城・群馬・新潟地区',
  chiba: '千葉地区',
  tokyo_metro: '東京地区',
  shinjuku_shibuya: '新宿・渋谷地区',
  ikebukuro: '池袋地区',
  kanagawa: '神奈川地区',
  chubu: '中部地区',
  sanyo_kinki: '山陽・近畿地区',
  kyushu: '九州地区'
}

// Store-to-area mapping following the 11th anniversary campaign breakdown.
// Stores not listed in the campaign are assigned to the nearest geographic area (noted inline).
export const storeKeyToBadgeArea: Record<StoreKey, BadgeArea> = {
  // hokkaido — 北海道地区
  sapporo: 'hokkaido',

  // kanto_north — 埼玉・茨城・群馬・新潟地区
  ohmiya: 'kanto_north',
  tokorozawa: 'kanto_north',
  mito: 'kanto_north',
  takasaki: 'kanto_north',
  niigata: 'kanto_north',

  // chiba — 千葉地区
  chiba: 'chiba',
  funabashi: 'chiba',
  kashiwa: 'chiba',
  funato: 'chiba', // ビックカメラ船橋東武店 — same city (船橋市) as funabashi, assigned to chiba area

  // tokyo_metro — 東京地区 (campaign: 調布・聖蹟・立川・八王子・町田・有楽町・AKIBA・赤坂見附)
  chofu: 'tokyo_metro',
  seiseki: 'tokyo_metro',
  tachikawa: 'tokyo_metro',
  hachioji: 'tokyo_metro',
  machida: 'tokyo_metro',
  yuurakuchou: 'tokyo_metro',
  akiba: 'tokyo_metro',
  akasaka: 'tokyo_metro',

  // shinjuku_shibuya — 新宿・渋谷地区 (campaign: 新宿東口/西口/駅前・渋谷ハチ公口/東口)
  shinjyuku: 'shinjuku_shibuya', // 新宿西口
  bicqlo: 'shinjuku_shibuya', // 新宿東口 (ビックカメラ新宿東口店, 旧ビックロ building)
  shintou: 'shinjuku_shibuya', // 新宿東口駅前
  shibuhachi: 'shinjuku_shibuya', // 渋谷ハチ公口
  shibuto: 'shinjuku_shibuya', // 渋谷東口

  // ikebukuro — 池袋地区 (campaign: 本店・カメラ館・パソコン館・西口・フォトスタジオ・IT tower)
  honten: 'ikebukuro',
  camera: 'ikebukuro', // 池袋東口カメラ館 — distinct physical building listed in campaign
  pkan: 'ikebukuro', // 池袋カメラ・パソコン館 — distinct physical building listed in campaign
  ikenishi: 'ikebukuro', // 池袋西口店
  photo: 'ikebukuro', // フォトスタジオ — listed in campaign as a separate ikebukuro store
  itt: 'ikebukuro', // 池袋西口IT tower店

  // kanagawa — 神奈川地区 (campaign: 相模大野・たまプラーザ・川崎・新横浜・横浜西口・藤沢)
  sagami: 'kanagawa',
  tamapla: 'kanagawa',
  kawasaki: 'kanagawa',
  shinyoko: 'kanagawa',
  yokonishi: 'kanagawa',
  fujisawa: 'kanagawa',

  // chubu — 中部地区 (campaign: 浜松・名古屋JRゲート・名古屋駅西)
  hamamatsu: 'chubu',
  nagoyagate: 'chubu',
  nagoya: 'chubu',

  // sanyo_kinki — 山陽・近畿地区 (campaign: 広島・岡山・なんば・京都・高槻・あべの・八尾)
  hiroshima: 'sanyo_kinki',
  okayama: 'sanyo_kinki',
  nanba: 'sanyo_kinki',
  kyoto: 'sanyo_kinki', // ビックカメラJR京都駅店 — 京都府 is Kinki region
  takatsuki: 'sanyo_kinki',
  abeno: 'sanyo_kinki',
  yao: 'sanyo_kinki',

  // kyushu — 九州地区 (campaign: 天神1号・天神2号・鹿児島・熊本)
  tenjin: 'kyushu',
  tenjin2: 'kyushu',
  kagoshima: 'kyushu',
  kumamoto: 'kyushu',

  // Non-physical store keys — required to satisfy Record<StoreKey, BadgeArea> but never used in badge logic.
  // These are excluded by EXCLUDED_STORE_KEYS and will never appear in badge evaluation.
  biccamera: 'tokyo_metro',
  bicsim: 'tokyo_metro',
  naisen: 'tokyo_metro',
  oeraitan: 'tokyo_metro',
  prosta: 'ikebukuro'
}

// Runtime assertion: every PHYSICAL_STORE_KEY must appear in storeKeyToBadgeArea
for (const key of PHYSICAL_STORE_KEYS) {
  if (!(key in storeKeyToBadgeArea)) {
    throw new Error(`storeKeyToBadgeArea is missing physical store key: "${key}"`)
  }
}
