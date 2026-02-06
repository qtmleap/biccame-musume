import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

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
