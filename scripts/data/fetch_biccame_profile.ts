#!/usr/bin/env bun

/**
 * ビックカメ娘のプロフィールページから情報を取得してJSONファイルに保存するスクリプト
 * - HTMLをローカルにキャッシュして2回目以降は高速化
 * - Cloudflare Workers互換のnode-html-parserを使用
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CookieJar } from 'netscape-cookies-parser'
import { parse } from 'node-html-parser'

const PROFILE_URL = 'https://biccame.jp/profile/'
const CACHE_DIR = join(import.meta.dir, '../archive/html_cache')
const PROFILE_CACHE_PATH = join(CACHE_DIR, 'profile_index.html')
const COOKIE_FILE = join(import.meta.dir, 'cookie.txt')

/**
 * Cookieファイルを読み込んでCookie文字列を生成
 */
const loadCookies = (): string => {
  if (!existsSync(COOKIE_FILE)) {
    return ''
  }

  try {
    const cookieContent = readFileSync(COOKIE_FILE, 'utf-8').trim()

    // Netscape Cookie形式かどうか判定（'#'で始まるか、タブ区切りがあるか）
    const isNetscapeFormat = cookieContent.startsWith('#') || cookieContent.includes('\t')

    if (isNetscapeFormat) {
      // Netscape形式の場合はCookieJarでパース
      const jar = new CookieJar(cookieContent)
      return jar.toString()
    }

    // すでにCookie文字列形式の場合はそのまま使用
    return cookieContent
  } catch (error) {
    console.error('Failed to load cookies:', error)
    return ''
  }
}

/**
 * アクセス情報の型定義
 */
type AccessInfo = {
  station: string
  exit?: string
  lines: string[]
}

/**
 * キャラクター情報の型定義
 */
type CharacterInfo = {
  key?: string
  character_name: string
  store_name?: string
  description?: string
  twitter_url?: string
  profile_image_url?: string
  detail_url?: string
  // 詳細ページから取得される情報
  zipcode?: string
  address?: string
  phone?: string
  store_url?: string
  birthday?: string
  store_birthday?: string
  store_link?: string
  image_urls?: string[]
  // 営業時間情報
  is_open_all_year?: boolean
  opening_time?: string
  closing_time?: string
  // アクセス情報
  access?: AccessInfo[]
}

/**
 * URLからHTMLを取得（ローカルキャッシュがあればそれを使用）
 */
const fetchHtml = async (url: string, cachePath: string, timeout = 10000, useCookies = false): Promise<string> => {
  // キャッシュディレクトリがなければ作成
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }

  // キャッシュがあればそれを使用
  if (existsSync(cachePath)) {
    console.log(`Using cached HTML from ${cachePath}`)
    return readFileSync(cachePath, 'utf-8')
  }

  // リモートから取得
  console.log(`Fetching HTML from ${url}...`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0'
  }

  // Cookieを追加
  if (useCookies) {
    const cookieStr = loadCookies()
    if (cookieStr) {
      headers.Cookie = cookieStr
    }
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()

    // キャッシュに保存
    writeFileSync(cachePath, html, 'utf-8')
    console.log(`Cached HTML to ${cachePath}`)

    return html
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout (${timeout}ms) fetching ${url}`)
    }
    throw error
  }
}

/**
 * プロフィール一覧ページからキャラクター情報を抽出
 */
const parseCharacterInfo = (htmlContent: string): CharacterInfo[] => {
  const root = parse(htmlContent)
  const characters: CharacterInfo[] = []
  const seenNames = new Set<string>()

  // キャラクター名が定義されている要素を探す（セクションタイトルは除外）
  const profileNameDivs = root.querySelectorAll('div.profile_name')

  for (const nameDiv of profileNameDivs) {
    // align="center"のdivはセクションタイトルなので除外
    if (nameDiv.getAttribute('align') === 'center') {
      continue
    }

    const character: CharacterInfo = {
      character_name: ''
    }

    // キャラクター名を取得
    let charName = nameDiv.text.trim()
    // 「（ 別名 ）」形式を「/別名」に変換
    charName = charName.replace(/（\s*([^）]+?)\s*）/g, '/$1')
    character.character_name = charName

    // 同じ親要素内の店舗名を取得
    const parent = nameDiv.parentNode
    if (parent) {
      const shopDiv = parent.querySelector('div.profile_shop')
      if (shopDiv) {
        // 改行を空白に変換してクリーンアップ
        let storeName = shopDiv.text.split(/\s+/).join(' ').trim()
        // 「ビックカメラ」を削除して前後のスペースをトリム
        storeName = storeName.replace('ビックカメラ', '').trim()
        character.store_name = storeName
      }

      // さらに上の親要素から詳細情報を取得
      const grandparent = parent.parentNode
      if (grandparent) {
        // 詳細ページへのリンク
        const detailLink = grandparent.querySelector('a[href*="/profile/"][href$=".html"]')
        if (detailLink) {
          const href = detailLink.getAttribute('href')
          if (href) {
            character.detail_url = href.startsWith('/') ? `https://biccame.jp${href}` : href

            // URLからキーを抽出（例: /profile/mito.html -> mito）
            const keyMatch = href.match(/\/profile\/([^/]+)\.html/)
            if (keyMatch) {
              character.key = keyMatch[1]
            }
          }
        }

        // 説明文
        const descElem = grandparent.querySelector('p')
        if (descElem) {
          character.description = descElem.text.trim()
        }

        // Twitterリンク
        const twitterLink = grandparent.querySelector('a[href*="twitter.com"]')
        if (twitterLink) {
          const href = twitterLink.getAttribute('href')
          if (href) {
            character.twitter_url = href
          }
        }

        // 一覧ページのプロフィール画像を取得
        const profileImg = grandparent.querySelector('img[src*="/profile/"][src$=".png"]')
        if (profileImg) {
          let imgUrl = profileImg.getAttribute('src')
          if (imgUrl) {
            if (imgUrl.startsWith('/')) {
              imgUrl = `https://biccame.jp${imgUrl}`
            }
            character.profile_image_url = imgUrl
          }
        }
      }
    }

    // 有効なキャラクターのみ追加（重複チェック）
    if (character.character_name && !seenNames.has(character.character_name)) {
      seenNames.add(character.character_name)
      characters.push(character)
    }
  }

  return characters
}

