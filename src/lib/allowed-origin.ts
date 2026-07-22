import type { Bindings } from '@/types/bindings'

const LOCALHOST_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

/**
 * CSRF ミドルウェアの origin 検証に使う許可判定。
 *
 * - `env.ORIGIN_ALLOWLIST`（カンマ区切りの絶対オリジン）に含まれていれば許可
 * - `env.ENVIRONMENT === 'local'` かつ `http://localhost:*` / `http://127.0.0.1:*` なら許可
 * - それ以外は不許可（origin が undefined の場合も不許可。CSRF ミドルウェア側で
 *   Sec-Fetch-Site による same-origin 判定が別途行われるため安全）
 */
export const isAllowedOrigin = (origin: string | undefined, env: Bindings): boolean => {
  if (!origin) {
    return false
  }

  const allowlist = (env.ORIGIN_ALLOWLIST ? env.ORIGIN_ALLOWLIST : '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  if (allowlist.includes(origin)) {
    return true
  }

  if (env.ENVIRONMENT === 'local' && LOCALHOST_ORIGIN_RE.test(origin)) {
    return true
  }

  return false
}
