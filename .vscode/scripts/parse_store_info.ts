#!/usr/bin/env bun

/**
 * 店舗HTMLから店舗情報を抽出してJSONファイルに保存するスクリプト
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import jaconv from 'jaconv'
import { mapKeys, snakeCase } from 'lodash-es'
import { parse } from 'node-html-parser'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

const CACHE_DIR = join(import.meta.dir, '../archive/html_cache')
const OUTPUT_FILE = join(import.meta.dir, '../../public/characters.json')
const BIRTHDAY_FILE = join(import.meta.dir, 'birthday.json')

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
    birthday: string
    is_biccame_musume: boolean
  }
  prefecture: string | null
  coordinates?: {
    latitude: number
    longitude: number
  } | null
  postal_code?: string | null
  store?: {
    store_id: number
    name: string
    address: string
    phone?: string
    birthday: string
    open_all_year: boolean
    hours?: Array<{
      type: 'weekday' | 'weekend' | 'holiday' | 'all'
      open_time: string
      close_time: string
      note?: string
    }>
    access: AccessInfo[]
    parking?: ParkingInfo[]
    google_maps_url?: string
  }
}

/**
 * アクセス情報の型定義
 */
type AccessInfo = {
  station: string
  description: string
  duration?: string
  notes?: string
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
 * 住所または店舗名から都道府県を抽出
 */
const extractPrefecture = (
  address?: string,
  storeName?: string,
  characterName?: string,
  storeId?: string
): string | undefined => {
  // 店舗IDベースの例外処理（店舗HTMLがない特殊なキャラクター）
  const storeIdMap: Record<string, string | null> = {
    biccamera: null, // ビックカメラ（企業キャラクター）
    bicsim: null, // ビックシムたん（サービスキャラクター）
    oeraitan: null, // お偉いたん（役職キャラクター）
    camera: '東京都', // カメ館たん（池袋カメラ館）
    funato: '千葉県', // ふなとーたん（船橋）
    machida: '東京都', // 町田たん
    naisen: null, // ナイセン（内線キャラクター）
    photo: '東京都', // フォトたん（写真サービス）
    prosta: '東京都', // プロスタたん（プロフェッショナルスタッフ）
    seiseki: '東京都', // せいせきたん（聖蹟桜ヶ丘）
    tamapla: '神奈川県' // たまプラたん（たまプラーザ）
  }

  if (storeId && storeId in storeIdMap) {
    return storeIdMap[storeId] ?? undefined
  }

  const prefectures = [
    '北海道',
    '青森県',
    '岩手県',
    '宮城県',
    '秋田県',
    '山形県',
    '福島県',
    '茨城県',
    '栃木県',
    '群馬県',
    '埼玉県',
    '千葉県',
    '東京都',
    '神奈川県',
    '新潟県',
    '富山県',
    '石川県',
    '福井県',
    '山梨県',
    '長野県',
    '岐阜県',
    '静岡県',
    '愛知県',
    '三重県',
    '滋賀県',
    '京都府',
    '大阪府',
    '兵庫県',
    '奈良県',
    '和歌山県',
    '鳥取県',
    '島根県',
    '岡山県',
    '広島県',
    '山口県',
    '徳島県',
    '香川県',
    '愛媛県',
    '高知県',
    '福岡県',
    '佐賀県',
    '長崎県',
    '熊本県',
    '大分県',
    '宮崎県',
    '鹿児島県',
    '沖縄県'
  ]

  // 住所から都道府県を抽出
  if (address) {
    for (const pref of prefectures) {
      if (address.includes(pref)) {
        return pref
      }
    }
  }

  // 店舗名から都道府県を推定
  const locationMap: Record<string, string> = {
    札幌: '北海道',
    新潟: '新潟県',
    浜松: '静岡県',
    名古屋: '愛知県',
    京都: '京都府',
    大阪: '大阪府',
    なんば: '大阪府',
    天神: '福岡県',
    広島: '広島県',
    岡山: '岡山県',
    鹿児島: '鹿児島県',
    高槻: '大阪府',
    あべの: '大阪府',
    八尾: '大阪府'
  }

  const textToCheck = storeName || characterName || ''
  for (const [location, pref] of Object.entries(locationMap)) {
    if (textToCheck.includes(location)) {
      return pref
    }
  }

  // デフォルトは東京都（多くの店舗が東京にあるため）
  return '東京都'
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
 * 住所から座標を取得する（Google Geocoding API）
 */
const geocodeAddress = async (address: string): Promise<{ latitude: number; longitude: number } | undefined> => {
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
 * プロフィールHTMLからビッカメ娘情報を抽出
 */
const parseProfileHtml = (
  html: string,
  storeId: string
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
  const description = descElement?.text.trim().replace(/\s+/g, '') || ''

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
  const addressElement = root.querySelector('.shop_info')
  const addressText = addressElement?.text || ''
  const postal_code_match = addressText.match(/〒(\d{3}-\d{4})/)
  const postal_code = postal_code_match ? postal_code_match[1] : undefined

  // 住所を取得（「住所：〒XXX-XXXX 住所本文」形式）
  let address: string | undefined
  const addressMatch = addressText.match(/住所：〒\d{3}-\d{4}\s*([^\n]+)/)
  if (addressMatch) {
    address = addressMatch[1].trim().replace(/\s+/g, '')
  }

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

  // is_biccame_musumeのデフォルト値を設定
  // ナイセン、お偉いたん、ビックシムたん、ビックカメラはfalse、それ以外はtrue
  const excludedCharacterIds = ['naisen', 'oeraitan', 'bicsim', 'biccamera']
  const is_biccame_musume = !excludedCharacterIds.includes(storeId)

  return {
    character: {
      name: _cleanName,
      aliases: _aliases.length > 0 ? _aliases : undefined,
      description,
      twitter_id,
      images: shortImages,
      is_biccame_musume
    },
    store_fields: {
      postal_code,
      phone,
      birthday,
      address
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
  prefecture?: string
  postal_code?: string
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
} | null> => {
  const root = parse(html)

  // 店舗名を取得（従来レイアウト → 新レイアウトの順でフォールバック）
  const nameElement = root.querySelector('.bcs_i_area_shop h1') || root.querySelector('.p-access__store-name')
  if (!nameElement) {
    console.warn(`  ⚠️ Store name not found for ${storeId}`)
    return null
  }
  let name = nameElement.text.trim()
  // 全角英数記号を半角に、半角カタカナを全角に変換
  name = jaconv.normalize(name)

  // 新レイアウトかどうかを判定
  const isNewLayout = !!root.querySelector('.p-access')

  // 店舗IDを取得（shop119形式またはshop-119形式）
  const shop_id_match = html.match(/shop-?(\d+)/)
  const shop_id = shop_id_match ? Number.parseInt(shop_id_match[1], 10) : undefined

  // 住所と郵便番号を取得
  let addressText = ''
  if (isNewLayout) {
    // 新レイアウト: 「住所」アコーディオン内の .p-access__text から取得
    const accordions = root.querySelectorAll('.p-access__accordion')
    for (const accordion of accordions) {
      const label = accordion.querySelector('.p-access__accordion-label')
      if (label?.text.trim() === '住所') {
        addressText = accordion.querySelector('.p-access__text')?.text.trim() || ''
        break
      }
    }
  } else {
    // 従来レイアウト
    const addressElement = root.querySelector('#shop_access .bcs_i_maintext')
    addressText = addressElement?.text.trim() || ''
  }
  const postal_code_match = addressText.match(/〒(\d{3}-\d{4})/)
  const postal_code = postal_code_match ? postal_code_match[1] : undefined
  let address = addressText.replace(/〒\d{3}-\d{4}\s*/, '').trim()
  // 全角英数記号を半角に、半角カタカナを全角に変換
  address = jaconv.normalize(address)

  // 都道府県を抽出
  const prefecture = extractPrefecture(address, name, undefined, storeId)

  // 営業時間を取得
  let hoursText = ''
  if (isNewLayout) {
    // 新レイアウト: 「営業時間」の .p-access__value から取得
    const hoursValue = root.querySelector('.p-access__value')
    hoursText = hoursValue?.text.trim().split('\n')[0].trim() || ''
  } else {
    // 従来レイアウト（2つのパターンを試す）
    let hoursElement = root.querySelector('#bcs_shop_hours .info_pickup_text p:nth-child(2)')
    if (!hoursElement) {
      hoursElement = root.querySelector('.info_pickup_text p:nth-child(2)')
    }
    hoursText = hoursElement?.text.trim() || ''
  }
  const parsed_hours = parseHours(hoursText)

  // Google Maps URLを取得（従来レイアウト → 新レイアウトの順でフォールバック）
  const mapLinkElement = root.querySelector('#shop_access .maplink a')
  let google_maps_url = mapLinkElement?.getAttribute('href') || undefined
  if (!google_maps_url && isNewLayout) {
    const mapLinks = root.querySelectorAll('.p-access__map-link a')
    for (const link of mapLinks) {
      const href = link.getAttribute('href')
      if (href?.includes('maps')) {
        google_maps_url = href
        break
      }
    }
  }

  // アクセス情報を取得
  const access: AccessInfo[] = []
  const accessElements = root.querySelectorAll('#shop_access .access dl.navi dt')
  for (const dtElement of accessElements) {
    let stationText = dtElement.childNodes
      .filter((node) => node.nodeType === 3)
      .map((node) => node.text.trim())
      .join('')
      .trim()
    // 全角英数記号を半角に、半角カタカナを全角に変換
    stationText = jaconv.normalize(stationText)

    // dtタグの直下にある括弧内の情報を出口情報として抽出（例: 「新宿三丁目駅（A5出口）」）
    const exitMatchInStation = stationText.match(/[()（）]([^()（）]+)[)）]/)
    const exitFromStation = exitMatchInStation ? exitMatchInStation[1].trim() : undefined

    // 駅名から括弧とその中身を削除（例: 「新宿三丁目駅（A5出口）」→「新宿三丁目駅」）
    stationText = stationText.replace(/[()（）][^()（）]*[)）]/g, '').trim()

    const descriptionElement = dtElement.querySelector('span')
    let descriptionText = descriptionElement?.text.trim() || ''
    // 全角英数記号を半角に、半角カタカナを全角に変換
    descriptionText = jaconv.normalize(descriptionText)
    // 括弧を削除
    descriptionText = descriptionText.replace(/[()（）]/g, '').trim()

    // 所要時間を抽出（例: 「徒歩4~8分」「徒歩5分」）
    const durationMatch = descriptionText.match(/徒歩[0-9~]+分/)
    const duration = durationMatch ? durationMatch[0] : undefined

    // 所要時間を除外
    const remainingText = descriptionText.replace(/徒歩[0-9~]+分/g, '').trim()

    // 「より」以降を追加情報として抽出（例: 「12号出口より直結」→ description: "12号出口", notes: "直結"）
    const moreMatch = remainingText.match(/(.+?)より(.+)$/)
    let description = ''
    let notes: string | undefined

    if (moreMatch) {
      description = moreMatch[1].trim()
      notes = moreMatch[2].trim()
    } else {
      description = remainingText
    }

    // spanタグがない場合、駅名から抽出した出口情報を使用
    if (!description && exitFromStation) {
      description = exitFromStation
    }

    const ddElement = dtElement.nextElementSibling
    const lines =
      ddElement?.querySelectorAll('span').map((span) => {
        let line = span.text.trim()
        // 括弧とその中身を削除（例: 「中央（快速／各駅停車）線」→「中央線」）
        line = line.replace(/[()（）][^()（）]*[)）]/g, '')
        return line
      }) || []

    if (stationText) {
      const accessInfo: AccessInfo = {
        station: stationText,
        description,
        lines
      }
      if (duration) accessInfo.duration = duration
      if (notes) accessInfo.notes = notes
      access.push(accessInfo)
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

  return {
    store_id: shop_id,
    name,
    address,
    prefecture,
    postal_code,
    open_all_year: parsed_hours.open_all_year,
    hours: parsed_hours.hours,
    access,
    parking,
    google_maps_url
  }
}

/**
 * メイン処理
 */
const main = async () => {
  try {
    console.log('📋 Parsing character and store HTML files...\n')

    // 既存のcharacters.jsonを読み込んで座標・アクセス情報のキャッシュを作成
    const existingCoordinates: Record<string, { latitude: number; longitude: number } | null> = {}
    const existingAccess: Record<string, AccessInfo[]> = {}
    if (existsSync(OUTPUT_FILE)) {
      const existingData = JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8')) as StoreInfo[]
      for (const store of existingData) {
        if (store.coordinates) {
          existingCoordinates[store.id] = store.coordinates
        }
        if (store.store?.access && store.store.access.length > 0) {
          existingAccess[store.id] = store.store.access
        }
      }
      console.log(`📦 Loaded ${Object.keys(existingCoordinates).length} cached coordinates, ${Object.keys(existingAccess).length} cached access info\n`)
    }

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
      const storePath = join(CACHE_DIR, `store_${storeId}.html`)
      if (existsSync(storePath)) {
        const storeHtml = readFileSync(storePath, 'utf-8')
        const storeData = await parseStoreHtml(storeHtml, storeId)

        if (storeData) {
          // prefecture, postal_codeをrootに移動
          storeInfo.prefecture = storeData.prefecture
          storeInfo.postal_code = profileInfo.store_fields.postal_code

          // 既存の座標があれば使用、なければGeocoding APIで取得
          if (existingCoordinates[storeId]) {
            storeInfo.coordinates = existingCoordinates[storeId]
            console.log(`  📦 Using cached coordinates: ${storeInfo.coordinates?.latitude}, ${storeInfo.coordinates?.longitude}`)
          } else if (storeData.address) {
            console.log(`  📍 Geocoding: ${storeData.address}`)
            const coordinates = await geocodeAddress(storeData.address)
            if (coordinates) {
              storeInfo.coordinates = coordinates
              console.log(`     → ${coordinates.latitude}, ${coordinates.longitude}`)
            } else {
              storeInfo.coordinates = null
            }
          }

          storeInfo.store = {
            store_id: storeData.store_id,
            name: storeData.name,
            address: storeData.address,
            phone: profileInfo.store_fields.phone,
            birthday: profileInfo.store_fields.birthday,
            open_all_year: storeData.open_all_year,
            hours: storeData.hours,
            access: storeData.access && storeData.access.length > 0
              ? storeData.access
              : existingAccess[storeId] || [],
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
        if (existingCoordinates[storeId]) {
          storeInfo.coordinates = existingCoordinates[storeId]
          console.log(`  📦 Using cached coordinates: ${storeInfo.coordinates?.latitude}, ${storeInfo.coordinates?.longitude}`)
        } else if (address) {
          console.log(`  📍 Geocoding: ${address}`)
          const coordinates = await geocodeAddress(address)
          if (coordinates) {
            storeInfo.coordinates = coordinates
            console.log(`     → ${coordinates.latitude}, ${coordinates.longitude}`)
          } else {
            storeInfo.coordinates = null
          }
        } else {
          storeInfo.coordinates = null
        }

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

    // birthday.jsonを読み込んでマージ
    if (existsSync(BIRTHDAY_FILE)) {
      console.log('\n📋 Merging birthday data...')
      const birthdayData = JSON.parse(readFileSync(BIRTHDAY_FILE, 'utf-8')) as Record<string, string>

      for (const store of stores) {
        const birthday = birthdayData[store.id]
        if (birthday && store.character) {
          store.character.birthday = birthday
        }
      }
      console.log('✓ Birthday data merged')
    }

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
    writeFileSync(OUTPUT_FILE, json, 'utf-8')

    console.log(`\n✓ Successfully parsed ${stores.length} characters`)
    console.log(`JSON output: ${OUTPUT_FILE}`)
    // 出力JSONをZodスキーマでバリデーション
    console.log('\n\ud83d\udd0d Validating output JSON...')
    const OutputStoreSchema = z.object({
      id: z.string().nonempty(),
      character: z.object({
        name: z.string().nonempty(),
        description: z.string(),
        twitter_id: z.string(),
        images: z.array(z.string()),
        is_biccame_musume: z.boolean()
      }).passthrough(),
      prefecture: z.string().nonempty().nullable(),
      coordinates: z.object({
        latitude: z.number(),
        longitude: z.number()
      }).optional().nullable(),
      postal_code: z.string().nonempty().optional().nullable()
    }).passthrough()
    const OutputStoresSchema = z.array(OutputStoreSchema).nonempty()

    const outputData = JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'))
    const validation = OutputStoresSchema.safeParse(outputData)
    if (!validation.success) {
      console.error('\n\u2717 Validation failed! Parser update required:')
      for (const issue of validation.error.issues) {
        const path = issue.path.join('.')
        const entry = typeof issue.path[0] === 'number' ? outputData[issue.path[0]] : undefined
        const id = entry?.id || 'unknown'
        console.error(`  - [${id}] ${path}: ${issue.message}`)
      }
      process.exit(1)
    }
    console.log('\u2713 Validation passed')  } catch (error) {
    console.error('\n✗ Error:', error)
    process.exit(1)
  }
}

main()
