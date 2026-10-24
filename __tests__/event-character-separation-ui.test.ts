import { expect, test } from 'bun:test'
import { socialEventView } from '@biccame/shared/domain/social-post'
import { buildEventCreatedText } from '@biccame/shared/domain/tweet-text'
import { EventSchema } from '@biccame/shared/schemas/event.dto'
import { SocialRowSchema } from '@biccame/shared/social'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EventCharacterBadge } from '@/components/events/event-character-badge'
import { eventRow } from '@/images/format'
import { EventFormSchema, toEventPayload, toFormValues, toFormValuesFromQuery } from '@/lib/event-form'

const uuid = '11111111-1111-4111-8111-111111111111'
const formValues = () => {
  const result = EventFormSchema.safeParse({
    uuid,
    title: 'ふなとーたん・川崎たん記念アクキー',
    category: 'ackey',
    stores: ['funabashi', 'akiba'],
    characterIds: ['funato', 'kawasaki'],
    startDate: '2026-10-20',
    endDate: '',
    endedAt: '',
    groupId: '',
    referenceUrls: [{ uuid, type: 'announce', url: 'https://example.invalid/post/1' }],
    conditions: [{ uuid, type: 'everyone' }],
    isVerified: true,
    isPreliminary: false,
    shouldTweet: false
  })
  if (!result.success) throw new Error(result.error.message)
  return result.data
}
const detailEvent = () => {
  const payload = toEventPayload(formValues(), { isEditMode: false })
  const result = EventSchema.safeParse({
    ...payload,
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
    status: 'ongoing',
    daysUntil: 0,
    interestedCount: 0,
    completedCount: 0
  })
  if (!result.success) throw new Error(result.error.message)
  return { ...result.data, referenceUrls: payload.referenceUrls, comments: [] }
}

test('複数の開催店舗と対象キャラを独立したままフォーム送信・再編集できる', () => {
  const event = detailEvent()
  expect(event.stores).toEqual(['funabashi', 'akiba'])
  expect(event.characterIds).toEqual(['funato', 'kawasaki'])
  expect(toFormValues(event).characterIds).toEqual(['funato', 'kawasaki'])
  const empty = toEventPayload({ ...formValues(), characterIds: [] }, { isEditMode: false })
  expect(empty.characterIds).toEqual([])
  expect(empty.stores).toEqual(['funabashi', 'akiba'])
})

test('作成画面のクエリから店舗と対象キャラをそれぞれ復元する', () => {
  const values = toFormValuesFromQuery({ stores: 'funabashi,akiba', characterIds: 'funato,kawasaki' }, uuid)
  expect(values.stores).toEqual(['funabashi', 'akiba'])
  expect(values.characterIds).toEqual(['funato', 'kawasaki'])
  expect(toFormValuesFromQuery({ stores: 'funabashi' }, uuid).characterIds).toEqual([])
})

test('対象バッジ・画像・投稿本文は閉店キャラを含む対象全員を保持する', () => {
  const event = detailEvent()
  const badge = renderToStaticMarkup(createElement(EventCharacterBadge, { event }))
  expect(badge).toContain('ふなとーたん')
  expect(badge).toContain('川崎たん')
  expect(badge).not.toContain('ふなたん')
  expect(eventRow(event).portraits).toEqual(['funato', 'kawasaki'])
  expect(eventRow(event).character).toBe('ふなとーたん・川崎たん')
  const view = socialEventView(event)
  expect(view.avatars).toEqual(['funato', 'kawasaki'])
  expect(view.stores).toEqual(['船橋駅FACE店', 'AKIBA店'])
  const text = buildEventCreatedText(event)
  expect(text).toContain('船橋駅FACE店')
  expect(text).toContain('ふなとーたん・川崎たん')
  expect(text).not.toContain('ふなたん')
  const unknown = { ...event, characterIds: [] }
  expect(socialEventView(unknown).avatars).toEqual([])
  expect(eventRow(unknown).portraits).toEqual([])
  expect(renderToStaticMarkup(createElement(EventCharacterBadge, { event: unknown }))).toBe('')
})

test('画像スナップショットは全対象を保存し、旧保存形式の単一対象だけ配列化する', () => {
  const base = { eventIds: [uuid], title: '記念配布', stores: ['船橋駅FACE店'], target: null, period: null, date: null }
  const legacy = SocialRowSchema.safeParse({ ...base, avatar: 'funato' })
  expect(legacy.success && legacy.data.avatars).toEqual(['funato'])
  const current = SocialRowSchema.safeParse({ ...base, avatars: ['funato', 'kawasaki', 'akiba', 'abeno'] })
  expect(current.success && current.data.avatars).toEqual(['funato', 'kawasaki', 'akiba', 'abeno'])
})
