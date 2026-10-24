import { describe, expect, test } from 'bun:test'
import type { Event } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookEventSearchResults } from '@/components/admin/webhook-event-link-dialog'
import {
  INITIAL_WEBHOOK_EVENT_SEARCH,
  reduceWebhookEventSearch,
  searchWebhookLinkEvents,
  selectedWebhookLinkEvent
} from '@/components/admin/webhook-event-search'

const first: Event = {
  uuid: '550e8400-e29b-41d4-a716-446655440001',
  title: 'ふなとーたん 擬人化記念アクリルキーホルダー',
  category: 'ackey',
  stores: ['funabashi'],
  characterIds: ['funato'],
  startDate: dayjs('2026-10-01T03:00:00Z').toDate(),
  conditions: [],
  isVerified: false,
  isPreliminary: false,
  status: 'ongoing',
  daysUntil: 0,
  interestedCount: 0,
  completedCount: 0,
  createdAt: dayjs('2026-09-30T03:00:00Z').toDate(),
  updatedAt: dayjs('2026-09-30T03:00:00Z').toDate()
}
const second: Event = {
  ...first,
  uuid: '550e8400-e29b-41d4-a716-446655440002',
  title: '限定名刺',
  category: 'limited_card',
  stores: ['akiba'],
  characterIds: ['akiba', 'kawasaki'],
  startDate: dayjs('2026-10-05T03:00:00Z').toDate()
}
const events = [first, second]

const markupOf = (state = INITIAL_WEBHOOK_EVENT_SEARCH, disabled = false, values = events) =>
  renderToStaticMarkup(
    createElement(WebhookEventSearchResults, { events: values, state, disabled, onSelect: () => undefined })
  )

describe('既存イベントへの連携検索', () => {
  test('全件を新しい開始日順で表示し、元配列は変更しない', () => {
    expect(searchWebhookLinkEvents(events, '').map((event) => event.uuid)).toEqual([second.uuid, first.uuid])
    expect(events[0]).toBe(first)
    expect(INITIAL_WEBHOOK_EVENT_SEARCH.selectedId).toBeNull()
  })

  test.each(['アクリル', 'ふなとーたん', '船橋', '2026/10/01', '2026-10-01', first.uuid.toUpperCase()])(
    '%sでイベント名・開催店舗・対象キャラ・開始日・IDを検索できる',
    (search) => expect(searchWebhookLinkEvents(events, search)).toEqual([first])
  )

  test('複数語のAND検索と全角空白・英数字の正規化に対応し、対象キャラを店舗から推定しない', () => {
    expect(searchWebhookLinkEvents(events, '船橋　２０２６ ふなとーたん')).toEqual([first])
    expect(searchWebhookLinkEvents(events, '川崎たん')).toEqual([second])
    expect(searchWebhookLinkEvents(events, 'ふなたん')).toEqual([])
  })

  test('検索語を変更すると選択を解除し、別の候補へ勝手に連携ない', () => {
    const selected = reduceWebhookEventSearch(INITIAL_WEBHOOK_EVENT_SEARCH, { type: 'select', id: first.uuid })
    expect(selectedWebhookLinkEvent(events, selected)).toBe(first)
    const changed = reduceWebhookEventSearch(selected, { type: 'search', value: '名刺' })
    expect(changed).toEqual({ search: '名刺', selectedId: null })
    expect(selectedWebhookLinkEvent(events, changed)).toBeUndefined()
    expect(selectedWebhookLinkEvent(events, { search: '名刺', selectedId: first.uuid })).toBeUndefined()
    expect(selectedWebhookLinkEvent([], selected)).toBeUndefined()
  })

  test('候補はタイトル・開始日・開催店舗・全対象キャラを併記したラジオ選択で、選択だけでは保存しない', () => {
    const markup = markupOf({ search: '', selectedId: first.uuid })
    expect(markup).toContain('連携先のイベントを選択')
    expect(markup).toContain('type="radio"')
    expect(markup).toContain(`value="${first.uuid}"`)
    expect(markup).toContain('checked=""')
    expect(markup).toContain(first.title)
    expect(markup).toContain('開始日 2026/10/01')
    expect(markup).toContain('船橋駅FACE店')
    expect(markup).toContain('対象ビッカメ娘：ふなとーたん')
    expect(markup).toContain('アキバたん、川崎たん')
    expect(markup).not.toContain('<a')
    expect(markup).not.toContain('type="submit"')
  })

  test('空検索結果・対象未判定を表示し、処理中はラジオ選択を無効にする', () => {
    expect(markupOf({ search: '一致しない語', selectedId: null })).toContain('条件に一致するイベントがありません。')
    const markup = markupOf(INITIAL_WEBHOOK_EVENT_SEARCH, true, [{ ...first, characterIds: [] }])
    expect(markup).toContain('<fieldset disabled=""')
    expect(markup).toContain('対象ビッカメ娘：未判定')
  })

  test('ダイアログは明示的に開いたときだけ検索を取得し、対象候補を変えると再マウントする', async () => {
    const dialog = await Bun.file('workers/web/src/app/components/admin/webhook-event-link-dialog.tsx').text()
    const detail = await Bun.file('workers/web/src/app/components/admin/webhook-job-detail.tsx').text()
    expect(dialog).toContain('{open && <WebhookEventLinkContent')
    expect(dialog).toContain('DialogTrigger asChild')
    expect(dialog).toContain("type='submit'")
    expect(dialog).toContain('disabled={blocked}')
    expect(dialog).toContain('if (blocked || selected === undefined || submitting.current) return')
    expect(detail).toContain("active === undefined ? 'post' : active.eventUUID")
    expect(detail).not.toContain('link-event-id')
    expect(dialog).not.toContain('navigate(')
  })
})
