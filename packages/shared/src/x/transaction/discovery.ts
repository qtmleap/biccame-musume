import { INDICES_REGEX } from './constants'

/** Acquire transaction material without evaluating any remotely supplied JavaScript. */
export type TransactionInputs = { homePageHtml: string; ondemandFileText: string }
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
const HEADERS = { 'user-agent': DEFAULT_USER_AGENT, 'accept-language': 'en-US,en;q=0.9' }
const MAX_REQUESTS = 16
const MAX_DEPTH = 3
// チャンク名がハッシュのみになり URL に sign が現れなくなったため、署名モジュールは本文の内容でも判定する。
// 行インデックスと鍵バイト添字の最低2つが揃わないと ClientTransaction が誤った鍵で黙って動いてしまう。
const MIN_INDICES_MATCHES = 2
// 署名モジュールの動的 import は、ヘッダー名 client-transaction の近く(約500文字手前)に書かれている。
const HEADER_NAME = /client-transaction/g
const HEADER_PROXIMITY = 2000
const SIGNER_URL = /\/sign[.-][^/]*\.js(?:\?|$)/

export function getOndemandFileUrl(html: string): string | null {
  const index = /,(\d+):["']ondemand\.s["']/.exec(html)?.[1]
  if (!index) return null
  const hash = new RegExp(`,${index}:["']([0-9a-f]+)["']`).exec(html)?.[1]
  return hash ? `https://abs.twimg.com/responsive-web/client-web/ondemand.s.${hash}a.js` : null
}
function assetUrl(value: string, base: string): string | null {
  try {
    if (value.includes('${')) return null
    const url = new URL(value, base)
    return url.protocol === 'https:' &&
      url.hostname === 'abs.twimg.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith('/x-web/') &&
      url.pathname.endsWith('.js')
      ? url.href
      : null
  } catch {
    return null
  }
}
function bootstrapUrls(html: string): string[] {
  const urls = new Set<string>()
  // 従来の <script src> に加え、現行の x.com は inline script の変数 entryHref にエントリを埋め込む。
  // どちらも assetUrl() の検証と entry-client の条件を同じように通す。
  const patterns = [/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi, /\bentryHref\s*=\s*["']([^"']+)["']/g]
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const url = assetUrl(match[1], 'https://x.com/')
      if (url && /entry-client/.test(url)) urls.add(url)
    }
  }
  return [...urls]
}
async function read(url: string): Promise<string> {
  const response = await fetch(url, { headers: HEADERS, redirect: 'manual' })
  if (!response.ok) throw new Error(`Failed to fetch transaction input: ${response.status}`)
  return response.text()
}
function homeUrl(value: string, base: string, migration = false): string {
  const url = new URL(value, base)
  const hosts = ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']
  const allowed = migration ? /^\/(?:x\/)?migrate\/?$/ : /^\/(?:home\/?|(?:x\/)?migrate\/?|i\/(?:jf|flow\/)[^?#]*)?$/
  if (
    url.protocol !== 'https:' ||
    !hosts.includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !allowed.test(url.pathname)
  ) {
    throw new Error(`Unsafe transaction ${migration ? 'migration' : 'redirect'} URL`)
  }
  return url.href
}
async function readHome(initialUrl: string): Promise<string> {
  let url = initialUrl
  let body: string | undefined
  for (let step = 0; step < 5; step++) {
    const response = await fetch(url, {
      headers: body !== undefined ? { ...HEADERS, 'content-type': 'application/x-www-form-urlencoded' } : HEADERS,
      redirect: 'manual',
      method: body !== undefined ? 'POST' : 'GET',
      body
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Transaction redirect missing location')
      url = homeUrl(location, url)
      if (![307, 308].includes(response.status)) body = undefined
      continue
    }
    if (!response.ok) throw new Error(`Failed to fetch transaction homepage: ${response.status}`)
    const html = await response.text()
    const migration = html.match(
      /https?:\/\/(?:www\.)?(?:twitter|x)\.com(?:\/x)?\/migrate(?:[/?])?tok=[A-Za-z0-9%\-_]+/
    )
    if (migration) {
      url = homeUrl(migration[0], url, true)
      body = undefined
      continue
    }
    const form = html.match(/<form[^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/i)
    if (form && /migrate/i.test(form[1])) {
      url = homeUrl(form[1], url, true)
      const data = new URLSearchParams()
      for (const input of form[2].matchAll(/<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/g))
        data.set(input[1], input[2])
      body = data.toString()
      continue
    }
    return html
  }
  throw new Error('Too many transaction homepage redirects or migration steps')
}
export async function fetchHomePageHtml(): Promise<string> {
  const html = await readHome('https://x.com/')
  if (getOndemandFileUrl(html) || bootstrapUrls(html).length) return html
  const fallback = await readHome('https://x.com/home')
  if (getOndemandFileUrl(fallback) || bootstrapUrls(fallback).length) return fallback
  throw new Error('No usable transaction bootstrap found on X homepage')
}
type Candidate = { url: string; priority: number }
// 小さいほど先に取得する。ファイル名が sign なら最優先、sentry/transaction は次点。
const urlPriority = (url: string) => (/\/sign[.-]/.test(url) ? 0 : /sentry|transaction/.test(url) ? 1 : 2)
const looksLikeSigner = (url: string, source: string) =>
  SIGNER_URL.test(url) || [...source.matchAll(INDICES_REGEX)].length >= MIN_INDICES_MATCHES
function importUrls(source: string, base: string): Candidate[] {
  const headers = [...source.matchAll(HEADER_NAME)].map((match) => match.index)
  const priorities = new Map<string, number>()
  const pattern = /\b(?:import\s*\(\s*|import\s*(?:[^"'`;]*?\bfrom\s*)?|export\s+[^;]*?\bfrom\s*)["'`]([^"'`]+)["'`]/g
  for (const match of source.matchAll(pattern)) {
    const url = assetUrl(match[1], base)
    if (!url) continue
    const near = headers.some((position) => Math.abs(position - match.index) <= HEADER_PROXIMITY)
    const priority = near ? 0 : urlPriority(url)
    const current = priorities.get(url)
    // 同じ URL が複数回現れたら最も高い優先度(小さい値)を採用する
    priorities.set(url, current === undefined ? priority : Math.min(current, priority))
  }
  return [...priorities].map(([url, priority]) => ({ url, priority }))
}
/** The historical name includes the current x-web signer module as well as ondemand.s. */
export async function fetchOnDemandFileText(homePageHtml: string): Promise<string> {
  const legacyUrl = getOndemandFileUrl(homePageHtml)
  if (legacyUrl) return read(legacyUrl)
  const queue = bootstrapUrls(homePageHtml).map((url) => ({ url, depth: 0, priority: urlPriority(url) }))
  const visited = new Set<string>()
  while (queue.length && visited.size < MAX_REQUESTS) {
    const item = queue.shift()
    if (!item || visited.has(item.url)) continue
    visited.add(item.url)
    const source = await read(item.url)
    if (looksLikeSigner(item.url, source)) return source
    if (item.depth < MAX_DEPTH) {
      const imports = importUrls(source, item.url).map(({ url, priority }) => ({
        url,
        depth: item.depth + 1,
        priority
      }))
      queue.push(...imports)
      queue.sort((a, b) => a.priority - b.priority || a.depth - b.depth)
    }
  }
  throw new Error(`Could not discover transaction signer (searched ${visited.size} modules, limit ${MAX_REQUESTS})`)
}
export async function fetchTransactionInputs(): Promise<TransactionInputs> {
  const homePageHtml = await fetchHomePageHtml()
  return { homePageHtml, ondemandFileText: await fetchOnDemandFileText(homePageHtml) }
}
