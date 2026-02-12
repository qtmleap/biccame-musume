declare const __APP_VERSION__: string
declare const __GIT_HASH__: string

/// <reference types="vite-plugin-pwa/client" />

// 環境変数
interface ImportMetaEnv {
  // Google Maps
  readonly VITE_GOOGLE_MAPS_API_KEY: string
  // Firebase
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
