import { expect, spyOn, test } from 'bun:test'
import * as webhookJobs from '@api/services/webhook-jobs'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { handleWebhookQueue, processWebhookJob } from '@api/services/webhook-process'
import { DetectionTimeoutError } from '@api/services/webhook-processing-context'
import * as webhookPrompt from '@api/services/webhook-prompt'
import { webhookExceptionName } from '@biccame/shared/domain/webhook-failure'
import dayjs from 'dayjs'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

// 抽出系以外の例外は、last_error に processing_failed:<段階>:<例外名> だけを残す（メッセージ・スタック・本文・接続先・トークンは残さない）。
// 抽出系の固有コード（extraction_*）は webhook-multiple-failures.test.ts / webhook-extraction.test.ts が従来どおり検査している。
const SECRET = 'synthetic-private-token https://synthetic-private-model.example.test'
const POST_TEXT = '限定名刺を配布します。'
const extractor = async () => ({
  events: [{ item: '限定名刺', stores: ['akiba'], characterIds: [], evidence: [POST_TEXT] }]
})

/** 名前を指定した例外。メッセージには秘密と本文を入れておき、どこにも漏れないことを確かめる。 */
const namedFailure = (name: string) => Object.assign(new Error(`${SECRET} ${POST_TEXT}`), { name })

const expectNoLeak = (value: string | null) => {
  expect(value).not.toBeNull()
  expect(value).not.toContain('synthetic-private')
  expect(value).not.toContain('example.test')
  expect(value).not.toContain(POST_TEXT)
  expect(value).not.toContain('Synthetic candidate failure')
}

test('例外名はサニタイズして残す。形に合わない名前と 61 文字以上は Error、60 文字までは残る。メッセージは残らない', async () => {
  const { cleanup, env } = await fixture('failure-stage-names')
  try {
    await migrate(env.DB)
    const cases: [string, string][] = [
      ['SyntheticFailure', 'SyntheticFailure'],
      ['Custom_Failure.v2$x-1', 'Custom_Failure.v2$x-1'],
      ['A'.repeat(60), 'A'.repeat(60)],
      ['A'.repeat(61), 'Error'],
      ['has space', 'Error'],
      ['token:abc', 'Error'],
      ['secret=value/path', 'Error'],
      ['日本語の名前', 'Error'],
      ['', 'Error']
    ]
    for (const [index, [name, expected]] of cases.entries()) {
      const post = makePost(String(2109221721773577000n + BigInt(index)), POST_TEXT)
      await insertWebhookJob(env, post)
      await expect(
        processWebhookJob(env, post.id, {
          extractor: async () => {
            throw namedFailure(name)
          }
        })
      ).rejects.toThrow()
      const saved = await getWebhookJob(env, post.id)
      expect(saved.status, name).toBe('failed')
      expect(saved.lastError, name).toBe(`processing_failed:extraction:${expected}`)
      expectNoLeak(saved.lastError)
    }
  } finally {
    await cleanup()
  }
}, 60000)

test('Clef の判定が失敗したら、候補と親ジョブの両方に processing_failed:detection:Error が残り、メッセージは残らない', async () => {
  const { cleanup, env, state } = await fixture('failure-stage-detection')
  try {
    await migrate(env.DB)
    state.fail = '限定名刺'
    const post = makePost('2109221721773577100', POST_TEXT)
    await insertWebhookJob(env, post)
    await expect(processWebhookJob(env, post.id, { extractor })).rejects.toThrow('Synthetic candidate failure')
    const saved = await getWebhookJob(env, post.id)
    expect(saved.status).toBe('failed')
    expect(saved.lastError).toBe('processing_failed:detection:Error')
    expect(saved.candidates.map((candidate) => candidate.status)).toEqual(['failed'])
    expect(saved.candidates.map((candidate) => candidate.lastError)).toEqual(['processing_failed:detection:Error'])
    expectNoLeak(saved.lastError)
  } finally {
    await cleanup()
  }
}, 60000)

test('送信入力の保存で失敗したら prompt_save。外側の段階（item_count / detection）より内側の段階が残る', async () => {
  const { cleanup, env } = await fixture('failure-stage-prompt-save')
  const save = spyOn(webhookPrompt, 'saveWebhookPromptAttempt').mockImplementation(async () => {
    throw new TypeError(`${SECRET} ${POST_TEXT}`)
  })
  try {
    await migrate(env.DB)
    const post = makePost('2109221721773577200', POST_TEXT)
    await insertWebhookJob(env, post)
    await expect(processWebhookJob(env, post.id, { extractor })).rejects.toThrow()
    const saved = await getWebhookJob(env, post.id)
    expect(saved.status).toBe('failed')
    expect(saved.lastError).toBe('processing_failed:prompt_save:TypeError')
    expectNoLeak(saved.lastError)
    expect(save).toHaveBeenCalled()
  } finally {
    save.mockRestore()
    await cleanup()
  }
}, 60000)

