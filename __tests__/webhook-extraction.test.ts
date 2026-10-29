import { expect, test } from 'bun:test'
import { extractWebhookEvents, webhookProcessingErrorCode } from '@api/services/webhook-extraction'
import type { TitleFetcher } from '@api/services/webhook-title'
import type { DetectPost } from '@biccame/shared/event-detect/post'

const env = {
  ANTHROPIC_BASE_URL: 'https://synthetic-model.example.test/',
  ANTHROPIC_AUTH_TOKEN: 'synthetic-private-token'
}
const post: DetectPost = {
  id: '2109221721773576490',
  text: '本日から限定名刺をどなたでも配布します。',
  screenName: 'bic_akiba',
  kind: 'original',
  createdAt: '2026-10-11T00:00:00Z',
  url: 'https://x.com/bic_akiba/status/2109221721773576490',
  media: []
}
const toolResponse = (input: unknown) => Response.json({ content: [{ type: 'tool_use', name: 'answer', input }] })
const validInput = { events: [{ item: '限定名刺', stores: ['akiba'], characterIds: [], evidence: [post.text] }] }

const cases: { name: string; code: string; fetcher: TitleFetcher }[] = [
  {
    name: 'HTTPのステータスだけを残す',
    code: 'extraction_http_401',
    fetcher: async () => new Response(`${env.ANTHROPIC_AUTH_TOKEN} ${post.text}`, { status: 401 })
  },
  {
    name: 'ネットワークの生の例外を捨てる',
    code: 'extraction_network_error',
    fetcher: async () => {
      throw new Error(`${env.ANTHROPIC_BASE_URL} ${env.ANTHROPIC_AUTH_TOKEN} ${post.text}`)
    }
  },
  {
    name: 'タイムアウトを区別する',
    code: 'extraction_timeout',
    fetcher: async () => {
      throw new DOMException(`${env.ANTHROPIC_AUTH_TOKEN} ${post.text}`, 'TimeoutError')
    }
  },
  {
    name: '不正JSONの応答本文を捨てる',
    code: 'extraction_invalid_response',
    fetcher: async () => new Response(`${env.ANTHROPIC_AUTH_TOKEN} ${post.text}`)
  },
  {
    name: '不正な応答形を区別する',
    code: 'extraction_invalid_response',
    fetcher: async () => Response.json({ error: env.ANTHROPIC_AUTH_TOKEN })
  },
  {
    name: '不正な候補を区別する',
    code: 'extraction_invalid_response',
    fetcher: async () => toolResponse({ events: 'invalid' })
  },
  {
    name: '根拠の創作を区別する',
    code: 'extraction_invalid_evidence',
    fetcher: async () =>
      toolResponse({ events: [{ item: '限定名刺', stores: [], characterIds: [], evidence: ['創作した条件'] }] })
  },
  {
    name: '対象外の店舗を区別する',
    code: 'extraction_invalid_store',
    fetcher: async () =>
      toolResponse({
        events: [{ item: '限定名刺', stores: ['synthetic-invalid-store'], characterIds: [], evidence: [post.text] }]
      })
  },
  {
    name: '複数ツールの応答は再試行しない',
    code: 'extraction_invalid_response',
    fetcher: async () =>
      Response.json({
        content: [
          { type: 'tool_use', name: 'answer', input: validInput },
          { type: 'tool_use', name: 'answer', input: validInput }
        ]
      })
  },
  {
    name: '異なるツールの応答は再試行しない',
    code: 'extraction_invalid_response',
    fetcher: async () => Response.json({ content: [{ type: 'tool_use', name: 'other', input: validInput }] })
  }
]

for (const scenario of cases) {
  test(`抽出失敗: ${scenario.name}`, async () => {
    const calls: string[] = []
    try {
      await extractWebhookEvents(env, post, async (url, init) => {
        calls.push(url)
        return scenario.fetcher(url, init)
      })
      throw new Error('Expected extraction failure')
    } catch (error) {
      const code = webhookProcessingErrorCode(error)
      expect(code).toBe(scenario.code)
      expect(code).not.toContain(env.ANTHROPIC_AUTH_TOKEN)
      expect(code).not.toContain(env.ANTHROPIC_BASE_URL)
      expect(code).not.toContain(post.text)
    }
    expect(calls).toHaveLength(1)
  })
}

test('同じ原文範囲の完全重複は通信を増やさず1候補に戻す', async () => {
  const calls: string[] = []
  const extracted = await extractWebhookEvents(env, post, async (url) => {
    calls.push(url)
    return toolResponse({ events: [validInput.events[0], validInput.events[0]] })
  })
  expect(extracted).toEqual(validInput)
  expect(calls).toHaveLength(1)
})

test('片方の設定だけ欠けても通信せず安全なコードを返す', async () => {
  const calls: string[] = []
  for (const config of [
    { ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL },
    { ANTHROPIC_AUTH_TOKEN: env.ANTHROPIC_AUTH_TOKEN }
  ]) {
    await expect(
      extractWebhookEvents(config, post, async (url) => {
        calls.push(url)
        return toolResponse(validInput)
      })
    ).rejects.toThrow('extraction_not_configured')
  }
  expect(calls).toHaveLength(0)
})

test('autoのツール未呼び出しは1回だけ追加して回復する', async () => {
  const calls: string[] = []
  const extracted = await extractWebhookEvents(env, post, async (url, init) => {
    calls.push(url)
    expect(JSON.parse(String(init.body)).tool_choice).toEqual({ type: 'auto' })
    return calls.length === 1
      ? Response.json({ content: [{ type: 'text', text: 'Try again' }] })
      : toolResponse(validInput)
  })
  expect(calls).toHaveLength(2)
  expect(extracted).toEqual(validInput)
})

test('ツール未呼び出しが続いても2回で停止する', async () => {
  const calls: string[] = []
  await expect(
    extractWebhookEvents(env, post, async (url) => {
      calls.push(url)
      return Response.json({ content: [{ type: 'text', text: `${env.ANTHROPIC_AUTH_TOKEN} ${post.text}` }] })
    })
  ).rejects.toThrow('extraction_missing_tool_result')
  expect(calls).toHaveLength(2)
})

test('ツール未呼び出し後のHTTP失敗はさらに再試行しない', async () => {
  const calls: string[] = []
  await expect(
    extractWebhookEvents(env, post, async (url) => {
      calls.push(url)
      return calls.length === 1 ? Response.json({ content: [] }) : new Response('Unavailable', { status: 503 })
    })
  ).rejects.toThrow('extraction_http_503')
  expect(calls).toHaveLength(2)
})

test('未知の例外メッセージと偽装したエラーコードは公開しない', () => {
  // 旧: どちらも 'processing_failed' と完全一致。新: 接頭辞・段階（unknown）・例外名（Error）だけで、メッセージやコードは含めない。
  const fromMessage = webhookProcessingErrorCode(new Error(`${env.ANTHROPIC_AUTH_TOKEN} ${post.text}`))
  const fromForgedCode = webhookProcessingErrorCode({ code: env.ANTHROPIC_AUTH_TOKEN })
  expect(fromMessage).toBe('processing_failed:unknown:Error')
  expect(fromForgedCode).toBe('processing_failed:unknown:Error')
  for (const code of [fromMessage, fromForgedCode]) {
    expect(code).not.toContain(env.ANTHROPIC_AUTH_TOKEN)
    expect(code).not.toContain(post.text)
  }
})
