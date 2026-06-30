import { z } from 'zod'
import { ClientTransaction, fetchHomePageHtml, fetchOnDemandFileText } from '@/lib/x-transaction'
import type { Event, EventDetail } from '@/schemas/event.dto'
import type { Bindings } from '@/types/bindings'
import {
  buildDailySummaryTweets,
  buildEndingTodaySummaryTweets,
  buildEventCreatedText,
  buildEventUpdatedText,
  getQuoteTweetId
} from '@/utils/tweet-text'

const CREATE_TWEET_QUERY_ID = 'oB-5XsHNAbjvARJEc8CZFw'
const CREATE_TWEET_PATH = `/i/api/graphql/${CREATE_TWEET_QUERY_ID}/CreateTweet`
// UserByScreenName GraphQL queryId. Like CREATE_TWEET, this rotates infrequently;
// re-extract from a live browser request when 404 / "operation not found" appears.
const USER_BY_SCREEN_NAME_QUERY_ID = 'IGgvgiOx4QZndDHuD3x9TQ'
const USER_BY_SCREEN_NAME_PATH = `/i/api/graphql/${USER_BY_SCREEN_NAME_QUERY_ID}/UserByScreenName`
const BOT_SCREEN_NAME = '_biccame_musume'
// Bearer is hardcoded in https://abs.twimg.com/responsive-web/client-web/main.<hash>.js
// as two concatenated string literals, rotates infrequently. Re-extract from a live
// browser request when 401 "Could not authenticate you" starts appearing.
const X_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

const HOME_PAGE_CACHE_KEY = 'https://x-transaction-cache.local/home-page'
const ONDEMAND_CACHE_KEY = 'https://x-transaction-cache.local/ondemand'
const CACHE_TTL_SECONDS = 60 * 30

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

type TweetOptions = { quoteTweetId?: string; replyToTweetId?: string }

/**
 * UserByScreenName GraphQL のレスポンスのうち、ヘルスチェック画面で使う
 * フィールドだけを抜き出した Zod スキーマ。X が新フィールドを生やしても
 * 壊れないよう、未使用のキーには触れない。
 */
const UserByScreenNameResponseSchema = z.object({
  data: z.object({
    user: z.object({
      result: z.object({
        rest_id: z.string().nonempty(),
        core: z.object({
          name: z.string(),
          screen_name: z.string().nonempty(),
          created_at: z.string().nonempty()
        }),
        avatar: z.object({
          image_url: z.string()
        }),
        legacy: z.object({
          followers_count: z.number().int().nonnegative(),
          friends_count: z.number().int().nonnegative(),
          statuses_count: z.number().int().nonnegative(),
          favourites_count: z.number().int().nonnegative(),
          listed_count: z.number().int().nonnegative(),
          media_count: z.number().int().nonnegative(),
          description: z.string(),
          profile_banner_url: z.string().nonempty().optional()
        })
      })
    })
  })
})

export type TwitterAccountInfo = {
  restId: string
  screenName: string
  name: string
  followersCount: number
  friendsCount: number
  statusesCount: number
  favouritesCount: number
  listedCount: number
  mediaCount: number
  createdAt: string
  profileImageUrl: string
  profileBannerUrl: string | null
  description: string
}

/**
 * X のプロフィール画像 URL は末尾の `_normal.{ext}` で 48px に縮小されている。
 * 任意の解像度サフィックス (`_400x400`, `_bigger` 等) に置換すると高解像度版が返る。
 */
const upgradeProfileImageResolution = (url: string): string => url.replace(/_normal(\.[^.]+)$/, '_400x400$1')

/** バナー画像はパスサフィックスでサイズ指定する。`/1500x500` で横 1500px。 */
const upgradeBannerResolution = (url: string): string => `${url}/1500x500`

