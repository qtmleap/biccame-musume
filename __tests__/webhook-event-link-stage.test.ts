import { describe, expect, mock, test } from 'bun:test'
import type { Event } from '@biccame/shared/schemas/event.dto'
import type { WebhookLinkedEvent } from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  WebhookEventLinkBody,
  WebhookEventLinkSearch,
  WebhookEventSearchResults
} from '@/components/admin/webhook-event-link-dialog'
import {
  initialWebhookLinkStage,
  LINK_ASK_ACTION,
  LINK_ASK_CANCEL,
  LINK_ASK_FAILED,
  LINK_ASK_OTHER,
  LINK_ASK_TITLE,
  linkAskResult,
  reduceWebhookLinkStage,
  webhookLinkAsk
} from '@/components/admin/webhook-event-link-stage'
import { INITIAL_WEBHOOK_EVENT_SEARCH, selectedWebhookLinkEvent } from '@/components/admin/webhook-event-search'
import { LINKED_EVENT_REPLACING_NOTE, submitLinkedEvent } from '@/components/admin/webhook-linked-event-confirm'
import { Dialog } from '@/components/ui/dialog'

const PROPOSED = '550e8400-e29b-41d4-a716-446655440077'
const OTHER = '550e8400-e29b-41d4-a716-446655440078'
const suggestion: WebhookLinkedEvent = { eventId: PROPOSED, title: '缶バッジで繋ぐビッカメ娘旅', probability: 0.793 }

describe('段階の決定（純関数）', () => {
  test('提案があれば確認から、なければ検索から始まる', () => {
    expect(initialWebhookLinkStage(suggestion)).toBe('confirm')
    expect(initialWebhookLinkStage(undefined)).toBe('search')
  })

  test('「別のイベントを選ぶ」で検索へ移る。検索の段階のままなら変わらない', () => {
    expect(reduceWebhookLinkStage('confirm', { type: 'choose_other' })).toBe('search')
    expect(reduceWebhookLinkStage('search', { type: 'choose_other' })).toBe('search')
  })

  test('開き直すと確認の段階に戻る（段階は前回の状態ではなく、提案だけから決まる）', () => {
    const first = reduceWebhookLinkStage(initialWebhookLinkStage(suggestion), { type: 'choose_other' })
    expect(first).toBe('search')
    expect(initialWebhookLinkStage(suggestion)).toBe('confirm')
  })

  test('ダイアログの中身は閉じるたびに作り直される（段階の状態を開くたびに初期化する）', async () => {
    const dialog = await Bun.file('workers/web/src/app/components/admin/webhook-event-link-dialog.tsx').text()
    expect(dialog).toContain('{open && <WebhookEventLinkContent')
    expect(dialog).toContain('useReducer(reduceWebhookLinkStage, suggestion, initialWebhookLinkStage)')
  })
})

describe('確認の段階の文言（純関数）', () => {
  test('タイトルは「このイベントですか？」。本文は提案イベントのタイトル（「」付き）、確率、既存イベントを変更しない旨', () => {
    expect(webhookLinkAsk(suggestion, false)).toEqual({
      title: 'このイベントですか？',
      eventName: '「缶バッジで繋ぐビッカメ娘旅」',
      detail: '確率 79.3%。既存イベントの内容は変更しません。'
    })
  })

  test('登録済みの投稿では、既存の連携ダイアログと同じ置き換えの文言を続ける', () => {
    expect(webhookLinkAsk(suggestion, true).detail).toBe(
      `確率 79.3%。既存イベントの内容は変更しません。${LINKED_EVENT_REPLACING_NOTE}`
    )
    expect(LINKED_EVENT_REPLACING_NOTE).toBe(
      '登録済みのため、現在の連携先を置き換えます（元のイベントの内容は変更しません）。'
    )
  })

  test('ボタンの文言は 3 つで、失敗の文は検索の段階と一字一句同じ', async () => {
    expect([LINK_ASK_ACTION, LINK_ASK_OTHER, LINK_ASK_CANCEL]).toEqual([
      'このイベントと連携する',
      '別のイベントを選ぶ',
      'キャンセル'
    ])
    const dialog = await Bun.file('workers/web/src/app/components/admin/webhook-event-link-dialog.tsx').text()
    expect(dialog).toContain(LINK_ASK_FAILED)
  })
})

