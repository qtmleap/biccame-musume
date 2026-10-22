import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { EventExtractionSchema, EventExtractionValidationError, validateEventExtraction } from './extraction'
import recorded from './extraction-recorded.fixture.json'
import { DetectPostSchema } from './post'

const FixtureSchema = z.array(
  z.object({
    id: z.string().nonempty(),
    post: DetectPostSchema,
    input: z.unknown(),
    previousError: z.string().nonempty(),
    responseHash: z.string().nonempty()
  })
)
const parsed = FixtureSchema.safeParse(recorded)
if (!parsed.success) throw new Error('Invalid recorded extraction fixtures')
const fixtures = parsed.data
const first = fixtures[0]
if (first === undefined) throw new Error('Missing recorded extraction fixture')
const post = first.post
const raw = (evidence: string[], item = '名刺') => ({ events: [{ item, stores: [], characterIds: [], evidence }] })

// 実推論ではなく、未修正の保存応答を検証境界へ再生する。
describe('実応答6件のオフライン再生', () => {
  for (const fixture of fixtures) {
    test(fixture.id, () => {
      if (fixture.previousError === 'Invalid event extraction') {
        try {
          validateEventExtraction(fixture.post, fixture.input)
          throw new Error('Expected invalid model response')
        } catch (error) {
          expect(error).toBeInstanceOf(EventExtractionValidationError)
          if (!(error instanceof EventExtractionValidationError)) throw error
          expect(error.code).toBe('extraction_invalid_response')
          expect(error.issues).toEqual([
            { code: 'invalid_type', path: ['events'] },
            { code: 'too_big', path: ['events'] }
          ])
          expect(JSON.stringify(error.issues)).not.toContain('年賀状')
        }
        return
      }
      const extraction = validateEventExtraction(fixture.post, fixture.input)
      const original = EventExtractionSchema.safeParse(fixture.input)
      if (!original.success) throw new Error('Expected valid recorded event shape')
      expect(extraction.events).toHaveLength(
        fixture.previousError === 'Duplicate event extraction' ? 1 : original.data.events.length
      )
      const sources = [
        fixture.post.text,
        ...(fixture.post.quoted?.text === undefined ? [] : [fixture.post.quoted.text])
      ]
      for (const event of extraction.events) {
        for (const evidence of event.evidence) {
          expect(sources.some((source) => source.includes(evidence))).toBe(true)
        }
      }
      // 原本のモデル出力自体を書き換えてはいけない。
      expect(fixture.input).toEqual(recorded.find((entry) => entry.id === fixture.id)?.input)
    })
  }
})

describe('原文範囲の安全境界', () => {
  test('改行を含む原文を復元し、数値・句読点・記号は一切補正しない', () => {
    const value = { ...post, text: '名刺は 税込3000円以上\n購入で🎁' }
    expect(validateEventExtraction(value, raw(['名刺は 税込3000円以上購入で🎁'])).events[0].evidence).toEqual([
      value.text
    ])
    for (const text of ['名刺は税込1000円以上購入で🎁', '名刺は税込3,000円以上購入で🎁', '名刺は全員に配布']) {
      expect(() => validateEventExtraction(value, raw([text]))).toThrow('unsupported evidence')
    }
  })

  test('異なる範囲・引用をつなぎ、別物品の条件を借用しない', () => {
    const value = {
      ...post,
      text: '名刺は無料\nアクキーは3000円購入で配布',
      quoted: { id: '1', text: 'ギフトカードは抽選' }
    }
    for (const text of ['名刺は3000円購入で配布', '名刺は無料ギフトカードは抽選', 'ギフトカードは全員に配布']) {
      expect(() => validateEventExtraction(value, raw([text]))).toThrow('unsupported evidence')
    }
  })

  test('同じ空白除去文字列が複数箇所にある場合は復元先を推測しない', () => {
    const value = { ...post, text: '名刺\n配布、名刺 配布' }
    expect(() => validateEventExtraction(value, raw(['名刺 配布']))).toThrow('unsupported evidence')
    expect(() =>
      validateEventExtraction({ ...value, quoted: { id: '1', text: '名刺\t配布' } }, raw(['名刺 配布']))
    ).toThrow('unsupported evidence')
  })

  test('別日・別条件・別原文範囲を持つ同じ配布物は重複扱いしない', () => {
    const value = { ...post, text: '4/5は40枚、4/6は40枚。名刺は購入で配布。名刺は抽選で配布。' }
    const events = ['4/5は40枚', '4/6は40枚', '名刺は購入で配布', '名刺は抽選で配布'].flatMap(
      (text) => raw([text]).events
    )
    expect(validateEventExtraction(value, { events: [...events, events[0]] }).events).toEqual(events)
  })

  test('原文範囲がすべて同じ候補は根拠の列挙順だけが違っても1件にする', () => {
    const value = { ...post, text: '本日開始。名刺は無料で配布。' }
    const [event] = raw(['本日開始。', '名刺は無料で配布。']).events
    const reversed = { ...event, evidence: [...event.evidence].reverse() }
    const repeated = { ...event, evidence: [...event.evidence, event.evidence[0]] }
    expect(validateEventExtraction(value, { events: [event, reversed, repeated] }).events).toEqual([event])
  })

  test('不正な店舗・娘・必須フィールド欠落や文字列JSONを成功にしない', () => {
    for (const input of [
      {},
      { events: [{}] },
      { events: JSON.stringify(raw([post.text]).events) },
      { events: [{ item: '名刺', evidence: [post.text] }] },
      { events: [{ item: '名刺', stores: ['invented'], characterIds: [], evidence: [post.text] }] },
      { events: [{ item: '名刺', stores: [], characterIds: ['invented'], evidence: [post.text] }] }
    ]) {
      expect(() => validateEventExtraction(post, input)).toThrow()
    }
  })

  test('旧保存JSONは旧境界で欠落配列を補い、新応答では拒否する', () => {
    const saved = { events: [{ item: '名刺', evidence: [post.text] }] }
    for (const version of ['giveaways-v2', 'giveaways-v5-limited-sales-charge', 'giveaways-v6-focused-review']) {
      const result = EventExtractionSchema.safeParse({ ...saved, version })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.events[0]).toMatchObject({ stores: [], characterIds: [] })
    }
    expect(() => validateEventExtraction(post, saved)).toThrow('Invalid event extraction')
  })
})
