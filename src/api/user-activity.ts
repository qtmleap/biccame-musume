import { Hono } from 'hono'
import {
  addCompletedEvent,
  addInterestedEvent,
  addVisitedStore,
  getCompletedEvents,
  getInterestedEvents,
  getUserActivity,
  getVisitedStores,
  removeCompletedEvent,
  removeInterestedEvent,
  removeVisitedStore
} from '@/services/user-activity.service'
import type { Bindings, Variables } from '@/types/bindings'

const routes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * ユーザーのアクティビティ全体を取得
 * GET /api/user-activity/:userId
 */
routes.get('/:userId', async (c) => {
  const userId = c.req.param('userId')
  const activity = await getUserActivity(c.env, userId)
  return c.json(activity)
})

// ===== 訪問済み店舗 =====

/**
 * 訪問済み店舗一覧を取得
 * GET /api/user-activity/:userId/stores
 */
routes.get('/:userId/stores', async (c) => {
  const userId = c.req.param('userId')
  const stores = await getVisitedStores(c.env, userId)
  return c.json({ stores })
})

/**
 * 店舗を訪問済みに追加
 * POST /api/user-activity/:userId/stores/:storeKey
 */
routes.post('/:userId/stores/:storeKey', async (c) => {
  const userId = c.req.param('userId')
  const storeKey = c.req.param('storeKey')
  await addVisitedStore(c.env, userId, storeKey)
  return c.json({ success: true })
})

/**
 * 店舗を訪問済みから削除
 * DELETE /api/user-activity/:userId/stores/:storeKey
 */
routes.delete('/:userId/stores/:storeKey', async (c) => {
  const userId = c.req.param('userId')
  const storeKey = c.req.param('storeKey')
  await removeVisitedStore(c.env, userId, storeKey)
  return c.json({ success: true })
})

// ===== 興味のあるイベント =====

/**
 * 興味のあるイベント一覧を取得
 * GET /api/user-activity/:userId/interested
 */
routes.get('/:userId/interested', async (c) => {
  const userId = c.req.param('userId')
  const events = await getInterestedEvents(c.env, userId)
  return c.json({ events })
})

/**
 * イベントを興味ありに追加
 * POST /api/user-activity/:userId/interested/:eventId
 */
routes.post('/:userId/interested/:eventId', async (c) => {
  const userId = c.req.param('userId')
  const eventId = c.req.param('eventId')
  await addInterestedEvent(c.env, userId, eventId)
  return c.json({ success: true })
})

/**
 * イベントを興味ありから削除
 * DELETE /api/user-activity/:userId/interested/:eventId
 */
routes.delete('/:userId/interested/:eventId', async (c) => {
  const userId = c.req.param('userId')
  const eventId = c.req.param('eventId')
  await removeInterestedEvent(c.env, userId, eventId)
  return c.json({ success: true })
})

// ===== 達成済みイベント =====

/**
 * 達成済みイベント一覧を取得
 * GET /api/user-activity/:userId/completed
 */
routes.get('/:userId/completed', async (c) => {
  const userId = c.req.param('userId')
  const events = await getCompletedEvents(c.env, userId)
  return c.json({ events })
})

/**
 * イベントを達成済みに追加
 * POST /api/user-activity/:userId/completed/:eventId
 */
routes.post('/:userId/completed/:eventId', async (c) => {
  const userId = c.req.param('userId')
  const eventId = c.req.param('eventId')
  await addCompletedEvent(c.env, userId, eventId)
  return c.json({ success: true })
})

/**
 * イベントを達成済みから削除
 * DELETE /api/user-activity/:userId/completed/:eventId
 */
routes.delete('/:userId/completed/:eventId', async (c) => {
  const userId = c.req.param('userId')
  const eventId = c.req.param('eventId')
  await removeCompletedEvent(c.env, userId, eventId)
  return c.json({ success: true })
})

export default routes
