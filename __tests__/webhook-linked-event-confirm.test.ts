import { describe, expect, mock, test } from 'bun:test'
import type { WebhookDiscovery, WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LINKED_EVENT_CONFIRM_ACTION,
  LINKED_EVENT_CONFIRM_TITLE,
  LINKED_EVENT_LINK_LABEL,
  LINKED_EVENT_REPLACING_NOTE,
  linkedEventConfirmation,
  submitLinkedEvent
} from '@/components/admin/webhook-linked-event-confirm'
import { WebhookLinkedEventProposal } from '@/components/admin/webhook-linked-event-proposal'
import { makeJob } from './fixtures/webhook-d1-jobs'
import { listJob, renderDetail } from './fixtures/webhook-management'

const PROPOSED = '550e8400-e29b-41d4-a716-446655440077'
const proposed: WebhookDiscovery = {
  relevance: 'detected',
  action: 'end',
  confidence: 0.96,
  evidence: [],
  missingFields: [],
  reasons: ['event_ended'],
  linkedEvent: { eventId: PROPOSED, title: '缶バッジで繋ぐビッカメ娘旅', probability: 0.793 }
}
const heldJob: WebhookJob = { ...makeJob(), status: 'held', candidate: null, discovery: proposed }

type Options = {
  job?: WebhookJob
  canLink?: boolean
  isPending?: boolean
  onLink?: (eventId: string) => Promise<unknown>
}

/** Link を含むので、ルーターの中で描画する。 */
const render = async ({ job = heldJob, canLink = true, isPending = false, onLink = async () => {} }: Options = {}) => {
  const routeTree = createRootRoute({
    component: () => createElement(WebhookLinkedEventProposal, { job, canLink, isPending, onLink })
  })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  return renderToStaticMarkup(createElement(RouterProvider, { router }))
}
/** 「このイベントと連携」ボタン全体。無ければ null。 */
const buttonTag = (markup: string): string | null => {
  const matched = markup.match(new RegExp(`<button\\b[^>]*>(?:(?!</button>).)*${LINKED_EVENT_LINK_LABEL}</button>`))
  return matched === null ? null : matched[0]
}
const openingTag = (button: string) => button.slice(0, button.indexOf('>') + 1)
/** React が付ける disabled 属性(クラスに含まれる Tailwind の disabled: とは区別する)。 */
const isDisabled = (button: string) => openingTag(button).includes(' disabled=""')

describe('提案の節の「このイベントと連携」ボタン', () => {
  test('提案があれば、上部の連携ボタンと同じ outline・枠線色・Link2 アイコンのボタンを出す', async () => {
    const button = buttonTag(await render())
    if (button === null) throw new Error('Missing link button')
    const tag = openingTag(button)
    expect(tag).toContain('data-variant="outline"')
    expect(tag).toContain('border-card-border')
    expect(isDisabled(button)).toBe(false)
    expect(button).toContain('lucide-link')
  })

  test('提案が無ければ（旧データ・記録なし・提案なしの記録）ボタンも確認も出さない', async () => {
    for (const discovery of [undefined, null, { ...proposed, linkedEvent: undefined }])
      expect(await render({ job: { ...heldJob, discovery } })).toBe('')
  })

  test('連携できない状態（canLink が偽）と処理中は、ボタンを押せない', async () => {
    for (const options of [{ canLink: false }, { isPending: true }, { canLink: false, isPending: true }]) {
      const button = buttonTag(await render(options))
      if (button === null) throw new Error('Missing link button')
      expect(isDisabled(button)).toBe(true)
    }
  })

  test('描画しただけでは、確認ダイアログは開かず、連携 API（onLink）も呼ばれない', async () => {
    const onLink = mock(async () => {})
    const markup = await render({ onLink })
    expect(markup).not.toContain(LINKED_EVENT_CONFIRM_TITLE)
    expect(markup).not.toContain(LINKED_EVENT_CONFIRM_ACTION)
    expect(onLink).not.toHaveBeenCalled()
  })

  test('詳細ページでは、既存の連携ボタンと同じ可否で押せる（判定中は押せない）', async () => {
    const enabled = buttonTag(await renderDetail({ ...listJob, status: 'held', discovery: proposed }))
    if (enabled === null) throw new Error('Missing link button')
    expect(isDisabled(enabled)).toBe(false)
    for (const status of ['processing', 'failed'] as const) {
      const blocked = buttonTag(await renderDetail({ ...listJob, status, discovery: proposed }))
      if (blocked === null) throw new Error('Missing link button')
      expect(isDisabled(blocked)).toBe(true)
    }
  })
})

