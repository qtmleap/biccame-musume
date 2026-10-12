import { WorkerEntrypoint } from 'cloudflare:workers'
import { readBotDailyTargets } from '@api/services/bot-daily-targets'
import type { Bindings } from '@api/types/bindings'
import type { AppBotReadRpc, DailyRequest, DailyTargetsResult } from '@biccame/shared/bot'

export class AppBotReadService extends WorkerEntrypoint<Bindings> implements AppBotReadRpc {
  async dailyTargets(input: DailyRequest): Promise<DailyTargetsResult> {
    return readBotDailyTargets(this.env, input)
  }
}
