import { atom } from 'jotai'

// Prevent preview votes from persisting to the application's localStorage key.
export const lastVoteTimesAtom = atom<Record<string, string>>({})
