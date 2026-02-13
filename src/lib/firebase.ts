import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth'

/**
 * Firebase設定
 */
const firebaseConfig = {
  apiKey: 'AIzaSyDhN2ya6f5kVz_ik881-v4EX-uHX70b8Tg',
  authDomain: 'dev.biccame-musume.com',
  projectId: 'biccame-musume',
  storageBucket: 'biccame-musume.firebasestorage.app',
  messagingSenderId: '511011902152',
  appId: '1:511011902152:web:6479a3d3fdbf40a2f40bfd',
  measurementId: 'G-YM8ZM9P2PF'
}

/**
 * Firebaseアプリインスタンス
 */
export const firebaseApp = initializeApp(firebaseConfig)

/**
 * Firebase Authインスタンス
 */
export const auth = getAuth(firebaseApp)

/**
 * 認証状態の永続化をLocalStorageに設定
 */
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('Failed to set persistence:', error)
})

/**
 * 開発環境ではAuthエミュレーターに接続
 */
let emulatorConnected = false
if (import.meta.env.DEV && !emulatorConnected) {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
    emulatorConnected = true
    console.log('Connected to Firebase Auth Emulator at http://localhost:9099')
  } catch (error) {
    console.error('Failed to connect to Firebase Auth Emulator:', error)
  }
}
