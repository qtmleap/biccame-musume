import { expect, test } from 'bun:test'
import type { User } from 'firebase/auth'
import { createStore } from 'jotai'
import * as authAtoms from '../../workers/app/src/atoms/auth-atom'

const stateAtom = authAtoms.backendSessionStateAtom

test('readiness is derived from a ready session for the current UID', () => {
  const store = createStore()
  store.set(authAtoms.userAtom, { uid: 'account-a' } as User)
  store.set(stateAtom, { status: 'ready', uid: 'account-a' })
  expect(store.get(authAtoms.backendSessionReadyAtom)).toBe(true)
  store.set(authAtoms.userAtom, { uid: 'account-b' } as User)
  expect(store.get(authAtoms.backendSessionReadyAtom)).toBe(false)
})

test('backend_auth_failure_shows_retry state replaces pending without granting access', () => {
  const store = createStore()
  store.set(authAtoms.userAtom, { uid: 'account-a' } as User)
  store.set(stateAtom, { status: 'ready', uid: 'account-a' })
  expect(store.get(authAtoms.backendSessionReadyAtom)).toBe(true)
  for (const state of [
    { status: 'pending' },
    { status: 'error', message: '認証に失敗しました' },
    { status: 'idle' }
  ] as const) {
    store.set(stateAtom, state)
    expect(store.get(authAtoms.backendSessionReadyAtom)).toBe(false)
  }
})
