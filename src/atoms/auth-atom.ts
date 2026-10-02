import type { User } from 'firebase/auth'
import { atom } from 'jotai'

export const userAtom = atom<User | null>(null)

export type BackendSessionState =
  | { status: 'idle' | 'pending' }
  | { status: 'ready'; uid: string }
  | { status: 'error'; message: string }

export const backendSessionStateAtom = atom<BackendSessionState>({ status: 'idle' })
// Invalidates requests on account changes, retries and provider cleanup.
export const backendSessionGenerationAtom = atom(0)
export const backendSessionReadyAtom = atom((get) => {
  const session = get(backendSessionStateAtom)
  return session.status === 'ready' && session.uid === get(userAtom)?.uid
})
