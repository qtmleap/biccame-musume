import type { StoreData } from '@/schemas/store.dto'
import { getStorePosition } from '@/utils/store-position'

type Point = { store: StoreData; position: google.maps.LatLngLiteral; x: number; y: number }
export type StoreCluster = { stores: StoreData[]; position: google.maps.LatLngLiteral; key: string }

/** 少数店舗向け。画面上の距離で結合するため、グリッド境界をまたぐ重なりもまとめる。 */
export const clusterStores = (stores: StoreData[], zoom: number): StoreCluster[] => {
  const scale = 256 * 2 ** zoom
  const points = stores.flatMap((store) => {
    const position = getStorePosition(store)
    if (!position) return []
    // Mercator投影だけをクランプする。登録座標は変更しない。
    const sin = Math.sin((Math.max(-85.05112878, Math.min(85.05112878, position.lat)) * Math.PI) / 180)
    return [
      {
        store,
        position,
        x: ((position.lng + 180) / 360) * scale,
        y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
      }
    ]
  })
  const groups =
    zoom >= 16
      ? points.map((p) => [p])
      : points.reduce<Point[][]>((groups, point) => {
          const overlaps = (group: Point[]) =>
            group.some((p) => {
              const dx = Math.abs(p.x - point.x)
              return Math.hypot(Math.min(dx, scale - dx), p.y - point.y) < 56
            })
          const nearby = groups.filter(overlaps)
          return [...groups.filter((g) => !overlaps(g)), [...nearby.flat(), point]]
        }, [])
  return groups.map((group) => {
    if (group.length === 1) return { stores: [group[0].store], key: group[0].store.id, position: group[0].position }
    const first = group[0].position.lng
    const lng = group.reduce((sum, p) => sum + first + (((p.position.lng - first + 540) % 360) - 180), 0) / group.length
    return {
      stores: group.map((p) => p.store),
      key: group
        .map((p) => p.store.id)
        .sort()
        .join(','),
      position: {
        lat: group.reduce((sum, p) => sum + p.position.lat, 0) / group.length,
        lng: ((lng + 540) % 360) - 180
      }
    }
  })
}

export const getStoreBounds = (stores: StoreData[]): google.maps.LatLngBoundsLiteral | null => {
  const positions = stores.flatMap((store) => {
    const position = getStorePosition(store)
    return position ? [position] : []
  })
  if (!positions.length) return null
  return {
    south: Math.min(...positions.map((p) => p.lat)),
    north: Math.max(...positions.map((p) => p.lat)),
    west: Math.min(...positions.map((p) => p.lng)),
    east: Math.max(...positions.map((p) => p.lng))
  }
}
