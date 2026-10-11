import { atomWithStorage, createJSONStorage } from 'jotai/utils'
import { DEFAULT_EVENT_LIST_FILTERS, type EventListFilters, EventListFiltersSchema } from '@/schemas/event-search'

const KEY = 'event-list-filters'

const raw = createJSONStorage<unknown>()
// 項目ごとに検証し、壊れた項目だけ既定へ戻す(全体が壊れていれば既定にする)。
const parseStored = (value: unknown, initialValue: EventListFilters) => {
  const result = EventListFiltersSchema.safeParse(value)
  return result.success ? result.data : initialValue
}

// jotai は SyncStorage 型を公開していないので、createJSONStorage の戻り値から導く。
// unstable_withStorageValidator は型ガードで値を変換できず、壊れた項目だけ戻せないので使わない。
type FiltersStorage = ReturnType<typeof createJSONStorage<EventListFilters>>
const storage: FiltersStorage = {
  ...raw,
  getItem: (key, initialValue) => parseStored(raw.getItem(key, null), initialValue),
  // 別タブの書き込みも同じ検証を通す。
  subscribe: (key, callback, initialValue) =>
    raw.subscribe?.(key, (value) => callback(parseStored(value, initialValue)), initialValue)
}

/**
 * 公開イベント一覧の絞り込みの保存値
 * URL に絞り込みのパラメータが無いときに、まるごと使う。ページ(page)は保存しない。
 */
export const eventListFiltersAtom = atomWithStorage<EventListFilters>(KEY, DEFAULT_EVENT_LIST_FILTERS, storage, {
  getOnInit: true
})
