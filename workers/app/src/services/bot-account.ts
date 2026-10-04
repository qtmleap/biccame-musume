import { accountResultSchema } from '@biccame/shared/bot'
import type { Bindings } from '@/types/bindings'

export const readPostingAccount = async (env: Pick<Bindings, 'BOT'>) => {
  if (!env?.BOT) throw new Error('X account status unavailable: bot binding unavailable')
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