/**
 * 詳細ページから追加情報を取得
 */
const fetchDetailPage = async (url: string, key: string): Promise<Partial<CharacterInfo>> => {
  try {
    const cachePath = join(CACHE_DIR, `profile_${key}.html`)
    const html = await fetchHtml(url, cachePath)
    const root = parse(html)
    const detailInfo: Partial<CharacterInfo> = {}

    // テキスト全体を取得
    const infoText = root.text

    // 住所を抽出（〒記号を含む行を探す）
    const addressMatch = infoText.match(/〒([\d-]+)\s*(.+?)(?:\n|電話)/)
    if (addressMatch) {
      detailInfo.zipcode = addressMatch[1].trim()
      detailInfo.address = addressMatch[2].trim()
    }

    // 電話番号を抽出
    const phoneMatch = infoText.match(/電話[：:]\s*([\d-]+)/)
    if (phoneMatch) {
      detailInfo.phone = phoneMatch[1]
    }

    // 店舗URLを抽出（shoplistのjspページ）
    const storeUrlMatch = infoText.match(/(https?:\/\/www\.biccamera\.com\/bc\/i\/shop\/shoplist\/[^\s)]+\.jsp)/)
    if (storeUrlMatch) {
      detailInfo.store_url = storeUrlMatch[1]
    }

    // 誕生日を抽出
    const birthdayMatch = infoText.match(/誕生日[：:]\s*(\d+月\d+日)/)
    if (birthdayMatch) {
      detailInfo.birthday = birthdayMatch[1]
    }

    // 店舗誕生日を抽出
    const shopInfoDivs = root.querySelectorAll('div.shop_info')
    for (const div of shopInfoDivs) {
      const divText = div.text
      if (divText.includes('店舗誕生日')) {
        const storeBirthdayMatch = divText.match(/(\d{4})年(\d{2})月(\d{2})日/)
        if (storeBirthdayMatch) {
          detailInfo.store_birthday = `${storeBirthdayMatch[1]}-${storeBirthdayMatch[2]}-${storeBirthdayMatch[3]}`
          break
        }
      }
    }

    // 営業時間を抽出（例: 年中無休 10:00 ～ 20:00）
    const businessHoursMatch = infoText.match(/(年中無休)?\s*(\d{1,2}:\d{2})\s*[～~〜-]\s*(\d{1,2}:\d{2})/)
    if (businessHoursMatch) {
      detailInfo.is_open_all_year = !!businessHoursMatch[1]
      detailInfo.opening_time = businessHoursMatch[2]
      detailInfo.closing_time = businessHoursMatch[3]
    }

    // アクセス情報を抽出（dl.navi から構造化データとして取得）
    const naviDl = root.querySelector('dl.navi')
    if (naviDl) {
      const accessList: AccessInfo[] = []
      const dts = naviDl.querySelectorAll('dt')
      const dds = naviDl.querySelectorAll('dd')

      for (let i = 0; i < dts.length; i++) {
        const dt = dts[i]
        const stationText = dt.text.trim()

        // 空の dt はスキップ
        if (!stationText) continue

        const accessInfo: AccessInfo = {
          station: '',
          lines: []
        }

        // 駅名と出口情報を抽出
        const span = dt.querySelector('span')
        if (span) {
          // span タグがある場合、その前のテキストが駅名
          const fullText = dt.text.trim()
          const spanText = span.text.trim()
          accessInfo.station = fullText.replace(spanText, '').trim()
          accessInfo.exit = spanText
        } else {
          // span タグがない場合、テキスト全体が駅名
          accessInfo.station = stationText
        }

        // 対応する dd から路線情報を取得
        if (i < dds.length) {
          const dd = dds[i]
          const lineSpans = dd.querySelectorAll('span')
          for (const lineSpan of lineSpans) {
            const lineText = lineSpan.text.trim()
            if (lineText) {
              accessInfo.lines.push(lineText)
            }
          }
        }

        // 駅名があれば追加
        if (accessInfo.station) {
          accessList.push(accessInfo)
        }
      }

      if (accessList.length > 0) {
        detailInfo.access = accessList
      }
    }

    // 店舗リンクを抽出して店舗IDを取得し、.jsp形式のURLを構築
    const storeLink = root.querySelector('a[href*="shoplist"]')
    if (storeLink) {
      const href = storeLink.getAttribute('href')
      if (href) {
        // 店舗IDを抽出（例: shop-109.html -> 109, shop115.jsp -> 115）
        const shopIdMatch = href.match(/shop[-]?(\d+)\.(html|jsp)/)
        if (shopIdMatch) {
          const shopId = shopIdMatch[1]
          // .jsp形式のURLを構築
          detailInfo.store_link = `https://www.biccamera.com/bc/i/shop/shoplist/shop${shopId}.jsp`

          // 店舗リンクのHTMLキャッシュは後で実装
          // TODO: Cookie認証が必要なため、別途対応
        }
      }
    }

    // 画像URLを配列で取得（/profile/配下の画像全て）
    const imageUrls: string[] = []
    const images = root.querySelectorAll('img[src*="/profile/"][src$=".png"]')
    for (const img of images) {
      let imgUrl = img.getAttribute('src')
      if (imgUrl) {
        if (imgUrl.startsWith('/')) {
          imgUrl = `https://biccame.jp${imgUrl}`
        }
        if (!imageUrls.includes(imgUrl)) {
          imageUrls.push(imgUrl)
        }
      }
    }

    if (imageUrls.length > 0) {
      detailInfo.image_urls = imageUrls
    }

    return detailInfo
  } catch (error) {
    console.error(`Error fetching detail page ${url}:`, error)
    return {}
  }
}

/**
 * メイン処理
 */
const main = async () => {
  try {
    console.log('Fetching profile page...')
    const htmlContent = await fetchHtml(PROFILE_URL, PROFILE_CACHE_PATH)

    console.log('Parsing character information...')
    const characters = parseCharacterInfo(htmlContent)

    console.log(`Found ${characters.length} characters`)

    // 全キャラクターの詳細情報を取得
    console.log('Fetching details for all characters...')
    for (let i = 0; i < characters.length; i++) {
      const char = characters[i]
      if (char.detail_url && char.key) {
        console.log(`  [${i + 1}/${characters.length}] ${char.character_name}...`)
        const detailInfo = await fetchDetailPage(char.detail_url, char.key)
        Object.assign(char, detailInfo)
      }
    }

    // JSONとして保存
    const outputPath = join(import.meta.dir, '../archive/biccame_characters.json')
    writeFileSync(outputPath, JSON.stringify(characters, null, 2), 'utf-8')
    console.log(`\nSaved to ${outputPath}`)
    console.log(`Total characters: ${characters.length}`)
  } catch (error) {
    console.error('Error:', error)
    throw error
  }
}

// 実行
main()
