import { existsSync, readFileSync } from 'node:fs'
import type { AccessInfo, Coordinates, StoreInfo } from './types'

export type ExistingCache = {
  coordinates: Record<string, Coordinates>
  access: Record<string, AccessInfo[]>
}

/**
 * 既存のcharacters.jsonを読み込んで座標・アクセス情報のキャッシュを作成
 */
export const loadExistingCache = (outputFile: string): ExistingCache => {
  const coordinates: ExistingCache['coordinates'] = {}
  const access: ExistingCache['access'] = {}
  if (existsSync(outputFile)) {
    const existingData = JSON.parse(readFileSync(outputFile, 'utf-8')) as StoreInfo[]
    for (const store of existingData) {
      if (store.coordinates) {
        coordinates[store.id] = store.coordinates
      }
      if (store.store?.access && store.store.access.length > 0) {
        access[store.id] = store.store.access
      }
    }
    console.log(
      `📦 Loaded ${Object.keys(coordinates).length} cached coordinates, ${Object.keys(access).length} cached access info\n`
    )
  }
  return { coordinates, access }
}
