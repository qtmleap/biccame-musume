import { useCallback } from 'react'
import type { DirectionsLeg, SelectedStore } from './types'

/**
 * APIリクエスト用の区間データ
 */
type LegRequest = {
  from: string
  to: string
  fromStation: string
  toStation: string
}

/**
 * 経路情報を取得するカスタムフック
 */
export const useDirections = () => {
  /**
   * APIを呼び出して経路情報を取得
   */
  const getDirections = useCallback(async (route: SelectedStore[]): Promise<DirectionsLeg[]> => {
    // 区間データを作成
    const legs: LegRequest[] = []
    for (const [i, store] of route.entries()) {
      const nextStore = route[i + 1]
      if (nextStore) {
        legs.push({
          from: store.name,
          to: nextStore.name,
          fromStation: store.station,
          toStation: nextStore.station
        })
      }
    }

    if (legs.length === 0) return []

    try {
      const response = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legs })
      })

      if (!response.ok) {
        throw new Error('API request failed')
      }

      const data = (await response.json()) as { legs: DirectionsLeg[] }
      return data.legs
    } catch (error) {
      console.error('Route API error:', error)
      // エラー時はフォールバック
      return legs.map((leg) => ({
        ...leg,
        routes: [],
        duration: 0,
        transfers: 0
      }))
    }
  }, [])

  /**
   * 総所要時間を計算
   */
  const calcTotalDuration = useCallback((legs: DirectionsLeg[]): string => {
    const totalMinutes = legs.reduce((sum, leg) => sum + leg.duration, 0)
    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60
    return hours > 0 ? `${hours}時間${mins}分` : `${mins}分`
  }, [])

  return { getDirections, calcTotalDuration }
}