const buildCreateTweetBody = (text: string, opts: TweetOptions): string =>
  JSON.stringify({
    variables: {
      tweet_text: text,
      dark_request: false,
      media: { media_entities: [], possibly_sensitive: false },
      semantic_annotation_ids: [],
      ...(opts.quoteTweetId ? { attachment_url: `https://x.com/i/status/${opts.quoteTweetId}` } : {}),
      ...(opts.replyToTweetId
        ? { reply: { in_reply_to_tweet_id: opts.replyToTweetId, exclude_reply_user_ids: [] } }
        : {})
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

  async tweet(text: string, opts: TweetOptions = {}): Promise<string> {
    const { TWITTER_AUTH_TOKEN, TWITTER_CSRF_TOKEN } = this.env

    const { homePageHtml, ondemandFileText } = await getCachedTransactionInputs()
    const tx = ClientTransaction.create({ homePageHtml, ondemandFileText })
    const transactionId = await tx.generateTransactionId('POST', CREATE_TWEET_PATH)

    const url = `https://x.com${CREATE_TWEET_PATH}`
    const body = buildCreateTweetBody(text, opts)

    console.log('[Twitter] Posting tweet:', { textLength: text.length, ...opts })

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
      if (opts.quoteTweetId && response.status === 403) {
        console.warn('[Twitter] Quote tweet not allowed, retrying without quote:', {
          quoteTweetId: opts.quoteTweetId,
          error: errorText
        })
        return await this.tweet(text, { ...opts, quoteTweetId: undefined })
      }
      throw new Error(`X API error: ${response.status} ${errorText}`)
    }

    const result = (await response.json()) as {
      data?: { create_tweet?: { tweet_results?: { result?: { rest_id?: string } } } }
    }
    const tweetId = result.data?.create_tweet?.tweet_results?.result?.rest_id
    if (!tweetId) throw new Error(`X API: no rest_id in response: ${JSON.stringify(result).slice(0, 300)}`)
    console.log('[Twitter] Tweet posted successfully:', { tweetId })
    return tweetId
  }

  /**
   * 投稿用アカウントの公開プロフィールを取得する。
   * 認証 cookie と x-client-transaction-id 生成が機能しているかをまとめて検証する用途。
   * X のレート制限は無視できないので連打しないこと。
   */
  async getOwnAccount(): Promise<TwitterAccountInfo> {
    const { TWITTER_AUTH_TOKEN, TWITTER_CSRF_TOKEN } = this.env

    const { homePageHtml, ondemandFileText } = await getCachedTransactionInputs()
    const tx = ClientTransaction.create({ homePageHtml, ondemandFileText })
    const transactionId = await tx.generateTransactionId('GET', USER_BY_SCREEN_NAME_PATH)

    const variables = { screen_name: BOT_SCREEN_NAME, withGrokTranslatedBio: true }
    const features = {
      hidden_profile_subscriptions_enabled: true,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_profile_redirect_enabled: false,
      rweb_tipjar_consumption_enabled: false,
      verified_phone_label_enabled: false,
      subscriptions_verification_info_is_identity_verified_enabled: true,
      subscriptions_verification_info_verified_since_enabled: true,
      highlights_tweets_tab_ui_enabled: true,
      responsive_web_twitter_article_notes_tab_enabled: true,
      subscriptions_feature_can_gift_premium: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true
    }
    const fieldToggles = { withPayments: false, withAuxiliaryUserLabels: true }

    const url = new URL(`https://x.com${USER_BY_SCREEN_NAME_PATH}`)
    url.searchParams.set('variables', JSON.stringify(variables))
    url.searchParams.set('features', JSON.stringify(features))
    url.searchParams.set('fieldToggles', JSON.stringify(fieldToggles))

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9,ja;q=0.8',
        authorization: `Bearer ${X_BEARER}`,
        cookie: `auth_token=${TWITTER_AUTH_TOKEN}; ct0=${TWITTER_CSRF_TOKEN}`,
        referer: `https://x.com/${BOT_SCREEN_NAME}`,
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        'x-client-transaction-id': transactionId,
        'x-csrf-token': TWITTER_CSRF_TOKEN,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`X API error: ${response.status} ${errorText.slice(0, 300)}`)
    }

    const json = await response.json()
    const parsed = UserByScreenNameResponseSchema.safeParse(json)
    if (!parsed.success) {
      throw new Error(`X API: unexpected payload: ${parsed.error.message} / ${JSON.stringify(json).slice(0, 300)}`)
    }
    const { rest_id, core, avatar, legacy } = parsed.data.data.user.result
    return {
      restId: rest_id,
      screenName: core.screen_name,
      name: core.name,
      followersCount: legacy.followers_count,
      friendsCount: legacy.friends_count,
      statusesCount: legacy.statuses_count,
      favouritesCount: legacy.favourites_count,
      listedCount: legacy.listed_count,
      mediaCount: legacy.media_count,
      createdAt: core.created_at,
      profileImageUrl: upgradeProfileImageResolution(avatar.image_url),
      profileBannerUrl: legacy.profile_banner_url ? upgradeBannerResolution(legacy.profile_banner_url) : null,
      description: legacy.description
    }
  }

  async tweetEventCreated(event: EventDetail): Promise<void> {
    await this.tweet(buildEventCreatedText(event), {
      quoteTweetId: getQuoteTweetId(event.referenceUrls ?? [], 'create')
    })
  }

  async tweetEventUpdated(event: EventDetail): Promise<void> {
    await this.tweet(buildEventUpdatedText(event), {
      quoteTweetId: getQuoteTweetId(event.referenceUrls ?? [], 'update')
    })
  }

  /**
   * Post a summary tweet thread. Each tweet contains up to 3 events; the
   * 2nd+ tweets are posted as replies to the previous tweet to form a thread.
   */
  private async tweetSummaryThread(bodies: string[]): Promise<void> {
    const post = async (idx: number, replyToTweetId: string | undefined): Promise<void> => {
      if (idx >= bodies.length) return
      const id = await this.tweet(bodies[idx], { replyToTweetId })
      await post(idx + 1, id)
    }
    await post(0, undefined)
  }

  /**
   * Post the daily-summary thread for events starting today.
   */
  async tweetDailySummary(events: Event[]): Promise<void> {
    if (events.length === 0) return
    await this.tweetSummaryThread(buildDailySummaryTweets(events))
  }

  /**
   * Post the ending-today summary thread for events whose last day is today.
   */
  async tweetEndingTodaySummary(events: Event[]): Promise<void> {
    if (events.length === 0) return
    await this.tweetSummaryThread(buildEndingTodaySummaryTweets(events))
  }
}
