export type TwitterHealthFailureKind =
  | 'missing_credentials'
  | 'authentication'
  | 'authorization'
  | 'account_mismatch'
  | 'signature'
  | 'rate_limit'
  | 'network'
  | 'upstream'
  | 'unexpected_response'

const FAILURE_MESSAGES: Record<TwitterHealthFailureKind, string> = {
  missing_credentials: 'X連携のCookie設定が不足しています。',
  authentication: 'X連携の認証が無効です。Cookieを再設定してください。',
  authorization: 'Xがアクセスを拒否しました。アカウントの制限状態を確認してください。',
  account_mismatch: 'X連携が投稿用アカウントと一致しません。Cookieを確認してください。',
  signature: 'Xの署名取得・生成に失敗しました。署名処理を確認してください。',
  rate_limit: 'Xのレート制限に達しました。時間を置いて確認してください。',
  network: 'Xへの通信に失敗しました。通信状態を確認してください。',
  upstream: 'X側のサービス障害が発生しています。',
  unexpected_response: 'Xの応答形式を確認できません。読取APIの仕様を確認してください。'
}

/** 外部のエラー文字列・レスポンス・Cookieを通知やログに持ち込まない。 */
export class TwitterHealthError extends Error {
  constructor(
    readonly kind: TwitterHealthFailureKind,
    readonly status?: number
  ) {
    super(FAILURE_MESSAGES[kind])
    this.name = 'TwitterHealthError'
  }
}

export const normalizeTwitterHealthError = (error: unknown): TwitterHealthError =>
  error instanceof TwitterHealthError ? error : new TwitterHealthError('unexpected_response')
