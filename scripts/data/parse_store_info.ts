#!/usr/bin/env bun

/**
 * 店舗HTMLから店舗情報を抽出してYAMLファイルに保存するスクリプト
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import jaconv from 'jaconv'
import { mapKeys, snakeCase } from 'lodash-es'
import { parse } from 'node-html-parser'
import { parse as parseYaml, stringify } from 'yaml'

const CACHE_DIR = join(import.meta.dir, '../archive/html_cache')
const OUTPUT_FILE = join(import.meta.dir, '../archive/stores_info.yaml')
const OUTPUT_JSON_FILE = join(import.meta.dir, '../archive/stores_info.json')
const CHARACTER_FIELDS_FILE = join(import.meta.dir, '../archive/character_fields.yaml')

/**
 * 店舗情報の型定義
 */
type StoreInfo = {
  id: string
  character: {
    name: string
    aliases?: string[]
    description: string
    twitter_id: string
    images: string[]
    birthday?: string
    is_biccame_musume?: boolean
  }
  store?: {
    store_id?: number
    name?: string
    address?: string
    postal_code?: string
    phone?: string
    birthday?: string
    open_all_year?: boolean
    hours?: Array<{
      type: 'weekday' | 'weekend' | 'holiday' | 'all'
      open_time: string
      close_time: string
      note?: string
    }>
    access?: AccessInfo[]
    parking?: ParkingInfo[]
    google_maps_url?: string
    coordinates?: {
      latitude: number
      longitude: number
    }
  }
}

/**
 * アクセス情報の型定義
 */
type AccessInfo = {
  station: string
  description: string
  lines: string[]
}

/**
 * 駐車場情報の型定義
 */
type ParkingInfo = {
  name: string
  conditions: ParkingCondition[]
}

type ParkingCondition = {
  purchase: string
  freeTime: string
}

/**
 * 営業時間文字列をパース
 */
const parseHours = (
  hoursText: string
): {
  open_all_year: boolean
  hours: Array<{
    type: 'weekday' | 'weekend' | 'holiday' | 'all'
    open_time: string
    close_time: string
    note?: string
  }>
} => {
  const open_all_year = hoursText.includes('年中無休')
  const hours: Array<{
    type: 'weekday' | 'weekend' | 'holiday' | 'all'
    open_time: string
    close_time: string
    note?: string
  }> = []

  // 平日と土日祝で分かれているパターン（例: 「平日10:00～22:00 / 土日祝10:00～21:00」）
  const weekdayWeekendPattern =
    /平日[^\d]*(\d{1,2}:\d{2})\s*[～〜~-]\s*(\d{1,2}:\d{2})[^/]*\/[^\d]*土日[^\d]*(\d{1,2}:\d{2})\s*[～〜~-]\s*(\d{1,2}:\d{2})/
  const weekdayWeekendMatch = hoursText.match(weekdayWeekendPattern)

  if (weekdayWeekendMatch) {
    // 平日
    hours.push({
      type: 'weekday',
      open_time: weekdayWeekendMatch[1],
      close_time: weekdayWeekendMatch[2]
    })
    // 土日祝
    hours.push({
      type: 'weekend',
      open_time: weekdayWeekendMatch[3],
      close_time: weekdayWeekendMatch[4]
    })
  } else {
    // 平日・土曜と日曜・祝日で分かれているパターン（例: 「平日・土曜 10:00～20:30　日曜・祝日 10:00～20:00」）
    const weekdaySatSunPattern =
      /平日[^\d]*(\d{1,2}:\d{2})\s*[～〜~-]\s*(\d{1,2}:\d{2})[^\d]*日曜[^\d]*(\d{1,2}:\d{2})\s*[～〜~-]\s*(\d{1,2}:\d{2})/
    const weekdaySatSunMatch = hoursText.match(weekdaySatSunPattern)

    if (weekdaySatSunMatch) {
      // 平日・土曜
      hours.push({
        type: 'weekday',
        open_time: weekdaySatSunMatch[1],
        close_time: weekdaySatSunMatch[2]
      })
      // 日曜・祝日
      hours.push({
        type: 'holiday',
        open_time: weekdaySatSunMatch[3],
        close_time: weekdaySatSunMatch[4]
      })
    } else {
      // 通常の営業時間（全曜日共通）
      const timeMatch = hoursText.match(/(\d{1,2}:\d{2})\s*[～〜~-]\s*(\d{1,2}:\d{2})/)
      if (timeMatch) {
        const note = hoursText.includes('（') ? hoursText.match(/（[^）]+）/)?.[0] : undefined
        hours.push({
          type: 'all',
          open_time: timeMatch[1],
          close_time: timeMatch[2],
          note
        })
      }
    }
  }

  return { open_all_year, hours }
}

