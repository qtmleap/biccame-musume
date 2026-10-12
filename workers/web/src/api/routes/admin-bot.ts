import { EVENT_DETECTION_MODEL_KEY, webhookConfiguration } from '@api/services/webhook-config'
import type { Bindings } from '@api/types/bindings'
import { discordDeliveryResultSchema, discordStatusSchema, discordTestRequestSchema } from '@biccame/shared/bot'
import {
  AdminBotConfigurationErrorSchema,
  AdminBotConfigurationRequestSchema,
  AdminBotConfigurationResponseSchema,
  AdminBotStatusSchema
} from '@biccame/shared/schemas/admin-bot.dto'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import dayjs from 'dayjs'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()
routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/bot/status',
    responses: {
      200: {
        description: '外部APIを呼ばずに取得する秘密値を除いたBot設定',
        content: { 'application/json': { schema: AdminBotStatusSchema } }
      },
      503: {
        description: '設定ストアを利用できない',
        content: { 'application/json': { schema: AdminBotConfigurationErrorSchema } }
      }
    },
    tags: ['admin-bot']
  }),
  async (c) => {
    c.header('Cache-Control', 'no-store')
    const webhook = await webhookConfiguration(c.env).catch(() => null)
    if (webhook === null) return c.json({ error: 'configuration_unavailable' as const }, 503)
    const common = { fetchedAt: dayjs().toISOString(), webhook }
    if (!c.env.BOT) return c.json({ ...common, botConnected: false, discord: null, error: 'rpc_unavailable' }, 200)
    try {
      const parsed = discordStatusSchema.safeParse(await c.env.BOT.discordStatus())
      if (!parsed.success)
        return c.json({ ...common, botConnected: false, discord: null, error: 'unexpected_response' }, 200)
      return c.json({ ...common, botConnected: true, discord: parsed.data, error: null }, 200)
    } catch {
      return c.json({ ...common, botConnected: false, discord: null, error: 'rpc_unavailable' }, 200)
    }
  }
)
routes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/bot/connection',
    responses: {
      200: {
        description: '明示操作によるDiscord接続確認',
        content: { 'application/json': { schema: AdminBotStatusSchema } }
      },
      503: {
        description: '設定ストアを利用できない',
        content: { 'application/json': { schema: AdminBotConfigurationErrorSchema } }
      }
    },
    tags: ['admin-bot']
  }),
  async (c) => {
    c.header('Cache-Control', 'no-store')
    const webhook = await webhookConfiguration(c.env).catch(() => null)
    if (webhook === null) return c.json({ error: 'configuration_unavailable' as const }, 503)
    const common = { fetchedAt: dayjs().toISOString(), webhook }
    if (!c.env.BOT) return c.json({ ...common, botConnected: false, discord: null, error: 'rpc_unavailable' }, 200)
    try {
      const parsed = discordStatusSchema.safeParse(await c.env.BOT.checkDiscordConnection())
      if (!parsed.success)
        return c.json({ ...common, botConnected: false, discord: null, error: 'unexpected_response' }, 200)
      return c.json({ ...common, botConnected: true, discord: parsed.data, error: null }, 200)
    } catch {
      return c.json({ ...common, botConnected: false, discord: null, error: 'rpc_unavailable' }, 200)
    }
  }
)
routes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/bot/test',
    request: { body: { required: true, content: { 'application/json': { schema: discordTestRequestSchema } } } },
    responses: {
      200: {
        description: '明示操作による Discord テスト送信結果',
        content: { 'application/json': { schema: discordDeliveryResultSchema } }
      }
    },
    tags: ['admin-bot']
  }),
  async (c) => {
    c.header('Cache-Control', 'no-store')
    if (!c.env.BOT) return c.json({ status: 'failed' as const, kind: 'rpc' as const }, 200)
    try {
      const result = discordDeliveryResultSchema.safeParse(await c.env.BOT.testDiscordNotification(c.req.valid('json')))
      return c.json(
        result.success ? result.data : { status: 'unknown' as const, kind: 'delivery_unknown' as const },
        200
      )
    } catch {
      return c.json({ status: 'unknown' as const, kind: 'delivery_unknown' as const }, 200)
    }
  }
)
routes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/bot/configuration',
    request: {
      body: { required: true, content: { 'application/json': { schema: AdminBotConfigurationRequestSchema } } }
    },
    responses: {
      200: {
        description: '保存した判定モデル',
        content: { 'application/json': { schema: AdminBotConfigurationResponseSchema } }
      },
      503: {
        description: '設定ストアを利用できない',
        content: { 'application/json': { schema: AdminBotConfigurationErrorSchema } }
      }
    },
    tags: ['admin-bot']
  }),
  async (c) => {
    c.header('Cache-Control', 'no-store')
    const configuration = c.req.valid('json')
    try {
      await c.env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, configuration.model)
      return c.json(configuration, 200)
    } catch {
      return c.json({ error: 'configuration_unavailable' as const }, 503)
    }
  }
)
export default routes
