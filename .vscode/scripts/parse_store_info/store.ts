import jaconv from 'jaconv'
import { parse } from 'node-html-parser'
import { parseHours } from '../lib/hours'
import { extractPrefecture } from '../lib/prefecture'
import { parseAccess } from './access'
import { parseParking } from './parking'
import type { AccessInfo, ParkingInfo } from './types'

/**
 * HTMLから店舗情報を抽出
 */
export const parseStoreHtml = async (
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
  const access = parseAccess(root)

  // 駐車場情報を取得
  const parking = parseParking(root)

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
