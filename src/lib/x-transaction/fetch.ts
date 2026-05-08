import { extractOnDemandFileUrl } from './html-extract'

const HOMEPAGE_HEADERS: HeadersInit = {
  authority: 'x.com',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  referer: 'https://x.com',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'x-twitter-active-user': 'yes',
  'x-twitter-client-language': 'en'
}

const MIGRATION_REDIRECT_RE = /(https?:\/\/(?:www\.)?(?:twitter|x)\.com(?:\/x)?\/migrate(?:[/?])?tok=[A-Za-z0-9%\-_]+)/

const extractMigrationFormAction = (html: string): { url: string; data: Record<string, string> } | null => {
  const formMatch = html.match(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i)
  if (!formMatch) return null
  const url = formMatch[1]
  const inputs = [...formMatch[2].matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)]
  const data: Record<string, string> = {}
  for (const m of inputs) data[m[1]] = m[2]
  return { url, data }
}

/**
 * Fetch the x.com home page HTML, following a migration redirect+POST if Twitter
 * inserts one (returning the final HTML).
 */
export const fetchHomePageHtml = async (): Promise<string> => {
  const initial = await fetch('https://x.com/', { headers: HOMEPAGE_HEADERS })
  const initialHtml = await initial.text()

  const redirectMatch = initialHtml.match(MIGRATION_REDIRECT_RE)
  const afterRedirectHtml = redirectMatch
    ? await (await fetch(redirectMatch[1], { headers: HOMEPAGE_HEADERS })).text()
    : initialHtml

  const form = extractMigrationFormAction(afterRedirectHtml)
  if (!form) return afterRedirectHtml

  const body = new URLSearchParams(form.data).toString()
  const final = await fetch(form.url, {
    method: 'POST',
    headers: { ...HOMEPAGE_HEADERS, 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  return final.text()
}

export const fetchOnDemandFileText = async (homePageHtml: string): Promise<string> => {
  const url = extractOnDemandFileUrl(homePageHtml)
  const res = await fetch(url, { headers: HOMEPAGE_HEADERS })
  if (!res.ok) throw new Error(`Failed to fetch ondemand.s: ${res.status}`)
  return res.text()
}
