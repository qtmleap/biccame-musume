import { z } from 'zod'

const CREATE_TWEET_QUERY_ID = 'oB-5XsHNAbjvARJEc8CZFw'
export const CREATE_TWEET_PATH = `/i/api/graphql/${CREATE_TWEET_QUERY_ID}/CreateTweet`

export type TweetOptions = { quoteTweetId?: string; replyToTweetId?: string; mediaIds?: string[] }

/**
 * CreateTweet GraphQL のレスポンスのうち、投稿済みツイート ID の取得に使う
 * フィールドだけを抜き出した Zod スキーマ。
 */
export const CreateTweetResponseSchema = z.object({
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

export const buildCreateTweetBody = (text: string, opts: TweetOptions): string =>
  JSON.stringify({
    variables: {
      tweet_text: text,
      dark_request: false,
      media: {
        media_entities: opts.mediaIds ? opts.mediaIds.map((mediaId) => ({ media_id: mediaId, tagged_users: [] })) : [],
        possibly_sensitive: false
      },
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
