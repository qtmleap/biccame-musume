import { WorkerEntrypoint } from 'cloudflare:workers'
import type { BotPingRequest, BotPingResponse, BotRpc } from '@biccame/shared/bot'
import { type BotBindings, handleBotScheduled } from './scheduled'
import { pingBot } from './service'

export class BotService extends WorkerEntrypoint<BotBindings> implements BotRpc {
  async ping(input: BotPingRequest): Promise<BotPingResponse> {
    return pingBot(input)
  }
}

export default {
  fetch: () => new Response('Not found', { status: 404 }),
  scheduled: (controller, env, ctx) => ctx.waitUntil(handleBotScheduled(controller, env))
} satisfies ExportedHandler<BotBindings>
