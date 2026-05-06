import type { StoreKey } from '@/schemas/store.dto'

// StoreKey values that are NOT independent physical retail stores.
// These are brand/service concepts, mascots, or sections within another store.
const EXCLUDED: readonly StoreKey[] = [
  'biccamera', // brand mascot character, no prefecture, no physical store
  'bicsim', // MVNO service character (BIC SIM), no prefecture, no physical store
  'naisen', // internal character (ナイセン = internal line), no prefecture, no physical store
  'oeraitan', // concept character (お偉いたん = management mascot), no prefecture, no physical store
  'prosta' // プロスタジアム section inside ikenishi (same address, no independent store name)
]

export const EXCLUDED_STORE_KEYS: ReadonlySet<StoreKey> = new Set(EXCLUDED)

// All StoreKey values that represent independent physical stores.
// Includes:
//   camera  (ビックカメラ池袋東口カメラ館)   — distinct physical building in the campaign
//   ikenishi (ビックカメラ池袋西口店)        — distinct physical store with own address
//   itt     (ビックカメラ池袋西口IT tower店) — distinct physical building in the campaign
//   pkan    (ビックカメラ池袋カメラ・パソコン館) — distinct physical building with own address
//   photo   (フォトスタジオ)               — listed as a separate campaign store for ikebukuro
//   bicqlo  (ビックカメラ新宿東口店)        — the former ビックロ building, now a physical BicCamera store
export const PHYSICAL_STORE_KEYS: readonly StoreKey[] = [
  'abeno',
  'akasaka',
  'akiba',
  'bicqlo',
  'camera',
  'chiba',
  'chofu',
  'fujisawa',
  'funabashi',
  'funato',
  'hachioji',
  'hamamatsu',
  'hiroshima',
  'honten',
  'ikenishi',
  'itt',
  'kagoshima',
  'kashiwa',
  'kawasaki',
  'kumamoto',
  'kyoto',
  'machida',
  'mito',
  'nagoya',
  'nagoyagate',
  'nanba',
  'niigata',
  'ohmiya',
  'okayama',
  'photo',
  'pkan',
  'sagami',
  'sapporo',
  'seiseki',
  'shibuhachi',
  'shibuto',
  'shinjyuku',
  'shintou',
  'shinyoko',
  'tachikawa',
  'takasaki',
  'takatsuki',
  'tamapla',
  'tenjin',
  'tenjin2',
  'tokorozawa',
  'yao',
  'yokonishi',
  'yuurakuchou'
] as const satisfies StoreKey[]
