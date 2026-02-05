/**
 * ルート計算で使用する型定義
 */

/**
 * 選択可能な店舗
 */
export type AvailableStore = {
  id: string
  name: string
  lat: number
  lng: number
  stations: string[]
}

/**
 * 選択された店舗
 */
export type SelectedStore = {
  id: string
  name: string
  lat: number
  lng: number
  station: string
  stations: string[]
}

/**
 * 経路の1区間
 */
export type DirectionsLeg = {
  from: string
  to: string
  fromStation: string
  toStation: string
  distance: string
  duration: string
}

/**
 * ルート計算結果
 */
export type RouteResult = {
  route: SelectedStore[]
  totalDistance: number
  legs: DirectionsLeg[]
  totalDuration: string
}
