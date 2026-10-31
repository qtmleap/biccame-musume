import { describe, expect, test } from 'bun:test'
import type { Event } from '@biccame/shared/schemas/event.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookEventLinkSearch } from '@/components/admin/webhook-event-link-dialog'
import type { WebhookLinkScope } from '@/components/admin/webhook-event-link-scope'
import { Dialog } from '@/components/ui/dialog'
import { STORE_NAME_LABELS } from '@/locales/app.content'

const POSTED_AT = '2026-10-10T03:00:00.000Z'
const at = (iso: string) => dayjs(iso).toDate()
const eventWith = (suffix: string, overrides: Partial<Event> = {}): Event => ({
  uuid: `550e8400-e29b-41d4-a716-44665544${suffix}`,
  title: `イベント${suffix}`,
  category: 'limited_card',
  stores: ['akiba'],
  characterIds: ['akiba'],
  startDate: at('2026-10-01T00:00:00+09:00'),
  conditions: [],
  isVerified: true,
  isPreliminary: false,
  status: 'ongoing',
  daysUntil: 0,
  interestedCount: 0,
  completedCount: 0,
  createdAt: at('2026-09-30T03:00:00Z'),
  updatedAt: at('2026-09-30T03:00:00Z'),
  ...overrides
})
const events = [
  eventWith('0001'),
  eventWith('0002', { stores: ['funabashi'] }),
  eventWith('0003', { endedAt: at('2026-10-01T00:00:00Z') }),
  eventWith('0004', { stores: ['funabashi', 'akiba'] }),
  eventWith('0005', { endDate: at('2026-10-09T00:00:00+09:00') })
]

const renderSearch = (scope: WebhookLinkScope, values: readonly Event[] = events) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['admin-events'], values)
  try {
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          Dialog,
          { open: true },
          createElement(WebhookEventLinkSearch, {
            disabled: false,
            isPending: false,
            replacing: false,
            ended: false,
            scope,
            onLink: async () => {},
            onClose: () => {}
          })
        )
      )
    )
  } finally {
    client.clear()
  }
}
const shownTitles = (markup: string) => [...markup.matchAll(/イベント(\d{4})<\/span>/g)].map((match) => match[1])

describe('連携ダイアログの一覧と説明は、店舗と投稿時点で絞る', () => {
  test('店舗が決まるとき: その店舗の、終わっていないイベントだけを出し、店舗名を説明に出す', () => {
    const markup = renderSearch({ stores: ['akiba'], postedAt: POSTED_AT })
    expect(shownTitles(markup).toSorted()).toEqual(['0001', '0004'])
    expect(markup).toContain('2件のイベント')
    expect(markup).toContain(`${STORE_NAME_LABELS.akiba}で、投稿の時点で終わっていないイベントから選んでください。`)
    expect(markup).toContain('既存イベントの内容は変更しません。')
    expect(markup).not.toContain('店舗が決まらないため')
  })

  test('店舗が決まらないとき: 全店舗の、終わっていないイベントを出し、その旨を説明に出す', () => {
    const markup = renderSearch({ stores: [], postedAt: POSTED_AT })
    expect(shownTitles(markup).toSorted()).toEqual(['0001', '0002', '0004'])
    expect(markup).toContain('店舗が決まらないため、全店舗の、投稿の時点で終わっていないイベントを表示しています。')
    expect(markup).toContain('既存イベントの内容は変更しません。')
  })

  test('条件に合うイベントが無ければ、0 件の文言を出す', () => {
    const markup = renderSearch({ stores: ['kyoto'], postedAt: POSTED_AT })
    expect(shownTitles(markup)).toEqual([])
    expect(markup).toContain('条件に一致するイベントがありません。')
  })

  test('登録済みの置き換えの一文は、説明にそのまま残る', async () => {
    const dialog = await Bun.file('workers/web/src/app/components/admin/webhook-event-link-dialog.tsx').text()
    expect(dialog).toMatch(/\{webhookLinkScopeDescription\(scope\.stores\)\}\s*\{linkedEventEffectNote\(ended\)\}/)
    expect(dialog).toContain('{replacing &&')
  })

  test('選択も同じ集合から行う（見えないイベントへは連携できない）', async () => {
    const dialog = await Bun.file('workers/web/src/app/components/admin/webhook-event-link-dialog.tsx').text()
    expect(dialog).toContain('linkableWebhookEvents(eventsQuery.data, scope)')
    expect(dialog).toContain('selectedWebhookLinkEvent(events, state)')
  })

  test('詳細ページは、選択中の候補と投稿日時から作った範囲を渡す', async () => {
    const detail = await Bun.file('workers/web/src/app/components/admin/webhook-job-detail.tsx').text()
    expect(detail).toContain('webhookLinkStores(job, active)')
    expect(detail).toContain('postedAt: job.post.createdAt')
    expect(detail).toContain('scope={linkScope}')
  })
})

describe('検索欄の枠', () => {
  test('shadcn 既定の枠とリングを使い、リングだけ内側に描く（フォームの overflow-hidden で切れないようにする）', () => {
    const markup = renderSearch({ stores: [], postedAt: POSTED_AT })
    const input = markup.match(/<input\b[^>]*id="webhook-link-search"[^>]*>/)?.[0]
    if (input === undefined) throw new Error('検索欄が描画されていない')
    const classAttribute = input.match(/class="([^"]*)"/)?.[1]
    if (classAttribute === undefined) throw new Error('検索欄に class が無い')
    const classes = classAttribute.split(/\s+/)
    expect(classes).toContain('focus-visible:ring-inset')
    // 既定の枠とリングを消す指定は入れない。
    for (const name of ['focus-visible:ring-0', 'focus-visible:border-transparent', 'focus-visible:outline-brand'])
      expect(classes).not.toContain(name)
    // border-card-border はテーマが border を透明にするので指定しない。
    expect(classes).not.toContain('border-card-border')
  })
})
