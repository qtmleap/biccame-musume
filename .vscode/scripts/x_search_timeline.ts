import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import dayjs from 'dayjs'
import { z } from 'zod'

const EnvSchema = z.object({
  TWITTER_AUTH_TOKEN: z.string().nonempty(),
  TWITTER_CSRF_TOKEN: z.string().nonempty(),
})

/**
 * 環境変数からCookie文字列を組み立てる関数
 */
const buildCookie = (authToken: string, ct0: string): string => {
  return `auth_token=${authToken}; ct0=${ct0}`
}

const CharacterSchema = z.object({
  id: z.string(),
  character: z.object({
    name: z.string(),
    twitter_id: z.string(),
  }),
})

type Character = z.infer<typeof CharacterSchema>

/**
 * characters.jsonを読み込む関数
 */
const loadCharacters = async (): Promise<Character[]> => {
  const charactersPath = join(import.meta.dir, '../../public/characters.json')
  const content = await readFile(charactersPath, 'utf-8')
  const json = JSON.parse(content)
  const result = z.array(CharacterSchema).safeParse(json)

  if (!result.success) {
    console.error('Invalid characters.json schema')
    result.error.errors.forEach((error) => {
      console.error(`${error.path.join('.')}: ${error.message}`)
    })
    process.exit(1)
  }

  return result.data
}

/**
 * 指定されたtwitter_idで検索を実行する関数
 */
