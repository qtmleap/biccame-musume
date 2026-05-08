/**
 * End-to-end smoke test for X internal CreateTweet via the x-transaction lib.
 * Reads cookies from cookie.txt (Netscape format from Cookie-Editor) and posts
 * a one-line test tweet.
 */
import { readFileSync } from 'node:fs'
import { ClientTransaction, fetchHomePageHtml, fetchOnDemandFileText } from '../src/lib/x-transaction'

const cookieHeader = (() => {
  const lines = readFileSync('cookie.txt', 'utf-8').split('\n')
  const cookies: string[] = []
  for (const raw of lines) {
    if (!raw.trim()) continue
    const line = raw.startsWith('#HttpOnly_') ? raw.slice('#HttpOnly_'.length) : raw
    if (line.startsWith('#')) continue
    const cols = line.split('\t')
    if (cols.length < 7) continue
    const [, , , , , name, value] = cols
    if (!name) continue
    cookies.push(`${name}=${value}`)
  }
  return cookies.join('; ')
})()

const ct0 = (() => {
  const m = cookieHeader.match(/(?:^|; )ct0=([^;]+)/)
  if (!m) throw new Error('ct0 missing in cookie.txt')
  return m[1]
})()

const QUERY_ID = 'oB-5XsHNAbjvARJEc8CZFw'
const PATH = `/i/api/graphql/${QUERY_ID}/CreateTweet`
const URL_FULL = `https://x.com${PATH}`
// Bearer is hardcoded in https://abs.twimg.com/responsive-web/client-web/main.<hash>.js
// and rotates every few months. Note: in the bundle it's split across two
// concatenated string literals, so a naive single-quoted-regex extraction
// truncates the suffix.
const BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

console.log('1) fetch home page + ondemand.s')
const homePageHtml = await fetchHomePageHtml()
const ondemandFileText = await fetchOnDemandFileText(homePageHtml)
console.log(`   home: ${homePageHtml.length} bytes, ondemand: ${ondemandFileText.length} bytes`)

console.log('2) build ClientTransaction + transaction id')
const tx = ClientTransaction.create({ homePageHtml, ondemandFileText })
const transactionId = await tx.generateTransactionId('POST', PATH)
console.log(`   x-client-transaction-id: ${transactionId}`)

const tweetText = `[内部 API + x-client-transaction-id 疎通] ${new Date().toISOString()}`
console.log(`3) POST CreateTweet: ${tweetText}`)

const body = {
  variables: {
    tweet_text: tweetText,
    dark_request: false,
    media: { media_entities: [], possibly_sensitive: false },
    semantic_annotation_ids: []
  },
  features: {
    communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    responsive_web_grok_analyze_button_fetch_trends_enabled: false,
    responsive_web_grok_analyze_post_followups_enabled: true,
    responsive_web_jetfuel_frame: false,
    responsive_web_grok_share_attachment_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    responsive_web_grok_show_grok_translated_post: false,
    responsive_web_grok_analysis_button_from_backend: true,
    creator_subscriptions_quote_tweet_preview_enabled: false,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    articles_preview_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_enhance_cards_enabled: false
  },
  queryId: QUERY_ID
}

const res = await fetch(URL_FULL, {
  method: 'POST',
  headers: {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9,ja;q=0.8',
    authorization: `Bearer ${BEARER}`,
    'content-type': 'application/json',
    cookie: cookieHeader,
    origin: 'https://x.com',
    priority: 'u=1, i',
    referer: 'https://x.com/home',
    'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    'x-client-transaction-id': transactionId,
    'x-csrf-token': ct0,
    'x-twitter-active-user': 'yes',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-client-language': 'en'
  },
  body: JSON.stringify(body)
})

const text = await res.text()
console.log(`status: ${res.status}`)
console.log(`body : ${text.slice(0, 1500)}`)
