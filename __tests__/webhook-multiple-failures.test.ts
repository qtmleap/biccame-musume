import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { webhookProcessingErrorCode } from '@api/services/webhook-extraction'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { handleWebhookQueue, processWebhookJob } from '@api/services/webhook-process'
import type { TitleFetcher } from '@api/services/webhook-title'
import dayjs from 'dayjs'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

// 1 投稿に複数の配布物があっても、候補ごとに別の item で題を付けさせる（同じ本文で区別できないまま同じ題にならない）。
test('複数の配布物の候補ごとに、その配布物の名前を渡して別々の題を付ける（保留になる候補にも付く）', async () => {
  const { cleanup, env } = await fixture('multiple-giveaway-titles')
  const delivery = spyOn(discord, 'notifyEventDetection').mockImplementation(async () => ({
    status: 'sent',
    messageId: '1234567890'
  }))
  try {
    await migrate(env.DB)
    const configured = Object.assign(env, {
      ANTHROPIC_BASE_URL: 'https://anthropic.example.test',
      ANTHROPIC_AUTH_TOKEN: 'test-token-not-a-secret'
    })
    // 題の通信は titleFetcher のモック。user メッセージの 1 行目（配布物の名前）で返す題を変える
    const requested: string[] = []
    const titleFetcher: TitleFetcher = async (_url, init) => {
      const body: unknown = JSON.parse(String(init.body))
      if (typeof body !== 'object' || body === null) throw new Error('Unexpected title request body')
      const messages: unknown = Reflect.get(body, 'messages')
      const content: unknown = Array.isArray(messages) ? Reflect.get(messages[0], 'content') : undefined
      if (typeof content !== 'string') throw new Error('Unexpected title request content')
      const head = content.split('\n')[0]
      requested.push(head)
      const title = head.endsWith('赤い限定名刺') ? '赤名刺' : '青名刺'
      return Response.json({ content: [{ type: 'tool_use', name: 'answer', input: { title } }] })
    }
    const red = '本日から赤い限定名刺をどなたでも配布します。'
    const blue = '本日から青い限定名刺をどなたでも配布します。'
    const extractor = async () => ({
      events: [
        { item: '赤い限定名刺', stores: ['akiba'], characterIds: [], evidence: [red] },
        { item: '青い限定名刺', stores: ['akiba'], characterIds: [], evidence: [blue] }
      ]
    })
    const post = makePost('2109221721773576390', `${red}\n${blue}`)
    await insertWebhookJob(configured, post)
    await processWebhookJob(configured, post.id, { extractor, titleFetcher })
    const saved = await getWebhookJob(configured, post.id)
    // 候補ごとに別の item を渡し、候補ごとに別の題が付いて登録される
    expect(requested).toHaveLength(2)
    expect(requested[0]).toEndWith(': 赤い限定名刺')
    expect(requested[1]).toEndWith(': 青い限定名刺')
    expect(saved.candidates.map((candidate) => candidate.candidate?.title)).toEqual(['赤名刺', '青名刺'])
    expect(saved.candidates.map((candidate) => candidate.eventTitle)).toEqual(['赤名刺', '青名刺'])
    expect(saved.candidates.map((candidate) => candidate.item)).toEqual(['赤い限定名刺', '青い限定名刺'])
    for (const candidate of saved.candidates) expect(candidate.reasons).toContain('title_generated')
    // 同じ内容の別投稿は重複で保留になるが、保留の候補にも配布物ごとの題が付く（イベントは増えない）
    const duplicate = makePost('2109221721773576391', post.text)
    await insertWebhookJob(configured, duplicate)
    await processWebhookJob(configured, duplicate.id, { extractor, titleFetcher })
    const held = await getWebhookJob(configured, duplicate.id)
    expect(held.candidates.map((candidate) => candidate.status)).toEqual(['held', 'held'])
    expect(held.candidates.map((candidate) => candidate.candidate?.title)).toEqual(['赤名刺', '青名刺'])
    for (const candidate of held.candidates) {
      expect(candidate.eventTitle).toBeNull()
      expect(candidate.reasons).toContain('title_generated')
    }
    expect(requested).toHaveLength(4)
    expect(requested[2]).toEndWith(': 赤い限定名刺')
    expect(requested[3]).toEndWith(': 青い限定名刺')
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(2)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

// 原文は投稿として保持するが、失敗理由には秘密や通信先・応答本文を含めない。
test('抽出失敗コードをジョブへ保存し、未知例外は汎用コードのままにする', async () => {
  const { cleanup, env, calls } = await fixture('giveaway-extraction-error-codes')
  const configured = {
    ...env,
    ANTHROPIC_BASE_URL: 'https://synthetic-private-model.example.test',
    ANTHROPIC_AUTH_TOKEN: 'synthetic-private-token'
  }
  const failures: { code: string; fetcher: TitleFetcher }[] = [
    {
      code: 'extraction_http_403',
      fetcher: async () => new Response(configured.ANTHROPIC_AUTH_TOKEN, { status: 403 })
    },
    {
      code: 'extraction_timeout',
      fetcher: async () => {
        throw new DOMException(configured.ANTHROPIC_AUTH_TOKEN, 'TimeoutError')
      }
    },
    {
      code: 'extraction_network_error',
      fetcher: async () => {
        throw new Error(configured.ANTHROPIC_BASE_URL)
      }
    },
    {
      code: 'extraction_invalid_response',
      fetcher: async () => new Response(configured.ANTHROPIC_AUTH_TOKEN)
    },
    {
      code: 'extraction_missing_tool_result',
      fetcher: async () => Response.json({ content: [{ type: 'text', text: configured.ANTHROPIC_AUTH_TOKEN }] })
    },
    {
      code: 'extraction_invalid_evidence',
      fetcher: async () =>
        Response.json({
          content: [
            {
              type: 'tool_use',
              name: 'answer',
              input: { events: [{ item: '限定名刺', stores: ['akiba'], characterIds: [], evidence: ['創作した条件'] }] }
            }
          ]
        })
    },
    {
      code: 'extraction_invalid_store',
      fetcher: async () =>
        Response.json({
          content: [
            {
              type: 'tool_use',
              name: 'answer',
              input: {
                events: [
                  {
                    item: '限定名刺',
                    stores: ['synthetic-invalid-store'],
                    characterIds: [],
                    evidence: ['限定名刺を配布します。']
                  }
                ]
              }
            }
          ]
        })
    },
    {
      code: 'extraction_invalid_response',
      fetcher: async () =>
        Response.json({
          content: [
            {
              type: 'tool_use',
              name: 'answer',
              input: {
                events: [
                  {
                    item: '限定名刺',
                    stores: ['akiba'],
                    characterIds: ['invented'],
                    evidence: ['限定名刺を配布します。']
                  }
                ]
              }
            }
          ]
        })
    }
  ]
  try {
    await migrate(env.DB)
    for (const [index, failure] of failures.entries()) {
      const post = makePost(String(2109221721773576450n + BigInt(index)), '限定名刺を配布します。')
      await insertWebhookJob(env, post)
      await expect(processWebhookJob(configured, post.id, { extractionFetcher: failure.fetcher })).rejects.toThrow()
      const saved = await getWebhookJob(env, post.id)
      expect(saved.lastError).toBe(failure.code)
      expect(saved.status).toBe('failed')
      expect(saved.model).toBeNull()
      expect(saved.candidates).toEqual([])
      expect(saved.lastError).not.toContain(configured.ANTHROPIC_AUTH_TOKEN)
      expect(saved.lastError).not.toContain(configured.ANTHROPIC_BASE_URL)
      expect(saved.lastError).not.toContain(post.text)
    }
    const unknown = makePost('2109221721773576460', '限定名刺を配布します。')
    await insertWebhookJob(env, unknown)
    await expect(
      processWebhookJob(env, unknown.id, {
        extractor: async () => {
          throw new Error(configured.ANTHROPIC_AUTH_TOKEN)
        }
      })
    ).rejects.toThrow()
    expect((await getWebhookJob(env, unknown.id)).lastError).toBe('processing_failed')
    expect(webhookProcessingErrorCode(new Error(configured.ANTHROPIC_AUTH_TOKEN))).toBe('processing_failed')
    expect(calls).toHaveLength(0)
  } finally {
    await cleanup()
  }
}, 60000)

test('キューログは未設定の安全なコードだけを出し、失敗は再試行する', async () => {
  const { cleanup, env } = await fixture('giveaway-extraction-queue-errors')
  const log = spyOn(console, 'error').mockImplementation(() => {})
  const retries: number[] = []
  const acknowledgements: string[] = []
  try {
    await migrate(env.DB)
    const post = makePost('2109221721773576461', '限定名刺を配布します。')
    await insertWebhookJob(env, post)
    await handleWebhookQueue(
      {
        queue: 'biccame-event-detection-local',
        metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } },
        messages: [
          {
            id: 'synthetic-message',
            timestamp: dayjs().toDate(),
            attempts: 1,
            body: { postId: post.id },
            ack: () => {
              acknowledgements.push('ack')
            },
            retry: (options) => {
              if (options?.delaySeconds !== undefined) retries.push(options.delaySeconds)
            }
          }
        ],
        ackAll: () => {},
        retryAll: () => {}
      },
      env
    )
    expect(log.mock.calls).toEqual([['[webhook-queue] processing failed: extraction_not_configured']])
    expect(retries).toEqual([60])
    expect(acknowledgements).toEqual([])
    expect((await getWebhookJob(env, post.id)).lastError).toBe('extraction_not_configured')
  } finally {
    log.mockRestore()
    await cleanup()
  }
}, 60000)
