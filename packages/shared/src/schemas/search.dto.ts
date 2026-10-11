import { EventSchema } from '@biccame/shared/schemas/event.dto'
import { z } from 'zod'

export const SearchQuerySchema = z.object({
  q: z.string().nonempty('検索キーワードは必須です').max(100, '検索キーワードは 100 文字以内で入力してください')
})

export const SearchResultSchema = z.object({
  events: z.array(EventSchema)
})
