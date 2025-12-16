import { atomWithStorage } from 'jotai/utils'

export type SortType = 'character_birthday' | 'store_birthday' | 'upcoming_birthday'

/**
 * ソート順を保存するatom
 * localStorageに永続化される
 */
export const sortTypeAtom = atomWithStorage<SortType>('biccame-sort-type', 'character_birthday')
