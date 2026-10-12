import { z } from 'zod'
import { TwitterHealthError } from '../health'
import { ClientTransaction } from '../transaction'
import { BOT_SCREEN_NAME, BROWSER_USER_AGENT, X_BEARER } from './constants'
import { buildCreateTweetBody, CREATE_TWEET_PATH, CreateTweetResponseSchema, type TweetOptions } from './create-tweet'
import { TwitterTransportError } from './errors'
import { getCachedTransactionInputs, getTransactionId } from './signature'
import {
  type TwitterAccountInfo,
  USER_BY_SCREEN_NAME_PATH,
  UserByScreenNameResponseSchema,
  upgradeBannerResolution,
  upgradeProfileImageResolution
} from './user-profile'

export type TwitterCredentials = { TWITTER_AUTH_TOKEN: string; TWITTER_CSRF_TOKEN: string }

export class TwitterTransport {
  constructor(private env: TwitterCredentials) {}

  /** Cookie認証と既存transaction署名でPNGをアップロードする。 */
  async uploadImage(png: Uint8Array): Promise<string> {
    if (!this.env.TWITTER_AUTH_TOKEN.trim() || !this.env.TWITTER_CSRF_TOKEN.trim())
      throw new TwitterTransportError('missing_credentials')
    if (png.byteLength === 0 || png.byteLength > 5 * 1024 * 1024) throw new TwitterTransportError('rejected')
    const path = '/i/media/upload.json'
    const request = async (form: FormData): Promise<Response> => {
      const transactionId = await getTransactionId('POST', path)
      const response = await fetch(`https://upload.x.com${path}`, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
        headers: {
          authorization: `Bearer ${X_BEARER}`,
          cookie: `auth_token=${this.env.TWITTER_AUTH_TOKEN}; ct0=${this.env.TWITTER_CSRF_TOKEN}`,
          'x-csrf-token': this.env.TWITTER_CSRF_TOKEN,
          'x-client-transaction-id': transactionId,
          'x-twitter-auth-type': 'OAuth2Session',
          'x-twitter-active-user': 'yes',
          origin: 'https://x.com',
          referer: 'https://x.com/',
          'user-agent': BROWSER_USER_AGENT
        },
        body: form
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new TwitterTransportError(response.status === 429 ? 'rate_limit' : 'rejected', response.status)
      }
      return response
    }
    const init = new FormData()
    init.set('command', 'INIT')
    init.set('total_bytes', String(png.byteLength))
    init.set('media_type', 'image/png')
    init.set('media_category', 'tweet_image')
    const result = z
      .object({ media_id_string: z.string().regex(/^\d+$/) })
      .safeParse(await (await request(init)).json())
    if (!result.success) throw new TwitterTransportError('unexpected_response')
    const append = new FormData()
    append.set('command', 'APPEND')
    append.set('media_id', result.data.media_id_string)
    append.set('segment_index', '0')
    append.set('media', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'event.png')
    await (await request(append)).body?.cancel()
    const finalize = new FormData()
    finalize.set('command', 'FINALIZE')
    finalize.set('media_id', result.data.media_id_string)
    const ready = z
      .object({
        media_id_string: z.string().regex(/^\d+$/),
        processing_info: z.object({ state: z.string().nonempty() }).optional()
      })
      .safeParse(await (await request(finalize)).json())
    if (!ready.success || (ready.data.processing_info && ready.data.processing_info.state !== 'succeeded'))
      throw new TwitterTransportError('unexpected_response')
    return ready.data.media_id_string
  }

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
        'user-agent': BROWSER_USER_AGENT,
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
          'user-agent': BROWSER_USER_AGENT,
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
        'user-agent': BROWSER_USER_AGENT,
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
