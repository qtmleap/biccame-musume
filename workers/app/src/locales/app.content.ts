import type { Dictionary } from 'intlayer'
import type { EventCategory, EventStatus, ReferenceUrlType, SpecialCharacter } from '@/schemas/event.dto'
import type { Region, StoreKey } from '@/schemas/store.dto'
import { badgeContent } from './app-dictionary/badge-labels'
import { commonContent } from './app-dictionary/common-labels'
import { enumContent } from './app-dictionary/enum-labels'
import { screenContent } from './app-dictionary/screen-labels'
import { storeCharacterContent } from './app-dictionary/store-character-labels'

// intlayer は *.content.ts を辞書として自動検出するため、app-dictionary/ 配下のファイル名に .content を含めない。
// 辞書のキー順は下の展開順で決まる。
const appContent = {
  key: 'app',
  content: {
    ...enumContent,
    ...storeCharacterContent,
    ...commonContent,
    ...badgeContent,
    ...screenContent
  }
} satisfies Dictionary

export default appContent

// コンポーネントから使いやすいようにエクスポート
export const EVENT_STATUS_LABELS = appContent.content.status as Record<EventStatus, string>
export const EVENT_CATEGORY_LABELS = appContent.content.category as Record<EventCategory, string>
export const REFERENCE_URL_TYPE_LABELS = appContent.content.ref as Record<ReferenceUrlType, string>
export const REFERENCE_URL_TYPE_LABELS_LONG = appContent.content.refLong as Record<ReferenceUrlType, string>
export const REGION_LABELS = appContent.content.region as Record<Region, string>
export const STORE_NAME_LABELS = appContent.content.store_name
export const CHARACTER_NAME_LABELS = appContent.content.character_name as Record<StoreKey, string>
export const SPECIAL_CHARACTER_LABELS = appContent.content.special_character as Record<SpecialCharacter, string>
export const MY_PAGE_LABELS = appContent.content.myPage
export const FILTER_LABELS = appContent.content.filter
export const SORT_LABELS = appContent.content.sort
export const CHARACTER_DETAIL_LABELS = appContent.content.characterDetail
export const EVENT_LABELS = appContent.content.event
export const NAVIGATION_LABELS = appContent.content.navigation
export const ADMIN_LABELS = appContent.content.admin
export const AUTH_LABELS = appContent.content.auth
export const CALENDAR_LABELS = appContent.content.calendar
export const VOTE_LABELS = appContent.content.vote
export const ROUTE_LABELS = appContent.content.route
export const LINE_STICKER_LABELS = appContent.content.lineSticker
export const DATE_LABELS = appContent.content.date
export const HOME_LABELS = appContent.content.home
export const CONFIRMATION_LABELS = appContent.content.confirmation
export const EVENT_LIST_LABELS = appContent.content.eventList
export const EVENT_LIST_ITEM_LABELS = appContent.content.eventListItem
export const GANTT_CHART_LABELS = appContent.content.ganttChart
export const BADGE_LABELS = appContent.content.badge
export const BADGE_RARITY_LABELS = appContent.content.badge.rarity as Record<
  'common' | 'rare' | 'epic' | 'legendary' | 'mythic',
  string
>
export const BADGE_TEMPLATES = appContent.content.badge.template
