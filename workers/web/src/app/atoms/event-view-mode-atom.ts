import { atomWithStorage, createJSONStorage, unstable_withStorageValidator } from 'jotai/utils'

export type EventViewMode = 'gantt' | 'grid'
// null は未選択。画面幅による初期表示をユーザーの選択として保存しない。
const storage = unstable_withStorageValidator(
  (value: unknown): value is EventViewMode | null => value === null || value === 'grid' || value === 'gantt'
)(createJSONStorage<unknown>())
export const eventViewModeAtom = atomWithStorage<EventViewMode | null>('event-view-mode', null, storage, {
  getOnInit: true
})
