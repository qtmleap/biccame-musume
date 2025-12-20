/**
 * ブラウザのCookieを使用してTwitter APIを叩くユーティリティ
 * auth_tokenを使用することでAPI制限を回避
 */

type TwitterConfig = {
  authToken: string
  csrfToken?: string
}

export type Tweet = {
  id: string
  text: string
  createdAt: string
  authorName: string
  authorScreenName: string
  mediaUrls?: string[]
}

type FetchTweetsResult = {
  tweets: Tweet[]
  error?: string
}

/**
 * Twitter GraphQL APIのエンドポイント
 */
const TWITTER_API_BASE = 'https://twitter.com/i/api/graphql'

/**
 * ブラウザをエミュレートするヘッダーを生成
 */
const createHeaders = (config: TwitterConfig): HeadersInit => ({
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  Authorization:
    'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
  Cookie: `auth_token=${config.authToken}${config.csrfToken ? `; ct0=${config.csrfToken}` : ''}`,
  'X-Csrf-Token': config.csrfToken ?? '',
  'X-Twitter-Active-User': 'yes',
  'X-Twitter-Auth-Type': 'OAuth2Session',
  'X-Twitter-Client-Language': 'ja'
})

/**
 * 指定したユーザーのツイートを取得
 * @param screenName Twitterのスクリーンネーム（@なし）
 * @param config 認証情報
 * @param count 取得するツイート数
 */
export const fetchUserTweets = async (
  screenName: string,
  config: TwitterConfig,
  count = 20
): Promise<FetchTweetsResult> => {
  try {
    // UserByScreenName でユーザーIDを取得
    const userResponse = await fetch(
      `${TWITTER_API_BASE}/NimuplG1OB7Fd2btCLdBOw/UserByScreenName?variables=${encodeURIComponent(
        JSON.stringify({ screen_name: screenName, withSafetyModeUserFields: true })
      )}&features=${encodeURIComponent(
        JSON.stringify({
          hidden_profile_likes_enabled: true,
          hidden_profile_subscriptions_enabled: true,
          responsive_web_graphql_exclude_directive_enabled: true,
          verified_phone_label_enabled: false,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          responsive_web_graphql_timeline_navigation_enabled: true,
          subscriptions_verification_info_is_identity_verified_enabled: true,
          subscriptions_verification_info_verified_since_enabled: true,
          highlights_tweets_tab_ui_enabled: true,
          responsive_web_twitter_article_notes_tab_enabled: true,
          creator_subscriptions_tweet_preview_api_enabled: true
        })
      )}`,
      { headers: createHeaders(config) }
    )

    if (!userResponse.ok) {
      return { tweets: [], error: `ユーザー取得失敗: ${userResponse.status}` }
    }

    const userData = (await userResponse.json()) as {
      data?: { user?: { result?: { rest_id?: string } } }
    }
    const userId = userData.data?.user?.result?.rest_id

    if (!userId) {
      return { tweets: [], error: 'ユーザーIDが見つかりません' }
    }

    // UserTweets でツイートを取得
    const tweetsResponse = await fetch(
      `${TWITTER_API_BASE}/V1ze5q3ijDS1VeLwLY0m7g/UserTweets?variables=${encodeURIComponent(
        JSON.stringify({
          userId,
          count,
          includePromotedContent: false,
          withQuickPromoteEligibilityTweetFields: true,
          withVoice: true,
          withV2Timeline: true
        })
      )}&features=${encodeURIComponent(
        JSON.stringify({
          responsive_web_graphql_exclude_directive_enabled: true,
          verified_phone_label_enabled: false,
          responsive_web_graphql_timeline_navigation_enabled: true,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          creator_subscriptions_tweet_preview_api_enabled: true,
          tweetypie_unmention_optimization_enabled: true,
          responsive_web_edit_tweet_api_enabled: true,
          graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
          view_counts_everywhere_api_enabled: true,
          longform_notetweets_consumption_enabled: true,
          responsive_web_twitter_article_tweet_consumption_enabled: false,
          tweet_awards_web_tipping_enabled: false,
          freedom_of_speech_not_reach_fetch_enabled: true,
          standardized_nudges_misinfo: true,
          longform_notetweets_rich_text_read_enabled: true,
          longform_notetweets_inline_media_enabled: true,
          responsive_web_enhance_cards_enabled: false,
          rweb_video_timestamps_enabled: true,
          c9s_tweet_anatomy_moderator_badge_enabled: true,
          tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
          responsive_web_media_download_video_enabled: false
        })
      )}`,
      { headers: createHeaders(config) }
    )

    if (!tweetsResponse.ok) {
      return { tweets: [], error: `ツイート取得失敗: ${tweetsResponse.status}` }
    }

    const tweetsData = await tweetsResponse.json()
    const tweets = parseTweetsResponse(tweetsData, screenName)

    return { tweets }
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー'
    return { tweets: [], error: message }
  }
}

/**
 * GraphQL レスポンスからツイートを抽出（リツイートは除外）
 * @param data GraphQLレスポンス
 * @param targetScreenName 取得対象のスクリーンネーム（リツイート判定に使用）
 */
// biome-ignore lint/suspicious/noExplicitAny: GraphQL response structure is complex
const parseTweetsResponse = (data: any, targetScreenName?: string): Tweet[] => {
  const tweets: Tweet[] = []

  try {
    const instructions = data?.data?.user?.result?.timeline_v2?.timeline?.instructions ?? []

    for (const instruction of instructions) {
      if (instruction.type !== 'TimelineAddEntries') continue

      for (const entry of instruction.entries ?? []) {
        const tweetResult = entry.content?.itemContent?.tweet_results?.result
        if (!tweetResult) continue

        const legacy = tweetResult.legacy ?? tweetResult.tweet?.legacy
        const user =
          tweetResult.core?.user_results?.result?.legacy ?? tweetResult.tweet?.core?.user_results?.result?.legacy

        if (!legacy || !user) continue

        // リツイートを除外（retweeted_status_resultがある場合はリツイート）
        if (legacy.retweeted_status_result) continue

        // スクリーンネームが指定されている場合、本人のツイートのみ取得
        if (targetScreenName && user.screen_name.toLowerCase() !== targetScreenName.toLowerCase()) continue

        tweets.push({
          id: legacy.id_str,
          text: legacy.full_text,
          createdAt: legacy.created_at,
          authorName: user.name,
          authorScreenName: user.screen_name,
          mediaUrls: legacy.extended_entities?.media?.map((m: { media_url_https: string }) => m.media_url_https)
        })
      }
    }
  } catch {
    // パース失敗は空配列を返す
  }

  return tweets
}
