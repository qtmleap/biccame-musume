import charactersData from 'virtual:public-characters'
import type { StoreKey } from '@/schemas/store.dto'

// StoreKey values that are NOT independent physical retail stores.
// These are brand/service concepts, mascots, or sections within another store.
const EXCLUDED: readonly StoreKey[] = [
  'biccamera', // brand mascot character, no prefecture, no physical store
  'bicsim', // MVNO service character (BIC SIM), no prefecture, no physical store
  'naisen', // internal character (ナイセン = internal line), no prefecture, no physical store
  'oeraitan' // concept character (お偉いたん = management mascot), no prefecture, no physical store
]

export const EXCLUDED_STORE_KEYS: ReadonlySet<StoreKey> = new Set(EXCLUDED)

// characters.json から「ビッカメ娘なのに store 情報が無い」= 閉店した店舗キャラを抽出。
// このリストは PHYSICAL_STORE_KEYS の subset（後ろの定義参照）。
type CharacterEntry = {
  id: string
  character?: { is_biccame_musume?: boolean }
  store?: unknown
}
const closedFromJson = (charactersData as CharacterEntry[])
  .filter((c) => c.character?.is_biccame_musume === true && (c.store === undefined || c.store === null))
  .map((c) => c.id as StoreKey)

// All StoreKey values that represent independent physical stores.
// Includes:
//   camera  (ビックカメラ池袋東口カメラ館)         — distinct physical building in the campaign
//   ikenishi (ビックカメラ池袋西口店)              — distinct physical store with own address
//   itt     (ビックカメラ池袋西口IT tower店)       — distinct physical building in the campaign
//   pkan    (ビックカメラ池袋カメラ・パソコン館)     — distinct physical building with own address
//   photo   (フォトスタジオ)                      — listed as a separate campaign store for ikebukuro
//   prosta  (ビックフォトスタジオ東京写真館)        — listed as a separate campaign store for ikebukuro (11th anniversary)
//   bicqlo  (ビックカメラ新宿東口店)               — the former ビックロ building, now a physical BicCamera store
// 閉店した店舗 = ビッカメ娘なのに store 情報が無いキャラ。
// area_complete / event_clear_area_complete 等の集合系条件から除外する。
// （個別 visit / event_clear_at_store バッジは「永久未達」のままでよい）
export const CLOSED_STORE_KEYS: ReadonlySet<StoreKey> = new Set(closedFromJson)

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
  'prosta',
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

// 集合系バッジ判定で使う「現役」店舗キー。閉店店舗を除く。
// area_complete / count / event_clear_count / event_clear_all 等はここを基準にする。
export const ACTIVE_PHYSICAL_STORE_KEYS: readonly StoreKey[] = PHYSICAL_STORE_KEYS.filter(
  (k) => !CLOSED_STORE_KEYS.has(k)
)