/**
 * 短縮URLを展開する
 */
const expandShortenedUrl = async (url: string): Promise<string> => {
  // 短縮URLでない場合はそのまま返す
  if (!url.includes('goo.gl') && !url.includes('maps.app.goo.gl')) {
    return url
  }

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow'
    })
    return response.url
  } catch (_error) {
    console.warn(`  ⚠️ Failed to expand URL: ${url}`)
    return url
  }
}

/**
 * Google Maps URLから座標を抽出
 */
const extractCoordinates = (url: string): { latitude: number; longitude: number } | undefined => {
  // @緯度,経度 の形式でマッチ
  const match = url.match(/@([-0-9.]+),([-0-9.]+)/)
  if (match) {
    const latitude = Number.parseFloat(match[1])
    const longitude = Number.parseFloat(match[2])
    if (!Number.isNaN(latitude) && !Number.isNaN(longitude)) {
      return { latitude, longitude }
    }
  }
  return undefined
}

/**
 * プロフィールHTMLからビッカメ娘情報を抽出
 */
const parseProfileHtml = (
  html: string
): {
  character: {
    name: string
    aliases?: string[]
    description: string
    twitter_id: string
    images: string[]
  }
  store_fields: {
    postal_code?: string
    phone?: string
    birthday?: string
  }
} | null => {
  const root = parse(html)

  // キャラクター名を取得（直下のテキストノードとfontタグ内のみ）
  const nameElement = root.querySelector('.char_name')
  if (!nameElement) {
    return null
  }

  // spanタグ以外のテキストを取得（直下のテキストノード + fontタグ内）
  let characterName = ''
  for (const child of nameElement.childNodes) {
    if (child.nodeType === 3) {
      // テキストノード
      characterName += child.text
    } else if (child.rawTagName === 'font') {
      // fontタグ
      characterName += child.text
    }
  }
  characterName = characterName.trim()

  // 別名を抽出（例: 「有楽町たん（ゆうらくちょうたん）」または「<font>（ 秋葉原たん ）</font>」）
  // 全ての括弧内の文字列を配列として取得
  const aliasMatches = characterName.matchAll(/[（(]\s*([^）)]+?)\s*[）)]/g)
  const _aliases = Array.from(aliasMatches)
    .map((match) => match[1].trim())
    .filter((alias) => alias.length > 0)
  const _cleanName = characterName.replace(/[（(]\s*[^）)]+?\s*[）)]/g, '').trim()

  // キャラクター説明を取得
  const descElement = root.querySelector('.char_text p')
  const description = descElement?.text.trim().replace(/\s+/g, ' ') || ''

  // Twitter IDを取得
  const twitterLink = root.querySelector('.tw_bt')?.getAttribute('href') || ''
  const twitter_id_match = twitterLink.match(/twitter\.com\/([^/?]+)/)
  const twitter_id = twitter_id_match ? twitter_id_match[1] : ''

  // 画像URLを取得
  const images: string[] = []
  const img1 = root.querySelector('.pro_detail_img1')?.getAttribute('src')
  const img2 = root.querySelector('.pro_detail_img2')?.getAttribute('src')
  if (img1) images.push(img1)
  if (img2) images.push(img2)

  // 追加の画像を取得（shop_info_frame_left）
  const shopInfoLeft = root.querySelector('.shop_info_frame_left')
  if (shopInfoLeft) {
    const additionalImages = shopInfoLeft.querySelectorAll('img')
    for (const img of additionalImages) {
      const src = img.getAttribute('src')
      if (src?.includes('/profile/images/')) {
        images.push(src)
      }
    }
  }

  // 追加の画像を取得（pro_detail_frame2）
  const proDetailFrame2 = root.querySelector('.pro_detail_frame2')
  if (proDetailFrame2) {
    const additionalImages = proDetailFrame2.querySelectorAll('img')
    for (const img of additionalImages) {
      const src = img.getAttribute('src')
      if (src?.includes('/profile/images/')) {
        images.push(src)
      }
    }
  }

  // 画像URLから共通部分を削除（https://biccame.jp/profile/）
  const shortImages = images.map((url) => url.replace('https://biccame.jp/profile/', ''))

  // 郵便番号を取得
  const addressText = root.querySelector('.shop_info')?.text || ''
  const postal_code_match = addressText.match(/〒(\d{3}-\d{4})/)
  const postal_code = postal_code_match ? postal_code_match[1] : undefined

  // 電話番号を取得
  const phoneElement = root.querySelectorAll('.shop_info')[1]
  const phoneText = phoneElement?.text || ''
  const phoneMatch = phoneText.match(/TEL：(.+)/)
  const phone = phoneMatch ? phoneMatch[1].trim() : undefined

  // 店舗誕生日を取得
  const birthdayElement = Array.from(root.querySelectorAll('.shop_info')).find((el) => el.text.includes('店舗誕生日'))
  const birthdayText = birthdayElement?.text || ''
  const birthdayMatch = birthdayText.match(/(\d{4})年(\d{2})月(\d{2})日/)
  const birthday = birthdayMatch ? `${birthdayMatch[1]}-${birthdayMatch[2]}-${birthdayMatch[3]}` : undefined

  if (!_cleanName) {
    return null
  }

  return {
    character: {
      name: _cleanName,
      aliases: _aliases.length > 0 ? _aliases : undefined,
      description,
      twitter_id,
      images: shortImages
    },
    store_fields: {
      postal_code,
      phone,
      birthday
    }
  }
}

