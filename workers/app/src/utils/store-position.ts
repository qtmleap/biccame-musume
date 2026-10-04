import type { StoreData } from '@/schemas/store.dto'

/** 地図表示・移動・距離計算に利用できる店舗座標だけを返す。 */
export const getStorePosition = ({ coordinates }: Pick<StoreData, 'coordinates'>): google.maps.LatLngLiteral | null => {
  if (!coordinates) return null
  const { latitude, longitude } = coordinates
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  )
    return null
  return { lat: latitude, lng: longitude }
}
