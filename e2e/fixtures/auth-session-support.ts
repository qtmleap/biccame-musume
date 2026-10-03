import type { Page } from '@playwright/test'

// Only Firebase's external SDK boundary is replaced; hooks and AuthProvider remain real.
export const firebaseStub = `
export const auth = globalThis.__testFirebaseAuth ??= { currentUser: null, listeners: new Set() };
export const getRedirectResult = async () => null;
export const onAuthStateChanged = (_, callback) => {
  auth.listeners.add(callback); queueMicrotask(() => callback(auth.currentUser));
  return () => auth.listeners.delete(callback);
};
auth.onAuthStateChanged = (callback, error) => onAuthStateChanged(auth, callback, error);
export const signInWithEmailAndPassword = async (_, uid) => {
  auth.currentUser = { uid, email: uid, getIdToken: async () => uid };
  for (const callback of auth.listeners) callback(auth.currentUser);
  return { user: auth.currentUser };
};
export const signOut = async () => {
  auth.currentUser = null;
  for (const callback of auth.listeners) callback(null);
};
export const createUserWithEmailAndPassword = signInWithEmailAndPassword;
export const signInWithRedirect = async () => {};
export class GithubAuthProvider {};
export class GoogleAuthProvider {};
export class OAuthProvider {};
export class TwitterAuthProvider {};
`

export const prepare = async (page: Page, failLogout = false) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.host !== 'localhost:15300') return route.abort()
    if (['/src/lib/firebase.ts', '/workers/app/src/lib/firebase.ts'].includes(url.pathname)) {
      return route.fulfill({
        contentType: 'text/javascript',
        body: "export { auth } from '/node_modules/.vite/deps/firebase_auth.js';"
      })
    }
    if (url.pathname.endsWith('/firebase_auth.js'))
      return route.fulfill({ contentType: 'text/javascript', body: firebaseStub })
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (url.pathname === '/api/auth/logout') {
      return route.fulfill({ status: failLogout ? 503 : 200, json: { success: !failLogout } })
    }
    if (url.pathname === '/api/auth') return route.fulfill({ json: { success: true } })
    const uid = await page.getByTestId('current-user').textContent()
    const value = uid === 'account-a' ? 'account-a' : 'account-b'
    if (url.pathname.endsWith('/favorites')) return route.fulfill({ json: { favorites: [value] } })
    if (url.pathname.endsWith('/activities'))
      return route.fulfill({ json: { stores: [value], events: { interested: [], completed: [] } } })
    if (url.pathname === '/api/users/me/badges')
      return route.fulfill({ json: { earned: [{ code: value, earnedAt: '2026-10-02T00:00:00.000Z' }] } })
    if (url.pathname === '/api/badges') return route.fulfill({ json: { badges: [] } })
    return route.fulfill({ status: 404, json: { message: 'Unstubbed API request' } })
  })
  await page.goto('/e2e/fixtures/auth-session.html')
}
