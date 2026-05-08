/**
 * Cloudflare Turnstile トークン検証
 * @param token フロントエンドから受け取ったTurnstileトークン
 * @param secret TURNSTILE_SECRET_KEY
 * @param ip クライアントIPアドレス
 * @param env 環境変数（ENVIRONMENT === 'local' のとき bypass）
 */
export const verifyTurnstileToken = async (
  token: string,
  secret: string,
  ip: string,
  env?: { ENVIRONMENT?: string }
): Promise<boolean> => {
  if (env?.ENVIRONMENT === 'local') {
    console.debug('[Turnstile] local environment detected, bypassing verification.')
    return true
  }

  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: ip
  })

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })

  const data = await res.json<{ success: boolean }>()
  return data.success
}
