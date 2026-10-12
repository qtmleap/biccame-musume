import { expect, spyOn, test } from 'bun:test'
import routes from '@api/routes/admin-event'
import * as eventService from '@api/services/event-service'

test('Webhookイベント一覧は管理用サービスの結果を返す', async () => {
  const list = spyOn(eventService, 'getAdminWebhookEvents').mockResolvedValue([])
  try {
    const response = await routes.request('/admin/webhook-events')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('[]')
    expect(list).toHaveBeenCalledTimes(1)
  } finally {
    list.mockRestore()
  }
})
