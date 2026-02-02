#!/usr/bin/env bash
set -euo pipefail

# 必要な環境変数
: "${X_AUTH_BEARER:?X_AUTH_BEARER is required}"
: "${X_CSRF:?X_CSRF is required}"
: "${X_TRANSACTION_ID:?X_TRANSACTION_ID is required}"
: "${X_COOKIE:?X_COOKIE is required}"

# 任意の環境変数
X_PROXY="${X_PROXY:-}"
X_USER_AGENT="${X_USER_AGENT:-Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36}"
X_CLIENT_LANG="${X_CLIENT_LANG:-en}"
X_ACCEPT_LANG="${X_ACCEPT_LANG:-en-US,en;q=0.9}"

URL='https://x.com/i/api/graphql/f_A-Gyo204PRxixpkrchJg/SearchTimeline?variables=%7B%22rawQuery%22%3A%22from%3Abiccameratenjin%20-filter%3Areplies%20%E3%82%A2%E3%82%AF%E3%82%AD%E3%83%BC%20OR%20%E5%90%8D%E5%88%BA%20OR%20%E9%85%8D%E5%B8%83%20OR%20%E3%83%97%E3%83%AC%E3%82%BC%E3%83%B3%E3%83%88%20until%3A2025-12-31%20since%3A2025-01-01%22%2C%22count%22%3A20%2C%22querySource%22%3A%22typed_query%22%2C%22product%22%3A%22Latest%22%2C%22withGrokTranslatedBio%22%3Afalse%7D&features=%7B%22rweb_video_screen_enabled%22%3Afalse%2C%22profile_label_improvements_pcf_label_in_post_enabled%22%3Atrue%2C%22responsive_web_profile_redirect_enabled%22%3Afalse%2C%22rweb_tipjar_consumption_enabled%22%3Afalse%2C%22verified_phone_label_enabled%22%3Afalse%2C%22creator_subscriptions_tweet_preview_api_enabled%22%3Atrue%2C%22responsive_web_graphql_timeline_navigation_enabled%22%3Atrue%2C%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22%3Afalse%2C%22premium_content_api_read_enabled%22%3Afalse%2C%22communities_web_enable_tweet_community_results_fetch%22%3Atrue%2C%22c9s_tweet_anatomy_moderator_badge_enabled%22%3Atrue%2C%22responsive_web_grok_analyze_button_fetch_trends_enabled%22%3Afalse%2C%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%2C%22responsive_web_jetfuel_frame%22%3Atrue%2C%22responsive_web_grok_share_attachment_enabled%22%3Atrue%2C%22responsive_web_grok_annotations_enabled%22%3Afalse%2C%22articles_preview_enabled%22%3Atrue%2C%22responsive_web_edit_tweet_api_enabled%22%3Atrue%2C%22graphql_is_translatable_rweb_tweet_is_translatable_enabled%22%3Atrue%2C%22view_counts_everywhere_api_enabled%22%3Atrue%2C%22longform_notetweets_consumption_enabled%22%3Atrue%2C%22responsive_web_twitter_article_tweet_consumption_enabled%22%3Atrue%2C%22tweet_awards_web_tipping_enabled%22%3Afalse%2C%22responsive_web_grok_show_grok_translated_post%22%3Afalse%2C%22responsive_web_grok_analysis_button_from_backend%22%3Atrue%2C%22post_ctas_fetch_enabled%22%3Atrue%2C%22creator_subscriptions_quote_tweet_preview_enabled%22%3Afalse%2C%22freedom_of_speech_not_reach_fetch_enabled%22%3Atrue%2C%22standardized_nudges_misinfo%22%3Atrue%2C%22tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled%22%3Atrue%2C%22longform_notetweets_rich_text_read_enabled%22%3Atrue%2C%22longform_notetweets_inline_media_enabled%22%3Atrue%2C%22responsive_web_grok_image_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_imagine_annotation_enabled%22%3Atrue%2C%22responsive_web_grok_community_note_auto_translation_is_enabled%22%3Afalse%2C%22responsive_web_enhance_cards_enabled%22%3Afalse%7D'

args=(
  "$URL"
  -H 'Host: x.com'
  -H 'Connection: keep-alive'
  -H 'sec-ch-ua-platform: "macOS"'
  -H "authorization: Bearer ${X_AUTH_BEARER}"
  -H "x-csrf-token: ${X_CSRF}"
  -H 'sec-ch-ua: "Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"'
  -H "x-twitter-client-language: ${X_CLIENT_LANG}"
  -H 'sec-ch-ua-mobile: ?0'
  -H "x-client-transaction-id: ${X_TRANSACTION_ID}"
  -H 'x-twitter-auth-type: OAuth2Session'
  -H "User-Agent: ${X_USER_AGENT}"
  -H 'content-type: application/json'
  -H 'Accept: */*'
  -H 'Sec-Fetch-Site: same-origin'
  -H 'Sec-Fetch-Mode: cors'
  -H 'Sec-Fetch-Dest: empty'
  -H 'Referer: https://x.com/search?q=from%3Abiccameratenjin%20-filter%3Areplies%20%E3%82%A2%E3%82%AF%E3%82%AD%E3%83%BC%20OR%20%E5%90%8D%E5%88%BA%20OR%20%E9%85%8D%E5%B8%83%20OR%20%E3%83%97%E3%83%AC%E3%82%BC%E3%83%B3%E3%83%88%20until%3A2025-12-31%20since%3A2025-01-01&src=typed_query&f=live'
  -H "Accept-Language: ${X_ACCEPT_LANG}"
  --cookie "${X_COOKIE}"
)

if [[ -n "${X_PROXY}" ]]; then
  args+=(--proxy "${X_PROXY}")
fi

curl "${args[@]}"
