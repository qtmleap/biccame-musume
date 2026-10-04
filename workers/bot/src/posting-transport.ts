import { TwitterTransport } from '@biccame/shared/x/transport'
import { z } from 'zod'

const credentialsSchema = z.object({
  TWITTER_AUTH_TOKEN: z.string().nonempty(),
  TWITTER_CSRF_TOKEN: z.string().nonempty()
})

export const createPostingTransport = (env: unknown): TwitterTransport | undefined => {
  const parsed = credentialsSchema.safeParse(env)
  return parsed.success ? new TwitterTransport(parsed.data) : undefined
}