describe('「このイベントと連携する」を押したあとの扱い(純関数)', () => {
  const press = async (
    onLink: (eventId: string) => Promise<unknown>,
    overrides: { canLink?: boolean; isPending?: boolean } = {}
  ) =>
    linkAskResult(
      await submitLinkedEvent(
        { current: false },
        { canLink: true, isPending: false, ...overrides, eventId: suggestion.eventId, onLink }
      )
    )

  test('成功したら提案のイベント ID で 1 回だけ連携し、閉じる', async () => {
    const onLink = mock(async (_eventId: string) => {})
    expect(await press(onLink)).toEqual({ close: true, failed: false })
    expect(onLink).toHaveBeenCalledTimes(1)
    expect(onLink).toHaveBeenCalledWith(PROPOSED)
  })

  test('失敗したら閉じずに失敗の文を出し、押し直せる', async () => {
    const onLink = mock(async (_eventId: string) => {
      throw new Error('Synthetic link failure')
    })
    expect(await press(onLink)).toEqual({ close: false, failed: true })
    expect(await press(onLink)).toEqual({ close: false, failed: true })
    expect(onLink).toHaveBeenCalledTimes(2)
  })

  test('処理中・連携できない状態では、API を呼ばず、閉じもせず、失敗の文も出さない', async () => {
    const onLink = mock(async (_eventId: string) => {})
    expect(await press(onLink, { isPending: true })).toEqual({ close: false, failed: false })
    expect(await press(onLink, { canLink: false })).toEqual({ close: false, failed: false })
    expect(onLink).not.toHaveBeenCalled()
  })
})

const eventOf = (uuid: string, title: string): Event => ({
  uuid,
  title,
  category: 'limited_card',
  stores: ['akiba'],
  characterIds: ['akiba'],
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
})
const events = [eventOf(PROPOSED, '缶バッジで繋ぐビッカメ娘旅'), eventOf(OTHER, '別のイベント')]

/** 店舗が決まらない範囲(店舗では絞らない)。終了日・終了日時の無いこのファイルのイベントは、すべて一覧に残る。 */
const scope = { stores: [], postedAt: '2026-10-02T03:00:00.000Z' }

type Options = {
  suggestion?: WebhookLinkedEvent
  disabled?: boolean
  isPending?: boolean
  replacing?: boolean
  onLink?: (eventId: string) => Promise<unknown>
}

/** Dialog のコンテキストの中で、ダイアログの中身(段階)を静的に描画する。検索の段階はイベント一覧のキャッシュを読む。 */
const renderBody = ({
  suggestion: proposed,
  disabled = false,
  isPending = false,
  replacing = false,
  onLink = async () => {}
}: Options = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['admin-events'], events)
  try {
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          Dialog,
          { open: true },
          createElement(WebhookEventLinkBody, {
            ...(proposed === undefined ? {} : { suggestion: proposed }),
            disabled,
            isPending,
            replacing,
            scope,
            onLink,
            onClose: () => {}
          })
        )
      )
    )
  } finally {
    client.clear()
  }
}
/** ラベルのボタン全体。無ければ null。 */
const buttonOf = (markup: string, label: string): string | null => {
  const matched = markup.match(new RegExp(`<button\\b[^>]*>(?:(?!</button>).)*${label}</button>`))
  return matched === null ? null : matched[0]
}
/** React が付ける disabled 属性(クラスに含まれる Tailwind の disabled: とは区別する)。 */
const isDisabled = (button: string) => button.slice(0, button.indexOf('>') + 1).includes(' disabled=""')
const stateOf = (markup: string, label: string) => {
  const button = buttonOf(markup, label)
  if (button === null) throw new Error(`Missing button: ${label}`)
  return isDisabled(button) ? 'disabled' : 'enabled'
}

