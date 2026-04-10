import { z } from 'zod'
import { EventSchema } from './event.dto'

export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(100)
})

export const SearchResultSchema = z.object({
  events: z.array(EventSchema)
})

export type SearchQuery = z.infer<typeof SearchQuerySchema>
export type SearchResult = z.infer<typeof SearchResultSchema>
