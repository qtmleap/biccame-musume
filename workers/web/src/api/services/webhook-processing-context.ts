import type { TitleFetcher } from '@api/services/webhook-title'
import type { DetectionCandidate } from '@biccame/shared/event-detect/detection'
import { EventRequestSchema } from '@biccame/shared/schemas/event.dto'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'

export const eventCandidate = (candidate: DetectionCandidate, uuid: string) => {
  const value = {
    ...candidate,
    uuid,
    startDate: `${candidate.startDate}T00:00:00+09:00`,
    ...(candidate.endDate ? { endDate: `${candidate.endDate}T23:59:59+09:00` } : {}),
    conditions: candidate.conditions.map((condition) => ({ ...condition, uuid: crypto.randomUUID() })),
    referenceUrls: candidate.referenceUrls.map((reference) => ({ ...reference, uuid: crypto.randomUUID() })),
    isVerified: true,
    shouldTweet: false
  }
  const parsed = EventRequestSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** 旧単一ジョブの移行で、登録候補の題が無いときに候補へ入れる仮の名前 */
export const LEGACY_ITEM = '既存配布物'

/** 判定の通信が制限時間を超えた。last_error には例外名だけが残るので、名前で他の失敗と区別できるようにする。 */
export class DetectionTimeoutError extends Error {
  constructor() {
    super('Detection timed out')
    this.name = 'DetectionTimeoutError'
  }
}

export const detectionDeadline = async <T>(task: Promise<T>): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  const deadline = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new DetectionTimeoutError()), { once: true })
  })
  try {
    return await Promise.race([task, deadline])
  } finally {
    clearTimeout(timer)
  }
}

/** titleFetcher はタイトル生成の通信の差し替え口（テスト用。省略すると fetch） */
export type ProcessOptions = {
  titleFetcher?: TitleFetcher
  extractionFetcher?: TitleFetcher
  extractor?: (post: WebhookJob['post']) => Promise<unknown>
}
