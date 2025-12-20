#!/usr/bin/env bun
/**
 * Twitterからツイートを取得するスクリプト
 * auth_tokenを使用してAPI制限を回避
 * characters.jsonに登録されているscreen_nameからツイートを取得
 *
 * 使い方:
 *   bun run scripts/fetch_tweets.ts [count]
 *   bun run scripts/fetch_tweets.ts [count] --all    # 全アカウント
 *   bun run scripts/fetch_tweets.ts [count] --json   # JSON出力のみ（保存しない）
 *
 * 環境変数:
 *   TWITTER_AUTH_TOKEN - TwitterのCookieから取得したauth_token
 *   TWITTER_CSRF_TOKEN - TwitterのCookieから取得したct0（オプション）
 *
 * 出力:
 *   public/tweets/YYYY-MM-DD/{screen_name}.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import dayjs from 'dayjs'
import { type Tweet, fetchUserTweets } from '../src/utils/twitter'

// =============================================================================
// 型定義
// =============================================================================

type Character = {
  character_name: string
  twitter_screen_name?: string
}

type TweetResult = {
  character_name: string
  screen_name: string
  fetched_at: string
  tweets: Tweet[]
}

// =============================================================================
// 設定
// =============================================================================

const AUTH_TOKEN = process.env.TWITTER_AUTH_TOKEN ?? ''
const CSRF_TOKEN = process.env.TWITTER_CSRF_TOKEN ?? ''

// =============================================================================
// メイン処理
// =============================================================================

const main = async () => {
  const args = process.argv.slice(2)
  const count = Number.parseInt(args[0] ?? '5', 10)

  if (!AUTH_TOKEN) {
    console.error('Error: TWITTER_AUTH_TOKEN is not set')
    console.error('')
    console.error('auth_tokenの取得方法:')
    console.error('  1. ブラウザでTwitterにログイン')
    console.error('  2. DevTools → Application → Cookies → twitter.com')
    console.error('  3. auth_tokenの値をコピー')
    console.error('')
    console.error('環境変数の設定:')
    console.error('  export TWITTER_AUTH_TOKEN="your_auth_token_here"')
    console.error('  export TWITTER_CSRF_TOKEN="your_ct0_here"  # オプション')
    process.exit(1)
  }

  // characters.jsonを読み込み
  const charactersPath = join(import.meta.dir, '../public/characters.json')
  const charactersJson = readFileSync(charactersPath, 'utf-8')
  const characters: Character[] = JSON.parse(charactersJson)

  // twitter_screen_nameが設定されているキャラクターを抽出
  const twitterCharacters = characters.filter((c) => c.twitter_screen_name)

  // 最初の5アカウントのみ取得（テスト用）
  const targetCharacters = args.includes('--all') ? twitterCharacters : twitterCharacters.slice(0, 5)

  const isJsonOutput = args.includes('--json')
  const today = dayjs().format('YYYY-MM-DD')
  const outputDir = join(import.meta.dir, '../public/tweets', today)

  console.log(`Found ${twitterCharacters.length} characters with Twitter accounts`)
  console.log(`Processing ${targetCharacters.length} accounts (use --all for all)`)
  console.log(`Fetching ${count} tweets per account...`)
  if (!isJsonOutput) {
    console.log(`Output directory: ${outputDir}`)
  }
  console.log('')

  // 出力ディレクトリを作成
  if (!isJsonOutput && !existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const allResults: Record<string, TweetResult> = {}

  for (const character of targetCharacters) {
    const screenName = character.twitter_screen_name
    if (!screenName) continue

    if (!isJsonOutput) {
      console.log('═'.repeat(60))
      console.log(`${character.character_name} (@${screenName})`)
      console.log('═'.repeat(60))
    }

    const result = await fetchUserTweets(
      screenName,
      {
        authToken: AUTH_TOKEN,
        csrfToken: CSRF_TOKEN || undefined
      },
      count
    )

    if (result.error) {
      if (!isJsonOutput) {
        console.error(`  Error: ${result.error}`)
      }
      // レート制限の場合は長めに待機
      if (result.error.includes('429')) {
        if (!isJsonOutput) {
          console.log('  Rate limited. Waiting 60 seconds...')
        }
        await new Promise((resolve) => setTimeout(resolve, 60000))
      }
      if (!isJsonOutput) {
        console.log('')
      }
      continue
    }

    if (result.tweets.length === 0) {
      if (!isJsonOutput) {
        console.log('  No tweets found')
        console.log('')
      }
      continue
    }

    const fetchedAt = dayjs().toISOString()

    // 結果を保存
    const tweetResult: TweetResult = {
      character_name: character.character_name,
      screen_name: screenName,
      fetched_at: fetchedAt,
      tweets: result.tweets
    }

    allResults[screenName] = tweetResult

    // ファイルに保存（--jsonオプションがない場合）
    if (!isJsonOutput) {
      const filePath = join(outputDir, `${screenName}.json`)
      writeFileSync(filePath, JSON.stringify(tweetResult, null, 2))
      console.log(`  Saved to ${filePath}`)

      for (const tweet of result.tweets) {
        console.log('─'.repeat(60))
        console.log(`Date: ${tweet.createdAt}`)
        console.log('')
        console.log(tweet.text)
        if (tweet.mediaUrls && tweet.mediaUrls.length > 0) {
          console.log('')
          console.log('Media:')
          for (const url of tweet.mediaUrls) {
            console.log(`  - ${url}`)
          }
        }
      }
      console.log('')
    }

    // レート制限対策のため待機（60秒）
    console.log('  Waiting 60 seconds for rate limit...')
    await new Promise((resolve) => setTimeout(resolve, 60000))
  }

  if (isJsonOutput) {
    console.log(JSON.stringify(allResults, null, 2))
  } else {
    console.log('═'.repeat(60))
    console.log(`Done! Files saved to ${outputDir}`)
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
