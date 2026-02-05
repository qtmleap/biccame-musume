import { useCallback } from 'react'
import type { DirectionsLeg, SelectedStore } from './types'

/**
 * 2点間のユークリッド距離を計算
 */
const calcDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) => {
  const dx = p2.lat - p1.lat
  const dy = p2.lng - p1.lng
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Directions APIを使って経路を取得するカスタムフック
 */
export const useDirections = () => {
  /**
   * Directions APIで2点間の経路を取得（駅名を使用）
   */
  const getDirections = useCallback(
    async (
      directionsService: google.maps.DirectionsService,
      origin: SelectedStore,
      destination: SelectedStore
    ): Promise<DirectionsLeg | null> => {
      try {
        const response = await directionsService.route({
          origin: origin.station,
          destination: destination.station,
          travelMode: google.maps.TravelMode.TRANSIT,
          transitOptions: {
            modes: [google.maps.TransitMode.RAIL, google.maps.TransitMode.SUBWAY]
          }
        })

        const leg = response.routes[0]?.legs[0]
        if (!leg) return null

        return {
          from: origin.name,
          to: destination.name,
          fromStation: origin.station,
          toStation: destination.station,
          distance: leg.distance?.text || '不明',
          duration: leg.duration?.text || '不明'
        }
      } catch (error) {
        console.error('Directions API error:', error)
        // フォールバック: ユークリッド距離で概算
        const dist = calcDistance(origin, destination) * 111
        return {
          from: origin.name,
          to: destination.name,
          fromStation: origin.station,
          toStation: destination.station,
          distance: `${dist.toFixed(1)} km（概算）`,
          duration: '不明'
        }
      }
    },
    []
  )

  /**
   * 総所要時間を計算
   */
  const calcTotalDuration = useCallback((legs: DirectionsLeg[]): string => {
    const totalMinutes = legs.reduce((sum, leg) => {
      const hourMatch = leg.duration.match(/(\d+)\s*時間/)
      const minMatch = leg.duration.match(/(\d+)\s*分/)
      const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0
      const mins = minMatch ? parseInt(minMatch[1], 10) : 0
      return sum + hours * 60 + mins
    }, 0)

    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60
    return hours > 0 ? `${hours}時間${mins}分` : `${mins}分`
  }, [])

  return { getDirections, calcTotalDuration }
}
