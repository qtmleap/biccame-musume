import { WorkerEntrypoint } from 'cloudflare:workers'
import type { AppBotReadRpc, DailyRequest, DailyTargetsResult } from '@biccame/shared/bot'
import { readBotDailyTargets } from '@/services/bot-daily-targets'
import type { Bindings } from '@/types/bindings'

export class AppBotReadService extends WorkerEntrypoint<Bindings> implements AppBotReadRpc {
  async dailyTargets(input: DailyRequest): Promise<DailyTargetsResult> {
    return readBotDailyTargets(this.env, input)
  }
}
