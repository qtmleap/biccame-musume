/**
 * 2点間の距離を計算するユーティリティ関数（ヒュバーサインの公式）
 */

/**
 * 2つの座標間の距離を計算（単位: km）
 */
export const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371 // 地球の半径（km）
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c

  return distance
}

/**
 * 度をラジアンに変換
 */
const toRad = (degrees: number): number => {
  return (degrees * Math.PI) / 180
}