const searchTimeline = async (
  twitterId: string,
  env: z.infer<typeof EnvSchema>,
): Promise<Array<{ id: string; text: string; created_at: string }>> => {
  const allTweets: Array<{ id: string; text: string; created_at: string }> = []
  let cursor: string | undefined

  const baseVariables = {
    rawQuery: `from:${twitterId} -filter:replies アクキー OR 名刺 OR 配布 OR プレゼント until:2025-12-31 since:2025-01-01`,
    count: 100,
    querySource: 'typed_query',
    product: 'Latest',
    withGrokTranslatedBio: false,
  }

  const features = {
    rweb_video_screen_enabled: false,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_profile_redirect_enabled: false,
    rweb_tipjar_consumption_enabled: false,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    premium_content_api_read_enabled: false,
    communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    responsive_web_grok_analyze_button_fetch_trends_enabled: false,
    responsive_web_grok_analyze_post_followups_enabled: true,
    responsive_web_jetfuel_frame: true,
    responsive_web_grok_share_attachment_enabled: true,
    responsive_web_grok_annotations_enabled: false,
    articles_preview_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    responsive_web_grok_show_grok_translated_post: false,
    responsive_web_grok_analysis_button_from_backend: true,
    post_ctas_fetch_enabled: true,
    creator_subscriptions_quote_tweet_preview_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_grok_image_annotation_enabled: true,
    responsive_web_grok_imagine_annotation_enabled: true,
    responsive_web_grok_community_note_auto_translation_is_enabled: false,
    responsive_web_enhance_cards_enabled: false,
  }

  // Refererの組み立て
  const refererUrl = new URL('https://x.com/search')
  refererUrl.searchParams.set('q', baseVariables.rawQuery)
  refererUrl.searchParams.set('src', 'typed_query')
  refererUrl.searchParams.set('f', 'live')

  const headers = {
    Host: 'x.com',
    Connection: 'keep-alive',
    'sec-ch-ua-platform': '"macOS"',
    authorization: `Bearer ${env.X_AUTH_BEARER}`,
    'x-csrf-token': env.X_CSRF,
    'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
    'x-twitter-client-language': clientLang,
    'sec-ch-ua-mobile': '?0',
    'x-twitter-active-user': 'yes',
    'x-client-transaction-id': env.X_TRANSACTION_ID,
    'x-twitter-auth-type': 'OAuth2Session',
    'User-Agent': userAgent,
    'content-type': 'application/json',
    Accept: '*/*',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    Referer: refererUrl.href,
    'Accept-Language': acceptLang,
    cookie: buildCookie(env.X_AUTH_TOKEN, env.X_CT0),
  }

  // カーソルを使ってページネーション
  let pageNum = 0
  do {
    pageNum++
    const variables = cursor ? { ...baseVariables, cursor } : baseVariables

    // URLの組み立て
    const url = new URL('https://x.com/i/api/graphql/f_A-Gyo204PRxixpkrchJg/SearchTimeline')
    url.searchParams.set('variables', JSON.stringify(variables))
    url.searchParams.set('features', JSON.stringify(features))

    // デバッグ用: variablesをファイルに保存
    const debugDir = join(import.meta.dir, '../../Raw_02-01-2026')
    await Bun.write(
      join(debugDir, `debug_variables_page${pageNum}.json`),
      JSON.stringify(variables, null, 2),
    )
    await Bun.write(join(debugDir, `debug_url_page${pageNum}.txt`), url.href)

    console.error(`  Page ${pageNum}: ${url.href.substring(0, 150)}...`)

    const response = await fetch(url.href, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(
        `Request failed for ${twitterId}: ${response.status} ${response.statusText}`,
      )
      console.error(text)
      throw new Error(`Failed to fetch timeline for ${twitterId}`)
    }

    const json = await response.json()
    const ResponseSchema = z.object({
      data: z.object({
        search_by_raw_query: z.object({
          search_timeline: z.object({
            timeline: z.object({
              instructions: z.array(
                z.object({
                  entries: z
                    .array(
                      z.object({
                        entryId: z.string(),
                        content: z.object({
                          entryType: z.string().optional(),
                          cursorType: z.string().optional(),
                          value: z.string().optional(),
                          itemContent: z
                            .object({
                              tweet_results: z.object({
                                result: z.object({
                                  rest_id: z.string(),
                                  legacy: z.object({
                                    full_text: z.string(),
                                    created_at: z.string(),
                                  }),
                                }),
                              }),
                            })
                            .optional(),
                        }),
                      }),
                    )
                    .optional(),
                }),
              ),
            }),
          }),
        }),
      }),
    })

    const parsedResponse = ResponseSchema.safeParse(json)

    if (!parsedResponse.success) {
      console.error(`Invalid response schema for ${twitterId}`)
      parsedResponse.error.errors.forEach((error) => {
        console.error(`${error.path.join('.')}: ${error.message}`)
      })
      throw new Error(`Invalid response for ${twitterId}`)
    }

    // ツイートとカーソルを抽出
    cursor = undefined
    for (const instruction of parsedResponse.data.data.search_by_raw_query.search_timeline
      .timeline.instructions) {
      if (!instruction.entries) continue

      for (const entry of instruction.entries) {
        // カーソルを見つける
        if (
          entry.content.entryType === 'TimelineTimelineCursor' &&
          entry.content.cursorType === 'Bottom' &&
          entry.content.value
        ) {
          cursor = entry.content.value
          continue
        }

        // ツイートを抽出
        const itemContent = entry.content.itemContent
        if (!itemContent) continue

        const result = itemContent.tweet_results.result
        allTweets.push({
          id: result.rest_id,
          text: result.legacy.full_text,
          created_at: dayjs(result.legacy.created_at).format('YYYY-MM-DD HH:mm:ss'),
        })
      }
    }

    console.error(`  Fetched ${allTweets.length} tweets so far, cursor: ${cursor ? 'yes' : 'no'}`)

    // レート制限対策
    if (cursor) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  } while (cursor)

  return allTweets
}

/**
 * 環境変数を検証してfetchを実行する関数
 */
const run = async () => {
  const parsed = EnvSchema.safeParse(process.env)

  if (!parsed.success) {
    console.error('Invalid environment variables')
    parsed.error.errors.forEach((error) => {
      console.error(`${error.path.join('.')}: ${error.message}`)
    })
    process.exit(1)
  }

  const env = parsed.data

  if (env.X_PROXY) {
    console.error('X_PROXY is not supported in fetch mode')
    process.exit(1)
  }

  // characters.jsonを読み込む
  const characters = await loadCharacters()
  console.error(`Loaded ${characters.length} characters`)

  const results: Record<string, unknown> = {}

  // 全てのキャラクターについて検索
  for (const character of characters) {
    console.error(
      `Fetching timeline for ${character.character.name} (@${character.character.twitter_id})`,
    )

    try {
      const data = await searchTimeline(character.character.twitter_id, env)
      results[character.id] = data

      // レート制限対策として少し待つ
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } catch (error) {
      console.error(`Failed to fetch for ${character.id}: ${error}`)
      results[character.id] = { error: String(error) }
    }

    // テスト用に1キャラだけ実行
    break
  }

  console.log(JSON.stringify(results, null, 2))
}

run()
