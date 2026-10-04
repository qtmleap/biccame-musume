import { accountResultSchema } from '@biccame/shared/bot'
import type { Bindings } from '@/types/bindings'
import { Twitter } from '@/utils/twitter'

export const readPostingAccount = async (env: Bindings) => {
  if (env?.X_POSTING_OWNER !== 'bot') return new Twitter(env).getOwnAccount()
  if (!env.BOT) throw new Error('X account status unavailable: bot binding unavailable')
  let result: unknown
  try {
    result = await env.BOT.accountStatus()
  } catch {
    throw new Error('X account status unavailable: RPC failure')
  }
  const parsed = accountResultSchema.safeParse(result)
  if (!parsed.success) throw new Error('X account status unavailable: invalid RPC response')
  if (!parsed.data.ok) throw new Error(`X account status unavailable: ${parsed.data.kind}`)
  return parsed.data.account
}
