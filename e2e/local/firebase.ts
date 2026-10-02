import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
// Test-only alias: the real SDK uses the same demo project as the verifier.
export const firebaseApp = initializeApp({ apiKey: 'demo-key', projectId: 'demo-ui-ux', authDomain: 'localhost' })
export const auth = getAuth(firebaseApp)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