describe('確認ダイアログの文言', () => {
  test('未登録で終了判定でない投稿: 提案イベントのタイトルと、既存イベントを変更しない旨だけを出す', () => {
    expect(linkedEventConfirmation('缶バッジで繋ぐビッカメ娘旅', { replacing: false, ended: false })).toEqual({
      title: 'このイベントと連携しますか？',
      description: '「缶バッジで繋ぐビッカメ娘旅」と連携します。既存イベントの内容は変更しません。',
      actionLabel: '連携する'
    })
  })

  test('登録済みで終了判定でない投稿: 連携先を置き換える旨を続ける', () => {
    const { description } = linkedEventConfirmation('缶バッジで繋ぐビッカメ娘旅', { replacing: true, ended: false })
    expect(description).toBe(
      `「缶バッジで繋ぐビッカメ娘旅」と連携します。既存イベントの内容は変更しません。${LINKED_EVENT_REPLACING_NOTE}`
    )
    expect(description).toContain('登録済みのため、現在の連携先を置き換えます（元のイベントの内容は変更しません）。')
  })

  test('置き換えの文言は、既存の連携ダイアログの説明と一字一句同じ', async () => {
    const dialog = await Bun.file('workers/web/src/app/components/admin/webhook-event-link-dialog.tsx').text()
    expect(dialog).toContain(`{replacing && '${LINKED_EVENT_REPLACING_NOTE}'}`)
  })

  test('詳細ページは提案の連携を、既存の連携ダイアログと同じ候補への紐付け（linkEvent）で呼ぶ', async () => {
    const detail = await Bun.file('workers/web/src/app/components/admin/webhook-job-detail.tsx').text()
    expect(detail).toContain(
      "await resolve.mutateAsync({ postId, data: { ...candidateSelection, action: 'link', eventId } })"
    )
    expect(detail.match(/onLink=\{linkEvent\}/g)).toHaveLength(2)
  })
})

describe('「連携する」を押したときの実行', () => {
  const base = { canLink: true, isPending: false, eventId: PROPOSED }

  test('連携できる状態では、提案のイベント ID で連携 API を 1 回呼ぶ', async () => {
    const onLink = mock(async (_eventId: string) => {})
    expect(await submitLinkedEvent({ current: false }, { ...base, onLink })).toBe('linked')
    expect(onLink).toHaveBeenCalledTimes(1)
    expect(onLink).toHaveBeenCalledWith(PROPOSED)
  })

  test.each([
    { name: 'canLink が偽', input: { canLink: false }, busy: false },
    { name: '処理中', input: { isPending: true }, busy: false },
    { name: '実行中の二重送信', input: {}, busy: true }
  ])('$name のときは連携 API を呼ばない', async ({ input, busy }) => {
    const onLink = mock(async (_eventId: string) => {})
    expect(await submitLinkedEvent({ current: busy }, { ...base, ...input, onLink })).toBe('skipped')
    expect(onLink).not.toHaveBeenCalled()
  })

  test('連打しても、実行中の連携は 1 回だけ（完了後は押し直せる）', async () => {
    const release = Promise.withResolvers<void>()
    const onLink = mock(async (_eventId: string) => await release.promise)
    const busy = { current: false }
    const first = submitLinkedEvent(busy, { ...base, onLink })
    expect(await submitLinkedEvent(busy, { ...base, onLink })).toBe('skipped')
    release.resolve()
    expect(await first).toBe('linked')
    expect(onLink).toHaveBeenCalledTimes(1)
    expect(busy.current).toBe(false)
  })

  test('失敗したら failed を返し（ダイアログは閉じない）、実行中の印を戻して押し直せる', async () => {
    const onLink = mock(async (_eventId: string) => {
      throw new Error('Synthetic link failure')
    })
    const busy = { current: false }
    expect(await submitLinkedEvent(busy, { ...base, onLink })).toBe('failed')
    expect(busy.current).toBe(false)
    expect(await submitLinkedEvent(busy, { ...base, onLink })).toBe('failed')
    expect(onLink).toHaveBeenCalledTimes(2)
  })
})
