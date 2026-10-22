import { WebhookJobQuerySchema } from '@biccame/shared/schemas/webhook.dto'
import { NO_WEBHOOK_FILTER, type WebhookFilter } from '@/atoms/webhook-filter-atom'

export const query = (value: Record<string, string>) => WebhookJobQuerySchema.safeParse(value)

// 条件なし（NO_WEBHOOK_FILTER）を土台に上書きする。既定（判定は一致）が混ざると、判定を一致へ変える検証が空振りになるため。
export const filterWith = (overrides: Partial<WebhookFilter>): WebhookFilter => ({ ...NO_WEBHOOK_FILTER, ...overrides })

export type FakeWindow = { sessionStorage: Storage; localStorage: Storage }

export type AtomModule = typeof import('@/atoms/webhook-filter-atom')
