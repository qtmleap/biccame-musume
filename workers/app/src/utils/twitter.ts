import { TwitterTransport } from '@biccame/shared/x/transport'
import type { Event, EventDetail } from '@/schemas/event.dto'
import {
  buildDailySummaryTweets,
  buildEndingTodaySummaryTweets,
  buildEventCreatedText,
  buildEventUpdatedText,
  getQuoteTweetId
} from '@/utils/tweet-text'

/** app固有の本文生成だけを保持する互換facade。 */
export class Twitter extends TwitterTransport {
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

  private async tweetSummaryThread(bodies: string[]): Promise<void> {
    const post = async (idx: number, replyToTweetId: string | undefined): Promise<void> => {
      if (idx >= bodies.length) return
      const id = await this.tweet(bodies[idx], { replyToTweetId })
      await post(idx + 1, id)
    }
    await post(0, undefined)
  }

  async tweetDailySummary(events: Event[]): Promise<void> {
    if (events.length === 0) return
    await this.tweetSummaryThread(buildDailySummaryTweets(events))
  }

  async tweetEndingTodaySummary(events: Event[]): Promise<void> {
    if (events.length === 0) return
    await this.tweetSummaryThread(buildEndingTodaySummaryTweets(events))
  }
}
