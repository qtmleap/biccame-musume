import { z } from 'zod'
import { EventSchema } from './event.dto'

export const SearchQuerySchema = z.object({
  q: z.string().nonempty('検索キーワードは必須です').max(100, '検索キーワードは 100 文字以内で入力してください')
})

export const SearchResultSchema = z.object({
  events: z.array(EventSchema)
})
