type ModerationResult = {
  safe: boolean
  categories?: string[]
}

/**
 * Workers AI Llama Guard 3 8B でテキストをモデレーションする
 * @param text 検査するテキスト
 * @param ai Workers AI バインディング
 * @param env 環境変数（ENVIRONMENT === 'local' のとき bypass）
 */
export const moderateText = async (text: string, ai: Ai, env?: { ENVIRONMENT?: string }): Promise<ModerationResult> => {
  if (env?.ENVIRONMENT === 'local') {
    console.debug('[Moderation] local environment detected, bypassing moderation.')
    return { safe: true }
  }

  try {
    const result = await ai.run('@cf/meta/llama-guard-3-8b', {
      messages: [{ role: 'user', content: text }]
    })

    const response = (result as { response?: string }).response ?? ''

    if (!response.startsWith('unsafe')) {
      return { safe: true }
    }

    const lines = response.split('\n')
    const categoryLine = lines[1]?.trim() ?? ''
    const categories = categoryLine.length > 0 ? categoryLine.split(',').map((c) => c.trim()) : []

    return { safe: false, categories }
  } catch (err) {
    console.error('[Moderation] AI call failed, allowing through:', err)
    return { safe: true }
  }
}