/**
 * HTMLから店舗情報を抽出
 */
const parseStoreHtml = async (
  html: string,
  storeId: string
): Promise<{
  store_id?: number
  name?: string
  address?: string
  open_all_year?: boolean
  hours?: Array<{
    type: 'weekday' | 'weekend' | 'holiday' | 'all'
    open_time: string
    close_time: string
    note?: string
  }>
  access?: AccessInfo[]
  parking?: ParkingInfo[]
  google_maps_url?: string
  coordinates?: {
    latitude: number
    longitude: number
  }
} | null> => {
  const root = parse(html)

  // 店舗名を取得
  const nameElement = root.querySelector('.bcs_i_area_shop h1')
  if (!nameElement) {
    console.warn(`  ⚠️ Store name not found for ${storeId}`)
    return null
  }
  const name = nameElement.text.trim()

  // 店舗IDを取得（shop-XXX形式）
  const shop_id_match = html.match(/shop-(\d+)/)
  const shop_id = shop_id_match ? Number.parseInt(shop_id_match[1], 10) : undefined

  // 住所を取得
  const addressElement = root.querySelector('#shop_access .bcs_i_maintext')
  const address = addressElement?.text.trim().replace(/^〒\d{3}-\d{4}\s*/, '') || ''

  // 営業時間を取得
  const hoursElement = root.querySelector('#bcs_shop_hours .info_pickup_text p:nth-child(2)')
  const hoursText = hoursElement?.text.trim() || ''
  const parsed_hours = parseHours(hoursText)

  // Google Maps URLを取得
  const mapLinkElement = root.querySelector('#shop_access .maplink a')
  const google_maps_url = mapLinkElement?.getAttribute('href') || undefined

  // アクセス情報を取得
  const access: AccessInfo[] = []
  const accessElements = root.querySelectorAll('#shop_access .access dl.navi dt')
  for (const dtElement of accessElements) {
    const stationText = dtElement.childNodes
      .filter((node) => node.nodeType === 3)
      .map((node) => node.text.trim())
      .join('')
      .trim()

    const descriptionElement = dtElement.querySelector('span')
    let description = descriptionElement?.text.trim() || ''
    // 全角英数記号を半角に、半角カタカナを全角に変換
    description = jaconv.normalize(description)
    // 括弧を削除
    description = description.replace(/[()（）]/g, '').trim()
    // 「より」以降を削除（例: 「12号出口より直結」→「12号出口」）
    description = description.replace(/より.+$/, '').trim()

    const ddElement = dtElement.nextElementSibling
    const lines = ddElement?.querySelectorAll('span').map((span) => span.text.trim()) || []

    if (stationText) {
      access.push({
        station: stationText,
        description,
        lines
      })
    }
  }

  // 駐車場情報を取得
  const parking: ParkingInfo[] = []
  const parkingElements = root.querySelectorAll('.parking_service')
  for (const parkingElement of parkingElements) {
    const nameElement = parkingElement.querySelector('p a')
    let parkingName = nameElement?.text.trim() || ''
    // 全角スペースを半角スペースに変換
    parkingName = parkingName.replace(/　/g, ' ')

    const conditions: ParkingCondition[] = []
    const rows = parkingElement.querySelectorAll('table tbody tr')
    let isHeader = true
    for (const row of rows) {
      if (isHeader) {
        isHeader = false
        continue
      }

      const cells = row.querySelectorAll('td')
      if (cells.length >= 2) {
        conditions.push({
          purchase: cells[0].text.trim(),
          freeTime: cells[1].text.trim()
        })
      }
    }

    if (parkingName) {
      parking.push({
        name: parkingName,
        conditions
      })
    }
  }

  // Google Maps URLを展開して座標を抽出
  let expanded_url = google_maps_url
  let coordinates: { latitude: number; longitude: number } | undefined

  if (google_maps_url) {
    expanded_url = await expandShortenedUrl(google_maps_url)
    coordinates = extractCoordinates(expanded_url)
  }

  return {
    store_id: shop_id,
    name,
    address,
    open_all_year: parsed_hours.open_all_year,
    hours: parsed_hours.hours,
    access,
    parking,
    google_maps_url: expanded_url,
    coordinates
  }
}

