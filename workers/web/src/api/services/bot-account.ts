import { createPostingTransport } from '@api/services/posting-transport'
import type { Bindings } from '@api/types/bindings'

export const readPostingAccount = async (env: Bindings) => {
  if (env.X_ACCOUNT_READ_ENABLED !== 'true') throw new Error('X account status unavailable: disabled')
  const transport = createPostingTransport(env)
  if (!transport) throw new Error('X account status unavailable: configuration')
  try {
    return await transport.getOwnAccount()
  } catch {
    throw new Error('X account status unavailable: upstream')
  }
}
