import { atomWithStorage } from 'jotai/utils'

/**
 * イベント一覧の表示モード
 * gantt: ガントチャート表示
 * grid: グリッド表示
 */
export const eventViewModeAtom = atomWithStorage<'gantt' | 'grid'>('event-view-mode', 'gantt')
