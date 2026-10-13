import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import type { DefaultValues } from 'react-hook-form'
import type { EventFormValues } from '@/lib/event-form'

/**
 * 保留解決フォームの初期値。AIの登録候補があればそのまま使い、無ければ基本値にAIの下書きを重ねる。
 * 下書きに無い項目は空欄のまま残し、管理者が元投稿と照合して補う。
 */
export const webhookResolveDefaultValues = (job: WebhookJob): DefaultValues<EventFormValues> => {
  if (job.candidate) return { ...job.candidate, shouldTweet: false }
  const base: DefaultValues<EventFormValues> = {
    uuid: job.eventUUID,
    isVerified: true,
    isPreliminary: false,
    shouldTweet: false,
    referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce', url: job.sourceUrl }]
  }
  const draft = job.draft
  if (draft === null) return base
  return {
    ...base,
    ...(draft.title !== undefined ? { title: draft.title } : {}),
    ...(draft.category !== undefined ? { category: draft.category } : {}),
    stores: draft.stores.flatMap((store) => {
      const parsed = StoreKeySchema.safeParse(store)
      return parsed.success ? [parsed.data] : []
    }),
    // 日付は webhook-process の登録候補と同じ JST の形式にそろえる。
    ...(draft.startDate !== undefined ? { startDate: `${draft.startDate}T00:00:00+09:00` } : {}),
    ...(draft.endDate !== undefined ? { endDate: `${draft.endDate}T23:59:59+09:00` } : {}),
    conditions: draft.conditions.map((condition) => ({ ...condition, uuid: crypto.randomUUID() })),
    ...(draft.limitedQuantity !== undefined ? { limitedQuantity: draft.limitedQuantity } : {})
  }
}
