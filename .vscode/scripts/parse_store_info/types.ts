export type Coordinates = {
  latitude: number
  longitude: number
}

/**
 * 店舗情報の型定義
 */
export type StoreInfo = {
  id: string
  character: {
    name: string
    aliases?: string[]
    description: string
    twitter_id?: string
    images: string[]
    birthday?: string
    is_biccame_musume: boolean
  }
  prefecture: string | null
  coordinates?: Coordinates | null
  postal_code?: string | null
  store?: {
    store_id?: number
    name?: string
    address?: string
    phone?: string
    birthday?: string
    open_all_year?: boolean
    hours?: Array<{
      type: 'weekday' | 'weekend' | 'holiday' | 'all'
      open_time: string
      close_time: string
      note?: string
    }>
    access: AccessInfo[]
    parking?: ParkingInfo[]
    google_maps_url?: string
  }
}

/**
 * アクセス情報の型定義
 */
export type AccessInfo = {
  station: string
  description?: string
  duration?: string
  notes?: string
  lines: string[]
}

/**
 * 駐車場情報の型定義
 */
export type ParkingInfo = {
  name: string
  conditions: ParkingCondition[]
}

export type ParkingCondition = {
  purchase: string
  freeTime: string
}
