import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ExtractedEvent } from '../../scripts/lib/event-detect/extract'
import { type GapEventsFile, writeGapEvents } from '../../scripts/lib/event-detect/gap-events'
import { readGapEvents } from '../../scripts/lib/event-detect/store'

test('CLI保存とEmulatedEventの条件契約は購入・入金を独立して保持する', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'charge-cli-'))
  const conditions: ExtractedEvent['conditions'] = [
    { type: 'purchase', purchaseAmount: 4000 },
    { type: 'charge', chargeAmount: 1000 },
    { type: 'first_come' }
  ]
  const file: GapEventsFile = {
    generatedAt: '2026-10-20T00:00:00.000Z',
    verify: null,
    processed: ['100'],
    events: [
      {
        id: 'event-charge',
        store: 'yuurakuchou',
        item: '記念ギフトカード',
        category: 'other',
        conditions,
        status: 'announce',
        startUnknown: false,
        firstSeen: 1,
        lastSeen: 1,
        posts: [{ postId: '100', status: 'announce', index: 0 }]
      }
    ]
  }
  try {
    const path = join(directory, 'gap-events.json')
    await writeGapEvents(path, file)
    const restored = await readGapEvents(path)
    expect(restored?.events[0].conditions).toEqual(conditions)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
