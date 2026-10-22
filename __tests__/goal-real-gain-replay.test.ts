import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
  EVENT_DETECTION_MODEL_KEY,
  EVENT_DETECTION_THRESHOLDS_KEY
} from '@api/services/webhook-config'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { type ClefAnswer, ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { EventExtractionSchema } from '@biccame/shared/event-detect/extraction'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { z } from 'zod'
import { fixture, migrate } from './fixtures/webhook-multiple-events'

const directory = `${import.meta.dir}/fixtures/goal-live-gains`
const ProvenanceSchema = z.object({
  case: z.string().nonempty(),
  version: z.literal('v5-webhook-v12-neutral-context'),
  extractionVersion: z.literal('giveaways-v6-focused-review'),
  post: DetectPostSchema,
  baseline: z.object({
    version: z.literal('v4-webhook-v8-object-kind'),
    stopped: z.literal(true),
    stopReasons: z.array(z.string().nonempty()),
    calls: z.literal(2),
    audit: z.object({ probability: z.number(), threshold: z.number() }),
    sourceSha256: z.string().nonempty()
  }),
  sources: z.array(
    z.object({
      file: z.string().nonempty(),
      source: z.string().nonempty(),
      recordedResponseHash: z.string().nonempty(),
      sha256: z.string().nonempty()
    })
  )
})

// 録画（v12 の実 AI の出力）には、v13 の store / character（choice 各 1 問）の回答が無い。録画は変えず、この 2 キーだけを
// 合成の回答で補う。合成の値は録画した抽出（Haiku の実出力）の stores / characterIds の唯一の値で、確率は 0.99 に固定する。
// これ以外の未録画の質問は補わず、再生を失敗させる（条件などを捏造して録画の結果を変えないため）。
const SYNTHETIC_KEYS = ['character', 'store'] as const
// v16 の 2 段目（確認の質問だけの別の呼び出し）。録画に無いので、同じく合成の回答（はい 0.99）で補う。
// 録画の抽出は店舗と娘が同じ ID（店舗の娘）なので、娘は確認の対象にならず、店舗の確認（store_confirm）だけが送られる。
const CONFIRM_KEYS = ['store_confirm'] as const
const syntheticChoice = (choice: string, criteria: string[]): ClefAnswer => ({
  type: 'choice',
  choice,
  probabilities: Object.fromEntries(criteria.map((key) => [key, key === choice ? 0.99 : 0.01 / (criteria.length - 1)]))
})
const only = (values: readonly string[], label: string) => {
  if (values.length !== 1) throw new Error(`Recorded extraction must have exactly one ${label}`)
  return values[0]
}

const load = async (file: string): Promise<unknown> => JSON.parse(await readFile(`${directory}/${file}`, 'utf8'))
const response = async (file: string) => {
  const parsed = ClefResponseSchema.safeParse(await load(file))
  if (!parsed.success) throw new Error('Invalid recorded Clef response')
  return parsed.data
}

for (const id of ['962146543649239040', '1012319233298989056']) {
  test(`実測の前段停止改善を一時DBの公開DTOまで再生する: ${id}`, async () => {
    const parsed = ProvenanceSchema.safeParse(await load(`${id}-provenance.json`))
    if (!parsed.success) throw new Error('Invalid replay provenance')
    const recording = parsed.data
    expect(recording.baseline.stopped).toBe(true)
    expect(recording.baseline.audit.probability).toBeLessThan(recording.baseline.audit.threshold)
    expect(recording.baseline.stopReasons).toEqual(['distribution_item_count_low_confidence'])
    for (const source of recording.sources) {
      const text = await readFile(`${directory}/${source.file}`, 'utf8')
      expect(createHash('sha256').update(text).digest('hex')).toBe(source.sha256)
      const raw: unknown = JSON.parse(text)
      expect(createHash('sha256').update(JSON.stringify(raw)).digest('hex')).toBe(source.recordedResponseHash)
    }
    const count = await response(`${id}-count.json`)
    // 録画した判定の回答。v12 は 2 バッチ（judge-3 が status など、judge-4 が character.*）。v13 は 1 バッチなので、キーごとに引く。
    const judges = await Promise.all([response(`${id}-judge-3.json`), response(`${id}-judge-4.json`)])
    const recordedAnswers: Record<string, ClefAnswer> = Object.fromEntries(
      judges.flatMap((judge) => Object.entries(judge.answers))
    )
    const extraction = await load(`${id}-extract.json`)
    // 録画した抽出（Haiku の実出力）から、合成する store / character の選択を決める。
    const recordedEvent = EventExtractionSchema.safeParse(
      (() => {
        const content = z
          .object({ content: z.array(z.object({ type: z.string().nonempty(), input: z.unknown().optional() })) })
          .safeParse(extraction)
        const tool = content.success ? content.data.content.find((block) => block.type === 'tool_use') : undefined
        return tool === undefined ? undefined : tool.input
      })()
    )
    if (!recordedEvent.success) throw new Error('Invalid recorded extraction')
    const synthetic = {
      store: only(recordedEvent.data.events[0].stores, 'store'),
      character: only(recordedEvent.data.events[0].characterIds, 'character')
    }
    const synthesized: string[] = []
    const confirmed: string[] = []
    const calls: string[] = []
    const base = await fixture(`goal-real-gain-${id}`)
    try {
      await migrate(base.env.DB)
      await base.env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, 'clef')
      await base.env.BICCAME_MUSUME_EVENTS.put(
        EVENT_DETECTION_THRESHOLDS_KEY,
        JSON.stringify({
          eventThreshold: 0.9,
          choiceThreshold: 0.9,
          ignoreThreshold: 0.5
        })
      )
      await base.env.BICCAME_MUSUME_EVENTS.put(
        EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
        JSON.stringify({
          status: 0.8,
          category: 0.85,
          store: 0.9,
          start_date: 0.9,
          end_date: 0.9,
          quantity: 0.9,
          condition: 0.9,
          purchase_amount: 0.9
        })
      )
      const env = Object.assign(base.env, {
        ANTHROPIC_BASE_URL: 'https://replay.invalid',
        ANTHROPIC_AUTH_TOKEN: 'test-only',
        DISCORD_TOKEN: '',
        DISCORD_CHANNEL_ID: '',
        DISCORD_POSTING_ENABLED: 'false',
        X_POSTING_ENABLED: 'false',
        AI: {
          run: async (_model: string, raw: unknown) => {
            const request = ClefRequestSchema.safeParse(raw)
            if (!request.success) throw new Error('Invalid replay request')
            if (request.data.questions.distribution_item_count !== undefined) {
              calls.push('count')
              return count
            }
            // 2 段目（確認）は is_event を含まない。録画した回答は 1 段目のものだけ。
            if (request.data.questions.is_event === undefined) {
              calls.push('confirm')
              confirmed.push(...Object.keys(request.data.questions))
              return {
                answers: Object.fromEntries(
                  Object.keys(request.data.questions).map((key): [string, ClefAnswer] => [
                    key,
                    { type: 'noul', noul: 0.99 }
                  ])
                )
              }
            }
            calls.push('judge')
            return {
              answers: Object.fromEntries(
                Object.entries(request.data.questions).map(([key, question]): [string, ClefAnswer] => {
                  const recorded: ClefAnswer | undefined = recordedAnswers[key]
                  if (recorded !== undefined) return [key, recorded]
                  if ((key === 'store' || key === 'character') && question.type === 'choice') {
                    synthesized.push(key)
                    const choice = key === 'store' ? synthetic.store : synthetic.character
                    return [key, syntheticChoice(choice, Object.keys(question.criteria))]
                  }
                  throw new Error(`Unrecorded replay question: ${key}`)
                })
              )
            }
          }
        }
      })
      await insertWebhookJob(env, recording.post)
      await processWebhookJob(env, id, {
        extractionFetcher: async () => {
          calls.push('extract')
          return Response.json(extraction)
        },
        titleFetcher: async () => {
          throw new Error('Review must not generate a title')
        }
      })
      const job = await getWebhookJob(env, id)
      console.log(
        JSON.stringify({
          id,
          calls,
          status: job.status,
          audit: job.itemCountAudit,
          candidates: job.candidates.map((candidate) => ({
            item: candidate.item,
            reasons: candidate.reasons,
            discovery: candidate.discovery,
            draft: candidate.draft,
            relatedEvents: candidate.relatedEvents
          }))
        })
      )
      // 1 段目の判定の後に、2 段目の確認が 1 回（店舗だけ。店舗の娘は娘の確認を聞かない）。
      expect(synthetic.character).toBe(synthetic.store)
      expect(calls).toEqual(['count', 'extract', 'judge', 'confirm'])
      // 合成したのは store / character と、2 段目の確認だけ。ほかの回答は録画のまま。
      expect(synthesized.slice().sort()).toEqual([...SYNTHETIC_KEYS])
      expect(confirmed.slice().sort()).toEqual([...CONFIRM_KEYS])
      expect(job.itemCountAudit?.status).toBe('low_confidence')
      expect(job.candidates).toHaveLength(1)
      const candidate = job.candidates[0]
      const saved = candidate.answers === null ? {} : candidate.answers
      const isSynthetic = (key: string) =>
        [...SYNTHETIC_KEYS, ...CONFIRM_KEYS].some((synthesizedKey) => synthesizedKey === key)
      expect(Object.keys(saved).filter((key) => !isSynthetic(key))).not.toHaveLength(0)
      for (const [key, value] of Object.entries(saved))
        if (!isSynthetic(key)) expect(value).toEqual(recordedAnswers[key])
      expect(saved.store_confirm).toEqual({ type: 'noul', noul: 0.99 })
      expect(saved).not.toHaveProperty('character_confirm')
      expect(saved.store).toMatchObject({ type: 'choice', choice: synthetic.store })
      expect(saved.character).toMatchObject({ type: 'choice', choice: synthetic.character })
      expect(candidate.post.extractionContext?.originalText).toBe(recording.post.text)
      expect(candidate.post.extractionContext?.kind).toBe('item')
      expect(candidate.post.extractionContext?.evidence.length).toBeGreaterThan(0)
      expect(candidate.discovery?.relevance).toBe('detected')
      expect(candidate.discovery?.action).toBe('review')
      // 962146543649239040 は録画に条件の質問が無く、本文にも条件の語が無いので全員配布として評価が登録に進み、
      // 件数の監査（low_confidence）だけが保留にする。もう一方は本文のキーワードが無く対象外のまま。
      expect(candidate.discovery?.evidence).toEqual(
        id === '962146543649239040'
          ? ['model_event_confirmed', 'validated_registration_candidate']
          : ['model_event_confirmed']
      )
      expect(candidate.discovery?.missingFields).toContain('itemCountAudit')
      expect(candidate.reasons).toContain('distribution_item_count_low_confidence')
      expect(candidate.relatedEvents).toBeNull()
      expect(candidate.eventId).toBeNull()
      if (id === '962146543649239040') {
        expect(candidate.notificationStatus).toBe('failed')
        expect(candidate.notificationError).toBe('configuration')
        expect(job.status).toBe('held')
        expect(job.itemCountAudit?.probability).toBe(0.8847)
        expect(candidate.discovery?.confidence).toBe(0.9774)
        expect(candidate.discovery?.missingFields).not.toContain('conditions')
        expect(candidate.reasons).not.toContain('distribution_condition_unspecified')
        expect(candidate.draft?.conditions).toEqual([{ type: 'everyone' }])
        expect(candidate.draft?.category).toBe('limited_card')
        expect(candidate.draft?.stores).toEqual(['kawasaki'])
      } else {
        expect(candidate.notificationStatus).toBe('skipped')
        expect(job.status).toBe('ignored')
        expect(job.itemCountAudit?.probability).toBe(0.8056)
        expect(candidate.discovery?.confidence).toBe(0.9533)
        expect(candidate.reasons).toContain('no_keyword')
        expect(candidate.draft).toBeNull()
      }
      expect(job.eventId).toBeNull()
      expect(await env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
      expect(await env.DB.prepare('SELECT count(*) AS total FROM social_post_jobs').first<number>('total')).toBe(0)
    } finally {
      await base.cleanup()
    }
  })
}
