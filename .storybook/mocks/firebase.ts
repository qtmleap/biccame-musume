import type { User } from 'firebase/auth'
import { runtime } from '../catalogue/runtime'

const listeners = new Set<(user: User | null) => void>()
export const fixtureUser = {
  uid: 'storybook-user',
  email: 'storybook@example.invalid',
  displayName: '合成ユーザー',
  photoURL: null,
  phoneNumber: null,
  emailVerified: true,
  isAnonymous: false,
  providerData: [],
  metadata: { creationTime: '2026-09-01', lastSignInTime: '2026-10-02' },
  tenantId: null,
  providerId: 'storybook',
  refreshToken: 'synthetic-token',
  getIdToken: async () => 'storybook-synthetic-token',
  getIdTokenResult: async () => ({
    token: 'storybook-synthetic-token',
    claims: {},
    authTime: '',
    issuedAtTime: '',
    expirationTime: '',
    signInProvider: null,
    signInSecondFactor: null
  }),
  reload: async () => {},
  delete: async () => {},
  toJSON: () => ({ uid: 'storybook-user' })
} satisfies User
export const auth = {
  get currentUser() {
    return runtime.authenticated ? fixtureUser : null
  },
  onAuthStateChanged(callback: (user: User | null) => void) {
    listeners.add(callback)
    queueMicrotask(() => callback(auth.currentUser))
    return () => {
      listeners.delete(callback)
    }
  }
}
export const firebaseApp = { name: 'storybook-boundary' }
export const onAuthStateChanged = (_auth: unknown, callback: (user: User | null) => void) =>
  auth.onAuthStateChanged(callback)
export const getRedirectResult = async (_auth: unknown) => null
export const signOut = async (_auth: unknown) => {
  runtime.authenticated = false
  for (const callback of listeners) callback(null)
}
const signIn = async () => {
  runtime.authenticated = true
  for (const callback of listeners) callback(fixtureUser)
  return { user: fixtureUser }
}
export const signInWithEmailAndPassword = async (_auth: unknown, _email: string, _password: string) => signIn()
export const createUserWithEmailAndPassword = async (_auth: unknown, _email: string, _password: string) => signIn()
export const signInWithRedirect = async (_auth: unknown, _provider: unknown) => signIn()
export class TwitterAuthProvider {}
export class GoogleAuthProvider {}
export class GithubAuthProvider {}
export class OAuthProvider {
  constructor(public providerId: string) {}
}
