import { WorkerEntrypoint } from 'cloudflare:workers'
import type {
  AccountResult,
  Announcement,
  BotPingRequest,
  BotPingResponse,
  BotRpc,
  DeliveryResult,
  PostingSessionResult
} from '@biccame/shared/bot'
import { postAnnouncement, readBotAccount, verifyPostingSession } from './posting'
import { createPostingTransport } from './posting-transport'
import { type BotBindings, handleBotScheduled } from './scheduled'
import { pingBot } from './service'

export class BotService extends WorkerEntrypoint<BotBindings> implements BotRpc {
  async ping(input: BotPingRequest): Promise<BotPingResponse> {
    return pingBot(input, this.env.TL_NOTIFICATIONS_ENABLED === 'true' || this.env.X_POSTING_ENABLED === 'true')
  }
  async announce(input: Announcement): Promise<DeliveryResult> {
    if (this.env.X_POSTING_ENABLED !== 'true') return { status: 'disabled' }
    const transport = createPostingTransport(this.env)
    if (!transport) return { status: 'failed', kind: 'configuration' }
    return postAnnouncement(this.env, input, transport)
  }
  async postingSessionStatus(): Promise<PostingSessionResult> {
    if (this.env.X_ACCOUNT_READ_ENABLED !== 'true') return { ok: false, kind: 'disabled' }
    const transport = createPostingTransport(this.env)
    if (!transport) return { ok: false, kind: 'configuration' }
    return verifyPostingSession(this.env, transport)
  }
  async accountStatus(): Promise<AccountResult> {
    if (this.env.X_ACCOUNT_READ_ENABLED !== 'true') return { ok: false, kind: 'disabled' }
    const transport = createPostingTransport(this.env)
    if (!transport) return { ok: false, kind: 'configuration' }
    return readBotAccount(this.env, transport)
  }
}

export default {
  fetch: () => new Response('Not found', { status: 404 }),
  scheduled: (controller, env, ctx) => ctx.waitUntil(handleBotScheduled(controller, env))
} satisfies ExportedHandler<BotBindings>