describe('提案があるとき: 最初に「このイベントですか？」と確認する', () => {
  test('タイトル・提案イベントのタイトル・確率・既存イベントを変更しない旨・3 つのボタンを出し、検索の段階は出さない', () => {
    const markup = renderBody({ suggestion })
    expect(markup).toContain(LINK_ASK_TITLE)
    expect(markup).toContain('「缶バッジで繋ぐビッカメ娘旅」')
    expect(markup).toContain('確率 79.3%。既存イベントの内容は変更しません。')
    expect(markup).not.toContain(LINKED_EVENT_REPLACING_NOTE)
    for (const label of [LINK_ASK_ACTION, LINK_ASK_OTHER, LINK_ASK_CANCEL])
      expect(buttonOf(markup, label)).not.toBeNull()
    expect(markup).not.toContain('既存イベントへ連携')
    expect(markup).not.toContain('イベントを検索')
    expect(markup).not.toContain('type="radio"')
  })

  test('主ボタンはブランド色、ほかの 2 つは outline で枠線色を共通テーマ色にそろえる', () => {
    const markup = renderBody({ suggestion })
    expect(buttonOf(markup, LINK_ASK_ACTION)).toContain('bg-brand text-brand-foreground hover:bg-brand/90')
    for (const label of [LINK_ASK_OTHER, LINK_ASK_CANCEL]) {
      const button = buttonOf(markup, label)
      expect(button).toContain('data-variant="outline"')
      expect(button).toContain('border-card-border')
    }
  })

  test('登録済みの投稿では、連携先を置き換える旨を続ける', () => {
    expect(renderBody({ suggestion, replacing: true })).toContain(LINKED_EVENT_REPLACING_NOTE)
  })

  test('通常は 3 つとも押せる', () => {
    const markup = renderBody({ suggestion })
    for (const label of [LINK_ASK_ACTION, LINK_ASK_OTHER, LINK_ASK_CANCEL])
      expect(stateOf(markup, label)).toBe('enabled')
  })

  test('処理中は連携系のボタン(連携する・別のイベントを選ぶ)とキャンセルを押せない', () => {
    const markup = renderBody({ suggestion, isPending: true })
    expect(stateOf(markup, '連携中…')).toBe('disabled')
    expect(stateOf(markup, LINK_ASK_OTHER)).toBe('disabled')
    expect(stateOf(markup, LINK_ASK_CANCEL)).toBe('disabled')
  })

  test('連携できない状態(disabled)では「このイベントと連携する」を押せない', () => {
    expect(stateOf(renderBody({ suggestion, disabled: true }), LINK_ASK_ACTION)).toBe('disabled')
  })

  test('描画しただけでは、連携 API(onLink)は呼ばれない', () => {
    const onLink = mock(async (_eventId: string) => {})
    renderBody({ suggestion, onLink })
    renderBody({ suggestion, replacing: true, onLink })
    expect(onLink).not.toHaveBeenCalled()
  })
})

describe('提案がないとき: 今までどおり検索の段階がそのまま開く', () => {
  test('検索の見出し・入力・一覧・「連携する」を出し、確認の段階は出さない', () => {
    const markup = renderBody()
    expect(markup).toContain('既存イベントへ連携')
    expect(markup).toContain('イベントを検索')
    expect(markup).toContain('連携先を選択してください。')
    expect(buttonOf(markup, '連携する')).not.toBeNull()
    expect(markup).not.toContain(LINK_ASK_TITLE)
    expect(buttonOf(markup, LINK_ASK_OTHER)).toBeNull()
  })

  test('検索の段階は、選択なしでは「連携する」を押せない', () => {
    expect(stateOf(renderBody(), '連携する')).toBe('disabled')
  })

  test('登録済みの置き換えの文言は、検索の段階の説明に今までどおり出る', () => {
    expect(renderBody({ replacing: true })).toContain(LINKED_EVENT_REPLACING_NOTE)
  })
})

describe('「別のイベントを選ぶ」の後の検索の段階は、提案を選択済みにしない', () => {
  test('検索の段階は提案を受け取らず、提案のイベントが一覧にあっても、どのラジオも選択されていない', () => {
    const markup = renderBody({ suggestion: undefined })
    expect(markup).toContain('缶バッジで繋ぐビッカメ娘旅')
    expect(markup).toContain('別のイベント')
    expect(markup).not.toMatch(/checked=""/)
    const search = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(
          Dialog,
          { open: true },
          createElement(WebhookEventLinkSearch, {
            disabled: false,
            isPending: false,
            replacing: false,
            scope,
            onLink: async () => {},
            onClose: () => {}
          })
        )
      )
    )
    expect(search).not.toMatch(/checked=""/)
    expect(search).toContain('連携先を選択してください。')
  })

  test('初期状態は選択なしで、提案のイベントが一覧にあっても選択中のイベントは無い', () => {
    expect(INITIAL_WEBHOOK_EVENT_SEARCH).toEqual({ search: '', selectedId: null })
    expect(selectedWebhookLinkEvent(events, INITIAL_WEBHOOK_EVENT_SEARCH)).toBeUndefined()
    expect(
      renderToStaticMarkup(
        createElement(WebhookEventSearchResults, {
          events,
          state: INITIAL_WEBHOOK_EVENT_SEARCH,
          disabled: false,
          onSelect: () => {}
        })
      )
    ).not.toMatch(/checked=""/)
  })

  test('検索の段階は初期状態で始まり、提案の ID を初期選択に渡す経路がソースに残っていない', async () => {
    const dialog = await Bun.file('workers/web/src/app/components/admin/webhook-event-link-dialog.tsx').text()
    const search = await Bun.file('workers/web/src/app/components/admin/webhook-event-search.ts').text()
    expect(dialog).toContain('useReducer(reduceWebhookEventSearch, INITIAL_WEBHOOK_EVENT_SEARCH)')
    for (const source of [dialog, search]) {
      expect(source).not.toContain('initialWebhookEventSearch')
      expect(source).not.toContain('suggestedEventId')
    }
  })
})
