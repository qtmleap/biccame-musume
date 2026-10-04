import { z } from 'zod'
import { TwitterHealthError } from './health'
import { ClientTransaction, fetchTransactionInputs } from './transaction'

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

const TRANSACTION_CACHE_KEY = 'https://x-transaction-cache.local/inputs-v2'
const CACHE_TTL_SECONDS = 60 * 30

/** Cache a coherent, validated HTML/signer snapshot for 30 minutes. */
export const getCachedTransactionInputs = async (): Promise<{ homePageHtml: string; ondemandFileText: string }> => {
  const cache = await caches.open('x-transaction')
  const cached = await cache.match(TRANSACTION_CACHE_KEY)
  if (cached) {
    try {
      const inputs = await cached.json<{ homePageHtml: string; ondemandFileText: string }>()
      if (typeof inputs.homePageHtml === 'string' && typeof inputs.ondemandFileText === 'string') {
        ClientTransaction.create(inputs)
        return inputs
      }
    } catch {
      // Corrupt or obsolete cached inputs are replaced by fresh validated material.
    }
  }
  const inputs = await fetchTransactionInputs()
  ClientTransaction.create(inputs)
  await cache.put(
    TRANSACTION_CACHE_KEY,
    new Response(JSON.stringify(inputs), {
      headers: { 'cache-control': `max-age=${CACHE_TTL_SECONDS}`, 'content-type': 'application/json' }
    })
  )
  return inputs
}

export type TweetOptions = { quoteTweetId?: string; replyToTweetId?: string }

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

/**
 * CreateTweet GraphQL のレスポンスのうち、投稿済みツイート ID の取得に使う
 * フィールドだけを抜き出した Zod スキーマ。
 */
