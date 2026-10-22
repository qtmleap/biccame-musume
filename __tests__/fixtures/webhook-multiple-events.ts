import { spyOn } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import * as eventService from '@api/services/event-service'
import type { Bindings } from '@api/types/bindings'
import type { ClefAnswer, ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { EventDetailSchema, EventRequestSchema } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { type AssociationPicks, associationAnswer, choiceAnswer } from './webhook-answer'

export const makePost = (id: string, text: string): DetectPost => ({
  id,
  text,
  screenName: 'bic_akiba',
  kind: 'original',
  createdAt: '2026-10-11T00:00:00Z',
  url: `https://x.com/bic_akiba/status/${id}`,
  media: []
})

/**
 * 全項目を高確度で答えるフェイクの回答。store / character は picks で選ぶ（省略時は、その候補の抽出段階の店舗とアキバたん）。
 * 選択肢に無い値を picks に指定すると例外にする。
 */
export const answer = (request: ClefRequest, picks: AssociationPicks = {}): ClefResponse => ({
  answers: Object.fromEntries(
    Object.entries(request.questions).map(([id, question]): [string, ClefAnswer] => {
      if (question.type === 'noul') return [id, { type: 'noul', noul: 0.99 }]
      if (question.type === 'score') return [id, { type: 'score', score: 1, confidence: 0.99 }]
      const association = associationAnswer(request, id, question, picks, 0)
      if (association !== undefined) return [id, association]
      const keys = Object.keys(question.criteria)
      const preferred: Record<string, string> = {
        status: 'start',
        category: keys.includes('ackey') ? 'ackey' : keys.includes('acsta') ? 'acsta' : 'limited_card',
        condition: keys.includes('purchase') ? 'purchase' : 'everyone',
        end_date: 'none',
        quantity: 'none'
      }
      const desired = preferred[id]
      const choice = desired !== undefined && keys.includes(desired) ? desired : keys.find((key) => key !== 'none')
      if (choice === undefined) throw new Error('Missing choice')
      return [id, choiceAnswer(question, choice, 0)]
    })
  )
})

export const migrate = async (db: D1Database, until?: string, after?: string) => {
  const dirs = (await readdir('prisma/migrations', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const dir of dirs) {
    if (until !== undefined && dir >= until) continue
    if (after !== undefined && dir <= after) continue
    await db.exec(
      (await readFile(`prisma/migrations/${dir}/migration.sql`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' ')
    )
  }
}

export const fixture = async (name: string) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name,
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB'],
      kvNamespaces: ['BICCAME_MUSUME_EVENTS']
    })
  )
  // 起動に失敗して呼び出し側へ返せない場合も、一時Workerを残さない。
  const bindings = await (async () => {
    try {
      return await mf.getBindings<Bindings>()
    } catch (error) {
      await mf.dispose()
      throw error
    }
  })()
  const calls: string[] = []
  // fail: この文字列を含む候補の判定を失敗させる。picks: store / character の質問でフェイクの AI が選ぶ選択肢。
  const state: { fail: string; picks: AssociationPicks } = { fail: '', picks: {} }
  const env = Object.assign(bindings, {
    EVENT_DETECTION_QUEUE: { send: async () => {} },
    AI: {
      run: async (_model: string, raw: unknown) => {
        const request = ClefRequestSchema.safeParse(raw)
        if (!request.success) throw new Error('Invalid request')
        if (request.data.questions.distribution_item_count) {
          const count =
            (/赤い/.test(request.data.state) && /青い/.test(request.data.state)) ||
            (/キーホルダ/.test(request.data.state) && /名刺/.test(request.data.state))
              ? '2'
              : '1'
          return {
            answers: { distribution_item_count: { type: 'choice', choice: count, probabilities: { [count]: 0.99 } } }
          }
        }
        if (request.data.questions.is_event) calls.push(request.data.state)
        // 参考原文には他候補の金額もあるため、金額の失敗注入は対象物の質問候補で判定する。
        const failureAmount = /^([\d,]+)円$/.exec(state.fail)
        const amountQuestion = request.data.questions.purchase_amount
        const matchesFailure =
          failureAmount === null
            ? request.data.state.includes(state.fail)
            : amountQuestion?.type === 'choice' &&
              Object.hasOwn(amountQuestion.criteria, `p${failureAmount[1].replaceAll(',', '')}`)
        if (state.fail !== '' && matchesFailure) throw new Error('Synthetic candidate failure')
        return answer(request.data, state.picks)
      }
    }
  })
  const eventSpy = spyOn(eventService, 'getEvent').mockImplementation(async (_env, id) => {
    const json = await env.DB.prepare('SELECT candidate_json FROM webhook_event_candidates WHERE event_id=?')
      .bind(id)
      .first<string>('candidate_json')
    const candidate = EventRequestSchema.safeParse(json === null ? null : JSON.parse(json))
    if (!candidate.success) throw new Error('Invalid stored event fixture')
    const detail = EventDetailSchema.safeParse({
      ...candidate.data,
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
      status: 'ongoing',
      daysUntil: 0,
      interestedCount: 0,
      completedCount: 0,
      comments: []
    })
    if (!detail.success) throw new Error('Invalid event detail fixture')
    return detail.data
  })
  const cleanup = async () => {
    eventSpy.mockRestore()
    await mf.dispose()
  }
  return { cleanup, env, calls, state }
}