/**
 * メイン処理
 */
const main = async () => {
  try {
    console.log('📋 Parsing character and store HTML files...\n')

    // キャッシュディレクトリ内のプロフィールHTMLファイルを取得
    const files = readdirSync(CACHE_DIR)
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
      const profilePath = join(CACHE_DIR, file)
      const profileHtml = readFileSync(profilePath, 'utf-8')
      const profileInfo = parseProfileHtml(profileHtml)

      if (!profileInfo) {
        console.warn(`  ⚠️ Character info not found for ${storeId}`)
        continue
      }

      // 基本情報を作成
      const storeInfo: StoreInfo = {
        id: storeId,
        character: profileInfo.character
      }

      // 店舗HTMLが存在する場合はマージ
      const storePath = join(CACHE_DIR, `store_${storeId}.html`)
      if (existsSync(storePath)) {
        const storeHtml = readFileSync(storePath, 'utf-8')
        const storeData = await parseStoreHtml(storeHtml, storeId)

        if (storeData) {
          storeInfo.store = {
            ...storeData,
            postal_code: profileInfo.store_fields.postal_code,
            phone: profileInfo.store_fields.phone,
            birthday: profileInfo.store_fields.birthday
          }
        }
      } else {
        // 店舗HTMLがない場合でもstore_fieldsをstoreとして設定
        const { postal_code, phone, birthday } = profileInfo.store_fields
        if (postal_code || phone || birthday) {
          storeInfo.store = { postal_code, phone, birthday }
        }
      }

      stores.push(storeInfo)
      const displayName = storeInfo.store?.name || storeInfo.character.name
      console.log(`  ✓ ${displayName}`)
    }

    // character_fields.yamlを読み込んでマージ
    if (existsSync(CHARACTER_FIELDS_FILE)) {
      console.log('\n📋 Merging character fields...')
      const characterFieldsYaml = readFileSync(CHARACTER_FIELDS_FILE, 'utf-8')
      const characterFields = parseYaml(characterFieldsYaml) as Record<
        string,
        {
          character: {
            birthday?: string
            is_biccame_musume?: boolean
          }
        }
      >

      for (const store of stores) {
        const fields = characterFields[store.id]
        if (fields?.character && store.character) {
          // キャラクター誕生日をマージ
          if (fields.character.birthday) {
            store.character.birthday = fields.character.birthday
          }
          // is_biccame_musumeをマージ
          if (fields.character.is_biccame_musume !== undefined) {
            store.character.is_biccame_musume = fields.character.is_biccame_musume
          }
        }
      }
      console.log('✓ Character fields merged')
    }

    // YAMLファイルに保存
    const yaml = stringify(stores, { lineWidth: 0 })
    writeFileSync(OUTPUT_FILE, yaml, 'utf-8')

    // スネークケース変換関数
    const toSnakeCase = (obj: unknown): unknown => {
      if (Array.isArray(obj)) {
        return obj.map(toSnakeCase)
      }
      if (obj !== null && typeof obj === 'object') {
        return mapKeys(obj, (_value, key) => snakeCase(key))
      }
      return obj
    }

    // JSONファイルに保存（google_maps_urlとparkingを除外、スネークケースに変換）
    const storesForJson = stores.map((store) => {
      if (store.store) {
        const { google_maps_url, parking, ...restStore } = store.store
        return toSnakeCase({
          ...store,
          store: restStore
        })
      }
      return toSnakeCase(store)
    })
    const json = JSON.stringify(storesForJson, null, 2)
    writeFileSync(OUTPUT_JSON_FILE, json, 'utf-8')

    console.log(`\n✓ Successfully parsed ${stores.length} characters`)
    console.log(`YAML output: ${OUTPUT_FILE}`)
    console.log(`JSON output: ${OUTPUT_JSON_FILE}`)
  } catch (error) {
    console.error('\n✗ Error:', error)
    process.exit(1)
  }
}

main()