test('保存済みの抽出が壊れていて候補を作れないなど、段階が付いていない親ジョブの失敗は job', async () => {
  const { cleanup, env } = await fixture('failure-stage-job')
  try {
    await migrate(env.DB)
    const post = makePost('2109221721773577300', POST_TEXT)
    await insertWebhookJob(env, post)
    await env.DB.prepare('UPDATE webhook_event_jobs SET extraction_json=\'{"version":"broken"}\' WHERE post_id=?')
      .bind(post.id)
      .run()
    await expect(processWebhookJob(env, post.id, { extractor })).rejects.toThrow('Invalid saved extraction review')
    const saved = await getWebhookJob(env, post.id)
    expect(saved.status).toBe('failed')
    expect(saved.lastError).toBe('processing_failed:job:Error')
    expectNoLeak(saved.lastError)
  } finally {
    await cleanup()
  }
}, 60000)

test('キューのログは新しいコードだけを英語で出し、リースを取る前の失敗は claim になる（DB の last_error には書けない）', async () => {
  const { cleanup, env } = await fixture('failure-stage-queue-log')
  const log = spyOn(console, 'error').mockImplementation(() => {})
  const claim = spyOn(webhookJobs, 'claimWebhookJob').mockImplementation(async () => {
    throw new TypeError(`${SECRET} ${POST_TEXT}`)
  })
  const retries: number[] = []
  const acknowledgements: string[] = []
  try {
    await migrate(env.DB)
    const post = makePost('2109221721773577400', POST_TEXT)
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
    expect(log.mock.calls).toEqual([['[webhook-queue] processing failed: processing_failed:claim:TypeError']])
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-private')
    expect(JSON.stringify(log.mock.calls)).not.toContain(POST_TEXT)
    expect(retries).toEqual([60])
    expect(acknowledgements).toEqual([])
    // リースを取れていないので、ジョブの行には何も書かない（queued のまま、エラーなし）。
    expect(await getWebhookJob(env, post.id)).toMatchObject({ status: 'queued', lastError: null })
  } finally {
    claim.mockRestore()
    log.mockRestore()
    await cleanup()
  }
}, 60000)

test('判定の制限時間切れは DetectionTimeoutError という名前で残り、他の失敗と区別できる。メッセージは残らない', () => {
  const error = new DetectionTimeoutError()
  expect(webhookExceptionName(error)).toBe('DetectionTimeoutError')
  expect(error.message).toBe('Detection timed out')
  expect(webhookExceptionName(error)).not.toContain('timed out')
})

test('再試行を使い切った（DLQ）とき、残っている失敗の原因は消さず、原因が無い行だけ retry_exhausted にする', async () => {
  const { cleanup, env } = await fixture('failure-stage-dlq')
  const acknowledgements: string[] = []
  try {
    await migrate(env.DB)
    const withCause = makePost('2109221721773577500', POST_TEXT)
    const withoutCause = makePost('2109221721773577501', POST_TEXT)
    for (const post of [withCause, withoutCause]) await insertWebhookJob(env, post)
    await env.DB.prepare(
      "UPDATE webhook_event_jobs SET status='failed',last_error='processing_failed:detection:TypeError' WHERE post_id=?"
    )
      .bind(withCause.id)
      .run()
    for (const post of [withCause, withoutCause]) {
      await handleWebhookQueue(
        {
          queue: 'biccame-event-detection-local-dlq',
          metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } },
          messages: [
            {
              id: `dlq-${post.id}`,
              timestamp: dayjs().toDate(),
              attempts: 1,
              body: { postId: post.id },
              ack: () => {
                acknowledgements.push(post.id)
              },
              retry: () => {}
            }
          ],
          ackAll: () => {},
          retryAll: () => {}
        },
        env
      )
    }
    expect(acknowledgements).toEqual([withCause.id, withoutCause.id])
    expect(await getWebhookJob(env, withCause.id)).toMatchObject({
      status: 'failed',
      lastError: 'processing_failed:detection:TypeError'
    })
    expect(await getWebhookJob(env, withoutCause.id)).toMatchObject({ status: 'failed', lastError: 'retry_exhausted' })
  } finally {
    await cleanup()
  }
}, 60000)
