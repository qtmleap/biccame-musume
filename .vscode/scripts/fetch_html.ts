#!/usr/bin/env bun
/**
 * ビックカメ娘のHTMLを取得してキャッシュするスクリプト
 * - プロフィール一覧ページと各キャラクターの詳細ページをダウンロード
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
    console.warn('⚠️  Cookie file not found, continuing without cookies')
    return ''
  }

  try {
    const cookieContent = readFileSync(COOKIE_FILE, 'utf-8').trim()

    // Netscape Cookie形式かどうか判定（'#'で始まるか、タブ区切りがあるか）
    const isNetscapeFormat = cookieContent.startsWith('#') || cookieContent.includes('\t')

    let cookieString: string
    if (isNetscapeFormat) {
      // Netscape形式の場合はCookieJarでパース
      const jar = new CookieJar(cookieContent)
      cookieString = jar.toString()
    } else {
      // すでにCookie文字列形式の場合はそのまま使用
      cookieString = cookieContent
    }

    console.log('✓ Loaded cookies from file')
    console.log(`  Cookie string length: ${cookieString.length} chars`)
    console.log(`  Cookie preview: ${cookieString.substring(0, 100)}...`)
    return cookieString
  } catch (error) {
    console.error('Failed to load cookies:', error)
    return ''
  }
}

/**
 * URLからHTMLを取得してキャッシュ
 */
const fetchHtml = async (
  url: string,
  cachePath: string,
  timeout = 10000,
  encoding: 'utf-8' | 'shift_jis' = 'utf-8',
  useCookies = false
): Promise<void> => {
  // キャッシュディレクトリがなければ作成
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }

  // キャッシュがあればスキップ
  if (existsSync(cachePath)) {
    console.log(`✓ Already cached: ${cachePath}`)
    return
  }

  // リモートから取得
  console.log(`Fetching: ${url}`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-User': '?1',
      'Sec-Fetch-Dest': 'document',
      'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"'
    }

    if (useCookies) {
      const cookieString = loadCookies()
      if (cookieString) {
        headers.Cookie = cookieString
      }
    }

    const response = await fetch(url, {
      signal: controller.signal,
      headers
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    let html: string
    if (encoding === 'shift_jis') {
      // Shift_JISのレスポンスをデコード
      const buffer = await response.arrayBuffer()
      const decoder = new TextDecoder('shift_jis')
      html = decoder.decode(buffer)
    } else {
      html = await response.text()
    }

    writeFileSync(cachePath, html, 'utf-8')
    console.log(`✓ Cached: ${cachePath}`)
  } catch (error) {
    clearTimeout(timeoutId)
    console.error(`✗ Failed: ${url}`)
    console.error(`  ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

/**
 * メイン処理
 */
const main = async () => {
  try {
    console.log('=== Fetching Profile Index ===')
    await fetchHtml(PROFILE_URL, PROFILE_CACHE_PATH)

    console.log('\n=== Extracting Detail URLs ===')
    const html = readFileSync(PROFILE_CACHE_PATH, 'utf-8')
    const root = parse(html)

    // 詳細ページのリンクを抽出
    const detailLinks = root.querySelectorAll('a[href*="/profile/"][href$=".html"]')
    const urls: Array<{ key: string; url: string }> = []

    for (const link of detailLinks) {
      const href = link.getAttribute('href')
      if (href && !href.includes('index.html')) {
        const keyMatch = href.match(/\/profile\/([^/]+)\.html/)
        if (keyMatch) {
          const key = keyMatch[1]
          const url = href.startsWith('http') ? href : `https://biccame.jp${href}`
          urls.push({ key, url })
        }
      }
    }

    // 重複を除去
    const uniqueUrls = Array.from(new Map(urls.map((item) => [item.key, item])).values())
    console.log(`Found ${uniqueUrls.length} character detail pages`)

    console.log('\n=== Fetching Character Details ===')
    for (let i = 0; i < uniqueUrls.length; i++) {
      const { key, url } = uniqueUrls[i]
      const cachePath = join(CACHE_DIR, `profile_${key}.html`)
      console.log(`[${i + 1}/${uniqueUrls.length}] ${key}`)
      await fetchHtml(url, cachePath)
    }

    console.log('\n=== Fetching Store Pages ===')
    for (let i = 0; i < uniqueUrls.length; i++) {
      const { key } = uniqueUrls[i]
      const profilePath = join(CACHE_DIR, `profile_${key}.html`)

      if (!existsSync(profilePath)) {
        console.log(`[${i + 1}/${uniqueUrls.length}] ${key} - Skip (no profile HTML)`)
        continue
      }

      // プロフィールHTMLから店舗IDを抽出
      const profileHtml = readFileSync(profilePath, 'utf-8')
      const profileRoot = parse(profileHtml)
      const storeLink = profileRoot.querySelector('a[href*="shoplist"]')

      if (!storeLink) {
        console.log(`[${i + 1}/${uniqueUrls.length}] ${key} - Skip (no store link)`)
        continue
      }

      const href = storeLink.getAttribute('href')
      if (!href) {
        console.log(`[${i + 1}/${uniqueUrls.length}] ${key} - Skip (invalid link)`)
        continue
      }

      // 店舗IDを抽出（例: shop-109.html -> 109, shop115.jsp -> 115）
      const shopIdMatch = href.match(/shop[-]?(\d+)\.(html|jsp)/)
      if (!shopIdMatch) {
        console.log(`[${i + 1}/${uniqueUrls.length}] ${key} - Skip (no shop ID)`)
        continue
      }

      const shopId = shopIdMatch[1]
      const storeUrl = `https://www.biccamera.com/bc/i/shop/shoplist/shop${shopId}.jsp`
      const storeCachePath = join(CACHE_DIR, `store_${key}.html`)

      console.log(`[${i + 1}/${uniqueUrls.length}] ${key} - shop${shopId}`)
      try {
        await fetchHtml(storeUrl, storeCachePath, 5000, 'shift_jis', true)
      } catch (_error) {
        console.error(`  ⚠️ Failed to fetch store page, continuing...`)
      }
    }

    console.log('\n✓ All HTML files cached successfully!')
    console.log(`Cache directory: ${CACHE_DIR}`)
  } catch (error) {
    console.error('\n✗ Error:', error)
    process.exit(1)
  }
}

main()
