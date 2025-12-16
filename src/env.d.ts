declare const __APP_VERSION__: string
declare const __GIT_HASH__: string

// Google Maps API環境変数
interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
