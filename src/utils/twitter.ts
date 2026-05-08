import { ClientTransaction, fetchHomePageHtml, fetchOnDemandFileText } from '@/lib/x-transaction'
import { CHARACTER_NAME_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import type { EventDetail } from '@/schemas/event.dto'
import type { Bindings } from '@/types/bindings'

const CREATE_TWEET_QUERY_ID = 'oB-5XsHNAbjvARJEc8CZFw'
const CREATE_TWEET_PATH = `/i/api/graphql/${CREATE_TWEET_QUERY_ID}/CreateTweet`
// Bearer is hardcoded in https://abs.twimg.com/responsive-web/client-web/main.<hash>.js
// as two concatenated string literals, rotates infrequently. Re-extract from a live
// browser request when 401 "Could not authenticate you" starts appearing.
const X_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

const HOME_PAGE_CACHE_KEY = 'https://x-transaction-cache.local/home-page'
const ONDEMAND_CACHE_KEY = 'https://x-transaction-cache.local/ondemand'
const CACHE_TTL_SECONDS = 60 * 30

const extractTweetId = (url: string): string | null => {
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/)
  return match ? match[1] : null
}

const generateTweetText = (event: EventDetail, isUpdate: boolean): string => {
  const action = isUpdate ? '更新' : '追加'
  const store = event.stores[0]
  const storeName = STORE_NAME_LABELS[store]
  const characterName = CHARACTER_NAME_LABELS[store] || storeName
  const length = event.stores.length
  const storeText = length === 1 ? characterName : `${characterName}など${length}店舗`
  return [
    `${storeText}の「${event.title}」を${action}しました！`,
    '',
    `https://biccame-musume.com/events/${event.uuid}`,
    '',
    '#ビッカメ娘',
    '#ビックカメラ',
    `#${storeName}`,
    `#${characterName}`
  ].join('\n')
}

const getQuoteTweetId = (event: EventDetail): string | undefined => {
  if (!event.referenceUrls || event.referenceUrls.length === 0) return undefined
  const announceUrl = event.referenceUrls.find((ref) => ref.type === 'announce')
  const targetUrl = announceUrl?.url || event.referenceUrls[0].url
  return extractTweetId(targetUrl) ?? undefined
}

/**
 * Cached fetch of the X home page + ondemand.s file. Re-fetched at most every
 * `CACHE_TTL_SECONDS` to keep CPU/bandwidth bounded — the underlying key/animation
 * material rotates infrequently.
 */
const getCachedTransactionInputs = async (): Promise<{ homePageHtml: string; ondemandFileText: string }> => {
  const cache = await caches.open('x-transaction')
  const cachedHome = await cache.match(HOME_PAGE_CACHE_KEY)
  const cachedOndemand = await cache.match(ONDEMAND_CACHE_KEY)
  if (cachedHome && cachedOndemand) {
    return { homePageHtml: await cachedHome.text(), ondemandFileText: await cachedOndemand.text() }
  }
  const homePageHtml = await fetchHomePageHtml()
  const ondemandFileText = await fetchOnDemandFileText(homePageHtml)
  const cacheControl = `max-age=${CACHE_TTL_SECONDS}`
  await Promise.all([
    cache.put(HOME_PAGE_CACHE_KEY, new Response(homePageHtml, { headers: { 'cache-control': cacheControl } })),
    cache.put(ONDEMAND_CACHE_KEY, new Response(ondemandFileText, { headers: { 'cache-control': cacheControl } }))
  ])
  return { homePageHtml, ondemandFileText }
}

const buildCreateTweetBody = (text: string, quoteTweetId: string | undefined): string =>
  JSON.stringify({
    variables: {
      tweet_text: text,
      dark_request: false,
      media: { media_entities: [], possibly_sensitive: false },
      semantic_annotation_ids: [],
      ...(quoteTweetId ? { attachment_url: `https://x.com/i/status/${quoteTweetId}` } : {})
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
    queryId: CREATE_TWEET_QUERY_ID
  })

export class Twitter {
  constructor(private env: Bindings) {}

  async tweet(text: string, quoteTweetId?: string): Promise<void> {
    const { TWITTER_AUTH_TOKEN, TWITTER_CSRF_TOKEN } = this.env

    const { homePageHtml, ondemandFileText } = await getCachedTransactionInputs()
    const tx = ClientTransaction.create({ homePageHtml, ondemandFileText })
    const transactionId = await tx.generateTransactionId('POST', CREATE_TWEET_PATH)

    const url = `https://x.com${CREATE_TWEET_PATH}`
    const body = buildCreateTweetBody(text, quoteTweetId)

    console.log('[Twitter] Posting tweet:', { textLength: text.length, quoteTweetId })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9,ja;q=0.8',
        authorization: `Bearer ${X_BEARER}`,
        'content-type': 'application/json',
        cookie: `auth_token=${TWITTER_AUTH_TOKEN}; ct0=${TWITTER_CSRF_TOKEN}`,
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
        'x-csrf-token': TWITTER_CSRF_TOKEN,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en'
      },
      body
    })

    if (!response.ok) {
      const errorText = await response.text()
      if (quoteTweetId && response.status === 403) {
        console.warn('[Twitter] Quote tweet not allowed, retrying without quote:', { quoteTweetId, error: errorText })
        return await this.tweet(text, undefined)
      }
      throw new Error(`X API error: ${response.status} ${errorText}`)
    }

    const result = await response.json()
    console.log('[Twitter] Tweet posted successfully:', result)
  }

  async tweetEventCreated(event: EventDetail): Promise<void> {
    await this.tweet(generateTweetText(event, false), getQuoteTweetId(event))
  }

  async tweetEventUpdated(event: EventDetail): Promise<void> {
    await this.tweet(generateTweetText(event, true), getQuoteTweetId(event))
  }
}
