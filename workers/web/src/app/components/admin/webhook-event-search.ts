import type { Event } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { CHARACTER_NAME_LABELS, SPECIAL_CHARACTER_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'

export const webhookEventCharacterNames = (event: Event): string =>
  event.characterIds
    .map((id) => (id === 'other' || id === 'secret' ? SPECIAL_CHARACTER_LABELS[id] : CHARACTER_NAME_LABELS[id]))
    .join('、')

export const webhookEventStoreNames = (event: Event): string =>
  event.stores.map((id) => STORE_NAME_LABELS[id]).join('、')

export const searchWebhookLinkEvents = (events: readonly Event[], search: string): Event[] => {
  const terms = search.normalize('NFKC').toLocaleLowerCase('ja').trim().split(/\s+/).filter(Boolean)
  return events
    .filter((event) => {
      const text = [
        event.title,
        event.uuid,
        dayjs(event.startDate).format('YYYY/MM/DD'),
        dayjs(event.startDate).format('YYYY-MM-DD'),
        webhookEventStoreNames(event),
        webhookEventCharacterNames(event)
      ]
        .join(' ')
        .normalize('NFKC')
        .toLocaleLowerCase('ja')
      return terms.every((term) => text.includes(term))
    })
    .toSorted((a, b) => dayjs(b.startDate).valueOf() - dayjs(a.startDate).valueOf() || a.uuid.localeCompare(b.uuid))
}

export type WebhookEventSearchState = { search: string; selectedId: string | null }
export type WebhookEventSearchAction = { type: 'search'; value: string } | { type: 'select'; id: string }

export const INITIAL_WEBHOOK_EVENT_SEARCH: WebhookEventSearchState = { search: '', selectedId: null }

/** ダイアログを開いた時点の状態。連携先の提案があるときだけ、そのイベントを選択済みにする（連携は人が押すまで行わない）。 */
export const initialWebhookEventSearch = (suggestedEventId: string | undefined): WebhookEventSearchState =>
  suggestedEventId === undefined
    ? INITIAL_WEBHOOK_EVENT_SEARCH
    : { ...INITIAL_WEBHOOK_EVENT_SEARCH, selectedId: suggestedEventId }

/** 検索語を変えたら選択を解除し、見えなくなったイベントへ誤って紐付けない。 */
export const reduceWebhookEventSearch = (
  state: WebhookEventSearchState,
  action: WebhookEventSearchAction
): WebhookEventSearchState =>
  action.type === 'search' ? { search: action.value, selectedId: null } : { ...state, selectedId: action.id }

export const selectedWebhookLinkEvent = (events: readonly Event[], state: WebhookEventSearchState): Event | undefined =>
  searchWebhookLinkEvents(events, state.search).find((event) => event.uuid === state.selectedId)
