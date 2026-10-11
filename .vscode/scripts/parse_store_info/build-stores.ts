import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractPrefecture } from '../lib/prefecture'
import type { ExistingCache } from './existing-cache'
import { resolveCoordinates } from './geocode'
import { parseProfileHtml } from './profile'
import { parseStoreHtml } from './store'
import type { StoreInfo } from './types'

/**
 * キャッシュディレクトリ内のプロフィールHTMLと店舗HTMLから店舗情報を組み立てる
 */
export const buildStores = async (cacheDir: string, existing: ExistingCache): Promise<StoreInfo[]> => {
  // キャッシュディレクトリ内のプロフィールHTMLファイルを取得
  const files = readdirSync(cacheDir)
    .filter((file) => file.startsWith('profile_') && file.endsWith('.html'))
    .sort()

  const stores: StoreInfo[] = []

  for (const file of files) {
    const storeId = file.replace('profile_', '').replace('.html', '')

    // index.htmlはスキップ
    if (storeId === 'index') {
      continue
    }

    console.log(`Processing: ${storeId}`)

    // プロフィール情報を取得
    const profilePath = join(cacheDir, file)
    const profileHtml = readFileSync(profilePath, 'utf-8')
    const profileInfo = parseProfileHtml(profileHtml, storeId)

    if (!profileInfo) {
      console.warn(`  ⚠️ Character info not found for ${storeId}`)
      continue
    }

    // 基本情報を作成（prefectureは店舗HTML解析で上書きされる）
    const storeInfo: StoreInfo = {
      id: storeId,
      character: profileInfo.character,
      prefecture: null
    }

    // 店舗HTMLが存在する場合はマージ
    const storePath = join(cacheDir, `store_${storeId}.html`)
    if (existsSync(storePath)) {
      const storeHtml = readFileSync(storePath, 'utf-8')
      const storeData = await parseStoreHtml(storeHtml, storeId)

      if (storeData) {
        // prefecture, postal_codeをrootに移動
        storeInfo.prefecture = storeData.prefecture ?? null
        storeInfo.postal_code = profileInfo.store_fields.postal_code

        // 既存の座標があれば使用、なければGeocoding APIで取得
        const coordinates = await resolveCoordinates(existing.coordinates[storeId], storeData.address)
        if (coordinates !== undefined) {
          storeInfo.coordinates = coordinates
        }

        storeInfo.store = {
          store_id: storeData.store_id,
          name: storeData.name,
          address: storeData.address,
          phone: profileInfo.store_fields.phone,
          birthday: profileInfo.store_fields.birthday,
          open_all_year: storeData.open_all_year,
          hours: storeData.hours,
          access: storeData.access && storeData.access.length > 0 ? storeData.access : existing.access[storeId] || [],
          parking: storeData.parking,
          google_maps_url: storeData.google_maps_url
        }
      }
    } else {
      // 店舗HTMLがない場合でもstore_fieldsをrootに設定
      const { postal_code, phone, birthday, address } = profileInfo.store_fields
      // 都道府県を推定（店舗IDを使用）
      const prefecture = extractPrefecture(address, undefined, storeInfo.character.name, storeId)

      storeInfo.prefecture = prefecture || null
      storeInfo.postal_code = postal_code || null

      // 既存の座標があれば使用、なければGeocoding APIで取得
      const coordinates = await resolveCoordinates(existing.coordinates[storeId], address)
      storeInfo.coordinates = coordinates === undefined ? null : coordinates

      if (phone || birthday || address) {
        storeInfo.store = {
          phone,
          birthday,
          address,
          access: []
        }
      }
    }

    stores.push(storeInfo)
    const displayName = storeInfo.store?.name || storeInfo.character.name
    console.log(`  ✓ ${displayName}`)
  }

  return stores
}
