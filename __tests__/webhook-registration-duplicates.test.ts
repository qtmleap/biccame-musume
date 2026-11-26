import { expect, test } from 'bun:test'
import { duplicateOf, titleHarness, titleToolInput } from './fixtures/webhook-process'

test('a repost with a one-day start date shift is held instead of registering again', async () => {
  const harness = await titleHarness('webhook-title-shifted-duplicate')
  try {
    const first = await harness.run(harness.postOf(12))
    const second = await harness.run(duplicateOf(harness.postOf(13), '1'))
    expect(first.job.status).toBe('registered')
    expect(second.job.status).toBe('held')
    expect(second.job.reasons).toContain(`possible_duplicate:${first.job.eventId}`)
    expect(await harness.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
  } finally {
    await harness.dispose()
  }
}, 60000)

test.each([12, 13])(
  'concurrent reposts with second start day %i register only one event',
  async (secondDay) => {
    const harness = await titleHarness(`webhook-title-concurrent-${secondDay}`)
    try {
      let entered = 0
      const gate = Promise.withResolvers<void>()
      harness.ai.title.reply = async () => {
        if (++entered === 2) gate.resolve()
        await gate.promise
        return titleToolInput('秋の名刺')()
      }
      const results = await Promise.all([
        harness.run(harness.postOf(12)),
        harness.run(duplicateOf(harness.postOf(secondDay), '1'))
      ])
      expect(entered).toBe(2)
      expect(results.map(({ job }) => job.status).sort()).toEqual(['held', 'registered'])
      const registered = results.find(({ job }) => job.status === 'registered')?.job
      const held = results.find(({ job }) => job.status === 'held')?.job
      expect(held?.reasons).toContain(
        secondDay === 12 ? `possible_duplicate_post:${registered?.postId}` : `possible_duplicate:${registered?.eventId}`
      )
      expect(await harness.env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
    } finally {
      await harness.dispose()
    }
  },
  60000
)