const CreateTweetResponseSchema = z.object({
  data: z
    .object({
      create_tweet: z
        .object({
          tweet_results: z
            .object({
              result: z
                .object({
                  rest_id: z.string().nonempty().optional()
                })
                .optional()
            })
            .optional()
        })
        .optional()
    })
    .optional()
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
export const upgradeProfileImageResolution = (url: string): string => url.replace(/_normal(\.[^.]+)$/, '_400x400$1')

/** バナー画像はパスサフィックスでサイズ指定する。`/1500x500` で横 1500px。 */
export const upgradeBannerResolution = (url: string): string => `${url}/1500x500`

export const buildCreateTweetBody = (text: string, opts: TweetOptions): string =>
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

export type TwitterCredentials = { TWITTER_AUTH_TOKEN: string; TWITTER_CSRF_TOKEN: string }
export type TwitterTransportFailureKind =
  | 'missing_credentials'
  | 'signature'
  | 'rate_limit'
  | 'rejected'
  | 'delivery_unknown'
  | 'network'
  | 'unexpected_response'

const TRANSPORT_FAILURE_MESSAGES: Record<TwitterTransportFailureKind, string> = {
  missing_credentials: 'X Cookie configuration is missing',
  signature: 'X signature acquisition or KEY_BYTE validation failed',
  rate_limit: 'X rate limit reached',
  rejected: 'X request was rejected',
  delivery_unknown: 'X post delivery could not be confirmed; do not automatically resend',
  network: 'X read request failed',
  unexpected_response: 'X read response format could not be verified'
}

/** API本文・認証情報・内部例外を持ち込まないtransport失敗分類。 */
export class TwitterTransportError extends Error {
  constructor(
    readonly kind: TwitterTransportFailureKind,
    readonly status?: number
  ) {
    super(`${TRANSPORT_FAILURE_MESSAGES[kind]}${status === undefined ? '' : ` (HTTP ${status})`}`)
    this.name = 'TwitterTransportError'
  }
}

const getTransactionId = async (method: string, path: string): Promise<string> => {
  try {
    const inputs = await getCachedTransactionInputs()
    return await ClientTransaction.create(inputs).generateTransactionId(method, path)
  } catch {
    throw new TwitterTransportError('signature')
  }
}

export class TwitterTransport {
  constructor(private env: TwitterCredentials) {}

  async tweet(text: string, opts: TweetOptions = {}): Promise<string> {
    const { TWITTER_AUTH_TOKEN, TWITTER_CSRF_TOKEN } = this.env

    if (!TWITTER_AUTH_TOKEN?.trim() || !TWITTER_CSRF_TOKEN?.trim())
      throw new TwitterTransportError('missing_credentials')
    const transactionId = await getTransactionId('POST', CREATE_TWEET_PATH)

    const url = `https://x.com${CREATE_TWEET_PATH}`
    const body = buildCreateTweetBody(text, opts)

    console.log('[Twitter] Posting tweet:', { textLength: text.length })

    const response = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
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
    }).catch(() => {
      throw new TwitterTransportError('delivery_unknown')
    })

    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      if (opts.quoteTweetId && response.status === 403) {
        console.warn('[Twitter] Quote tweet not allowed, retrying without quote:', { status: response.status })
        return await this.tweet(text, { ...opts, quoteTweetId: undefined })
      }
      throw new TwitterTransportError(
        response.status === 429 ? 'rate_limit' : response.status >= 500 ? 'delivery_unknown' : 'rejected',
        response.status
      )
    }

    const json: unknown = await response.json().catch(() => {
      throw new TwitterTransportError('delivery_unknown', response.status)
    })
    const parsed = CreateTweetResponseSchema.safeParse(json)
    if (!parsed.success) throw new TwitterTransportError('delivery_unknown', response.status)
    const tweetId = parsed.data.data?.create_tweet?.tweet_results?.result?.rest_id
    if (!tweetId) throw new TwitterTransportError('delivery_unknown', response.status)
    console.log('[Twitter] Tweet posted successfully:', { tweetId })
    return tweetId
  }

  /**
   * Cookie 認証が必須の account/settings を読み、ログイン主体が投稿用 bot か確認する。
   * 公開プロフィール取得とは異なり、読み取り認証を検証する（投稿権限は保証しない）。
   */
  async checkAuthenticatedSession(): Promise<void> {
    const { TWITTER_AUTH_TOKEN, TWITTER_CSRF_TOKEN } = this.env
    if (!TWITTER_AUTH_TOKEN?.trim() || !TWITTER_CSRF_TOKEN?.trim()) {
      throw new TwitterHealthError('missing_credentials')
    }

    const path = '/1.1/account/settings.json'
    let transactionId: string
    try {
      const inputs = await getCachedTransactionInputs()
      transactionId = await ClientTransaction.create(inputs).generateTransactionId('GET', path)
    } catch {
      throw new TwitterHealthError('signature')
    }

    let response: Response
    try {
      response = await fetch(`https://api.x.com${path}`, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${X_BEARER}`,
          cookie: `auth_token=${TWITTER_AUTH_TOKEN}; ct0=${TWITTER_CSRF_TOKEN}`,
          referer: 'https://x.com/settings/account',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
          'x-client-transaction-id': transactionId,
          'x-csrf-token': TWITTER_CSRF_TOKEN,
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session',
          'x-twitter-client-language': 'en'
        }
      })
    } catch {
      throw new TwitterHealthError('network')
    }

    if (response.status === 429) throw new TwitterHealthError('rate_limit', response.status)
    if (response.status === 401) throw new TwitterHealthError('authentication', response.status)
    if (response.status >= 500) throw new TwitterHealthError('upstream', response.status)

    let json: unknown
    try {
      json = await response.json()
    } catch (error) {
      if (error instanceof SyntaxError && response.status === 403) {
        throw new TwitterHealthError('authorization', response.status)
      }
      throw new TwitterHealthError(error instanceof SyntaxError ? 'unexpected_response' : 'network', response.status)
    }
    const parsed = z
      .object({
        screen_name: z.string().nonempty().optional(),
        errors: z.array(z.object({ code: z.number().optional() })).optional()
      })
      .safeParse(json)
    const codes = parsed.success ? (parsed.data.errors ?? []).map((error) => error.code) : []
    if (codes.some((code) => code === 88)) throw new TwitterHealthError('rate_limit', response.status)
    if (codes.some((code) => code !== undefined && [32, 89, 215, 239, 353].includes(code))) {
      throw new TwitterHealthError('authentication', response.status)
    }
    if (response.status === 403 || codes.some((code) => code === 64 || code === 326)) {
      throw new TwitterHealthError('authorization', response.status)
    }
    if (!response.ok || !parsed.success || parsed.data.errors?.length || !parsed.data.screen_name) {
      throw new TwitterHealthError('unexpected_response', response.status)
    }
    if (parsed.data.screen_name.toLowerCase() !== BOT_SCREEN_NAME.toLowerCase()) {
      throw new TwitterHealthError('account_mismatch')
    }
  }

  /**
   * 投稿用アカウントの公開プロフィールを取得する。
   * 公開プロフィールの取得成功は認証主体の確認成功を意味しない。
   * 認証主体はcheckAuthenticatedSessionで別途確認する。連打しないこと。
   */
  async getOwnAccount(): Promise<TwitterAccountInfo> {
    const { TWITTER_AUTH_TOKEN, TWITTER_CSRF_TOKEN } = this.env

    if (!TWITTER_AUTH_TOKEN?.trim() || !TWITTER_CSRF_TOKEN?.trim())
      throw new TwitterTransportError('missing_credentials')
    const transactionId = await getTransactionId('GET', USER_BY_SCREEN_NAME_PATH)

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
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
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
    }).catch(() => {
      throw new TwitterTransportError('network')
    })

    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new TwitterTransportError(response.status === 429 ? 'rate_limit' : 'rejected', response.status)
    }

    const json: unknown = await response.json().catch(() => {
      throw new TwitterTransportError('unexpected_response', response.status)
    })
    const parsed = UserByScreenNameResponseSchema.safeParse(json)
    if (!parsed.success) throw new TwitterTransportError('unexpected_response', response.status)
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
}
