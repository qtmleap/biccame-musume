import { expect, spyOn, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import botRoutes from '@api/routes/admin-bot'
import * as discordService from '@api/services/discord'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import type { ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import { resolveFieldThresholds } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { processWebhookJob, responseFor } from './fixtures/webhook-process'

test('saved field thresholds reach the judgement: the status threshold decides whether a 0.6 status is confirmed', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-process-field-thresholds-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB'],
      kvNamespaces: ['BICCAME_MUSUME_EVENTS']
    })
  )
  // Discord へは送らない。通知は常に成功した扱いにする。
  const notificationSpy = spyOn(discordService, 'notifyEventDetection').mockImplementation(async () => ({
    status: 'sent',
    messageId: '1234567890'
  }))
  try {
    const environment = await mf.getBindings<Bindings>()
    const env = Object.assign(environment, {
      ENVIRONMENT: 'local',
      EVENT_DETECTION_QUEUE: { send: async () => {} },
      AI: {
        // 状態（開始）は 0.6、開始日は 0.7 に止まる回答。他の項目は 0.99 で確定する。
        // 開始日が常に未確定なので、どの条件でも保留のまま（登録まで進まず、理由の差だけで判定を見る）。
        run: async (_model: string, request: ClefRequest): Promise<ClefResponse> => {
          const base = responseFor(request)
          if (request.questions.distribution_item_count || !request.questions.is_event) return base
          const startDate = base.answers.start_date
          if (startDate?.type !== 'choice') throw new Error('Missing start_date answer')
          return {
            answers: {
              ...base.answers,
              status: { type: 'choice', choice: 'start', probabilities: { start: 0.6, announce: 0.3 } },
              start_date: {
                type: 'choice',
                choice: startDate.choice,
                probabilities: { [startDate.choice]: 0.7, none: 0.2 }
              }
            }
          }
        }
      }
    })
    const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations)
      await env.DB.exec(
        (await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' ')
      )
    const postOf = (day: number): DetectPost => ({
      id: `21092217217735764${day}0`,
      screenName: 'bic_akiba',
      text: `10月${day}日より限定名刺をどなたでも配布します`,
      createdAt: '2026-10-11T00:00:00Z',
      kind: 'original',
      url: `https://x.com/bic_akiba/status/21092217217735764${day}0`,
      media: []
    })
    const judge = async (post: DetectPost) => {
      await insertWebhookJob(env, post)
      await processWebhookJob(env, post.id)
      return getWebhookJob(env, post.id)
    }
    const defaultEventThresholds = { eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.9 }
    const saveThresholds = async (status: number, thresholds = defaultEventThresholds) => {
      const response = await botRoutes.request(
        '/admin/bot/configuration',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'clef',
            thresholds,
            fieldThresholds: { ...resolveFieldThresholds(0.9), status }
          })
        },
        env
      )
      expect(response.status).toBe(200)
    }
    // 未保存: status の既定のしきい値は 0.8 なので、0.6 は告知・開始と確定できない。
    const byDefault = await judge(postOf(12))
    expect(byDefault.status).toBe('held')
    expect(byDefault.reasons).toEqual(['status_unconfirmed', 'start_date_unconfirmed'])
    // status を 0.5 に下げて保存すると、同じ回答でも status は確定し、理由から消える。
    await saveThresholds(0.5)
    const lowered = await judge(postOf(13))
    expect(lowered.status).toBe('held')
    expect(lowered.reasons).toEqual(['start_date_unconfirmed'])
    // 0.7 に上げて保存し直すと、また未確定に戻る（保存値が毎回読まれる）。
    await saveThresholds(0.7)
    const raised = await judge(postOf(14))
    expect(raised.reasons).toEqual(['status_unconfirmed', 'start_date_unconfirmed'])
    // is_event は参考値なので、登録の閾値を上限の 100% にして保存しても、イベント確率 0.99 でも理由は増えない（保留の理由は同じ）。
    await saveThresholds(0.7, { eventThreshold: 1, ignoreThreshold: 0.5, choiceThreshold: 0.9 })
    const strict = await judge(postOf(15))
    expect(strict.reasons).toEqual(['status_unconfirmed', 'start_date_unconfirmed'])
    // 90% に戻して保存し直しても、理由は変わらない。
    await saveThresholds(0.7)
    const restored = await judge(postOf(16))
    expect(restored.reasons).toEqual(['status_unconfirmed', 'start_date_unconfirmed'])
  } finally {
    notificationSpy.mockRestore()
    await mf.dispose()
  }
}, 60000)
