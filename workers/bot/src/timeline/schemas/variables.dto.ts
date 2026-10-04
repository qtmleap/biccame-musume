import { z } from 'zod'

const SearchModeSchema = z.enum(['Top', 'Latest', 'People', 'Photos', 'Videos'])

export const SearchVariablesSchema = z
  .object({
    rawQuery: z.string().default(''),
    count: z.number().default(20),
    querySource: z.string().default('typed_query'),
    product: SearchModeSchema.default('Latest'),
    withGrokTranslatedBio: z.boolean().default(false),
    cursor: z.string().optional()
  })
  .transform((v) => JSON.stringify(v))
