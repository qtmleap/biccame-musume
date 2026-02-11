import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'

/**
 * Firebase設定
 */
const firebaseConfig = {
  apiKey: 'AIzaSyCpmaR3ketnQvCavG4XeInu_5zIdpfXRHM',
  authDomain: 'bicamemusume.firebaseapp.com',
  projectId: 'bicamemusume',
  storageBucket: 'bicamemusume.firebasestorage.app',
  messagingSenderId: '897152519282',
  appId: '1:897152519282:web:6539fdbc1a7dc64d1206eb',
  measurementId: 'G-HB1DXZBJGS'
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
