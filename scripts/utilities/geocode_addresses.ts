#!/usr/bin/env bun

/**
 * 住所から座標を取得してキャラクターデータに追加するスクリプト
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const GOOGLE_MAPS_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY

if (!GOOGLE_MAPS_API_KEY) {
  console.error('Error: VITE_GOOGLE_MAPS_API_KEY environment variable is not set')
  console.error('Please set it in .env file')
  process.exit(1)
}

interface Character {
  character_name: string
  store_name: string
  detail_url: string
  key: string
  description: string
  twitter_url?: string
  zipcode?: string
  address?: string
  store_birthday?: string
  store_link?: string
  image_urls?: string[]
  character_birthday?: string
  latitude?: number
  longitude?: number
}

interface GeocodeResponse {
  results: Array<{
    geometry: {
      location: {
        lat: number
        lng: number
      }
    }
  }>
  status: string
}

/**
 * Google Geocoding APIを使用して住所から座標を取得
 */
const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('API key is required')
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', address)
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY)

  try {
    const response = await fetch(url.toString())
    const data = (await response.json()) as GeocodeResponse

    if (data.status === 'OK' && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location
      return { lat, lng }
    }

    console.warn(`Geocoding failed for address: ${address}, status: ${data.status}`)
    return null
  } catch (error) {
    console.error(`Error geocoding address: ${address}`, error)
    return null
  }
}

/**
 * メイン処理
 */
const main = async () => {
  console.log('Starting geocoding process...')

  // キャラクターデータを読み込み
  const inputPath = join(import.meta.dir, '../public/characters.json')
  const characters: Character[] = JSON.parse(readFileSync(inputPath, 'utf-8'))

  console.log(`Total characters: ${characters.length}`)

  // 住所があるキャラクターのみ処理
  const charactersWithAddress = characters.filter((char) => char.address && char.address.length > 0)
  console.log(`Characters with address: ${charactersWithAddress.length}`)

  let successCount = 0
  let failCount = 0

  // 各住所をジオコーディング（レート制限を考慮して0.2秒間隔）
  for (const character of characters) {
    if (!character.address || character.address.length === 0) {
      continue
    }

    console.log(`Geocoding: ${character.character_name} (${character.store_name})`)
    console.log(`  Address: ${character.address}`)

    const coords = await geocodeAddress(character.address)

    if (coords) {
      character.latitude = coords.lat
      character.longitude = coords.lng
      console.log(`  ✓ Success: ${coords.lat}, ${coords.lng}`)
      successCount++
    } else {
      console.log(`  ✗ Failed`)
      failCount++
    }

    // レート制限を避けるため200ms待機
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  // 結果を保存
  const outputPath = inputPath
  writeFileSync(outputPath, JSON.stringify(characters, null, 2), 'utf-8')

  console.log('\n=== Geocoding Complete ===')
  console.log(`Success: ${successCount}`)
  console.log(`Failed: ${failCount}`)
  console.log(`Output: ${outputPath}`)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
