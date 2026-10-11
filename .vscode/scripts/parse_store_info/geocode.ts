import type { Coordinates } from './types'

/**
 * 住所から座標を取得する（Google Geocoding API）
 */
const geocodeAddress = async (address: string): Promise<Coordinates | undefined> => {
  if (!address) {
    return undefined
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    console.warn('  ⚠️ GOOGLE_MAPS_API_KEY is not set')
    return undefined
  }

  try {
    const encodedAddress = encodeURIComponent(address)
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}&language=ja&region=jp`
    )

    if (!response.ok) {
      console.warn(`  ⚠️ Geocoding API error: ${response.status}`)
      return undefined
    }

    const data = (await response.json()) as {
      status: string
      results: Array<{
        geometry: {
          location: {
            lat: number
            lng: number
          }
        }
      }>
    }

    if (data.status !== 'OK' || data.results.length === 0) {
      console.warn(`  ⚠️ No geocoding result for: ${address} (status: ${data.status})`)
      return undefined
    }

    const location = data.results[0].geometry.location
    return {
      latitude: location.lat,
      longitude: location.lng
    }
  } catch (error) {
    console.warn(`  ⚠️ Geocoding failed for: ${address}`, error)
    return undefined
  }
}

/**
 * キャッシュ済みの座標があればそれを使い、なければ住所から Geocoding API で取得する。
 * 住所が無ければ undefined、取得に失敗したら null を返す。
 */
export const resolveCoordinates = async (
  cached: Coordinates | undefined,
  address: string | undefined
): Promise<Coordinates | null | undefined> => {
  if (cached) {
    console.log(`  📦 Using cached coordinates: ${cached.latitude}, ${cached.longitude}`)
    return cached
  }
  if (!address) {
    return undefined
  }

  console.log(`  📍 Geocoding: ${address}`)
  const coordinates = await geocodeAddress(address)
  if (!coordinates) {
    return null
  }
  console.log(`     → ${coordinates.latitude}, ${coordinates.longitude}`)
  return coordinates
}
