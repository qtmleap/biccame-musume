import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LINK_VERSION } from '../../scripts/lib/event-detect/emulate'
import { EMULATED_FILE, readEmulatedEvents } from '../../scripts/lib/event-detect/store'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const cacheDir = async () => {
  const path = await mkdtemp(join(tmpdir(), 'event-detect-emulated-'))
  directories.push(path)
  return path
}

/** emulate が書く EmulatedEvent の形 */
const emulatedEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'example-1',
  store: 'example',
  item: '夏名刺',
  category: 'limited_card' as const,
  status: 'ongoing' as const,
  startUnknown: false,
  firstSeen: Date.parse('2026-06-01T01:00:00Z'),
  lastSeen: Date.parse('2026-06-20T01:00:00Z'),
  posts: [{ postId: '1', status: 'announce' as const, index: 0 }],
  ...overrides
})

describe('EMULATED_FILE', () => {
  test('emulate が書くファイル名（LINK_VERSION から作る名前）と一致する', () => {
    // store.ts は emulate.ts から import されるので LINK_VERSION を読めない。名前がずれたら統計に出なくなる
    expect(EMULATED_FILE).toBe(`emulated-${LINK_VERSION}.json`)
  })
})

describe('readEmulatedEvents', () => {
  test('ファイルが無ければ undefined（emulate を実行していない）', async () => {
    expect(await readEmulatedEvents(await cacheDir())).toBeUndefined()
  })

  test('統計と LLM イベントの画面に使う項目を読み、ファイルの更新時刻を emulatedAt に返す', async () => {
    const dir = await cacheDir()
    const path = join(dir, EMULATED_FILE)
    await writeFile(
      path,
      JSON.stringify([
        emulatedEvent({ startDate: '2026-06-10', endDate: '2026-06-30', endedAt: '2026-07-01', quantity: 100 }),
        emulatedEvent({ id: 'example-2', startUnknown: true })
      ])
    )
    const mtime = Date.parse('2026-10-09T03:00:00.000Z') / 1000
    await utimes(path, mtime, mtime)
    expect(await readEmulatedEvents(dir)).toEqual({
      emulatedAt: '2026-10-09T03:00:00.000Z',
      events: [
        emulatedEvent({ startDate: '2026-06-10', endDate: '2026-06-30', endedAt: '2026-07-01', quantity: 100 }),
        emulatedEvent({ id: 'example-2', startUnknown: true })
      ]
    })
  })

  test('広げた項目（id・配布物・種別・状態・配布数・開始不明・最後の言及・言及）を読む', async () => {
    const dir = await cacheDir()
    await writeFile(
      join(dir, EMULATED_FILE),
      JSON.stringify([
        emulatedEvent({
          id: 'kawasaki-12',
          store: 'kawasaki',
          item: 'ハロウィン名刺',
          category: 'ackey',
          status: 'end',
          quantity: 50,
          startUnknown: true,
          lastSeen: Date.parse('2026-10-31T01:00:00Z'),
          posts: [
            { postId: '1', status: 'announce', index: 0 },
            { postId: '2', status: 'end', index: 1 }
          ]
        })
      ])
    )
    expect((await readEmulatedEvents(dir))?.events).toEqual([
      {
        id: 'kawasaki-12',
        store: 'kawasaki',
        item: 'ハロウィン名刺',
        category: 'ackey',
        status: 'end',
        quantity: 50,
        startUnknown: true,
        firstSeen: Date.parse('2026-06-01T01:00:00Z'),
        lastSeen: Date.parse('2026-10-31T01:00:00Z'),
        posts: [
          { postId: '1', status: 'announce', index: 0 },
          { postId: '2', status: 'end', index: 1 }
        ]
      }
    ])
  })

  test('言及の verify は choice・probability・merged だけを読み、確率の内訳などは読まない', async () => {
    const dir = await cacheDir()
    await writeFile(
      join(dir, EMULATED_FILE),
      JSON.stringify([
        emulatedEvent({
          posts: [
            {
              postId: '1',
              status: 'ongoing',
              index: 0,
              verify: { choice: 'new', probability: 0.9, probabilities: { new: 0.9, 'example-1': 0.1 }, merged: false }
            },
            { postId: '2', status: 'end', index: 0, verify: { choice: 'example-1', probability: 1, merged: true } }
          ]
        })
      ])
    )
    expect((await readEmulatedEvents(dir))?.events[0].posts).toEqual([
      { postId: '1', status: 'ongoing', index: 0, verify: { choice: 'new', probability: 0.9, merged: false } },
      { postId: '2', status: 'end', index: 0, verify: { choice: 'example-1', probability: 1, merged: true } }
    ])
  })

  test('endDate（告知の終了予定日）だけを持つイベントも読める', async () => {
    const dir = await cacheDir()
    await writeFile(join(dir, EMULATED_FILE), JSON.stringify([emulatedEvent({ endDate: '2026-06-30' })]))
    expect((await readEmulatedEvents(dir))?.events).toEqual([emulatedEvent({ endDate: '2026-06-30' })])
  })

  test('空の配列も読める（イベントを 1 件も作らなかった結果）', async () => {
    const dir = await cacheDir()
    await writeFile(join(dir, EMULATED_FILE), '[]')
    expect((await readEmulatedEvents(dir))?.events).toEqual([])
  })

  test('形が合わないファイルは、ファイル名付きのエラーで再実行を案内する', async () => {
    const dir = await cacheDir()
    const path = join(dir, EMULATED_FILE)
    for (const broken of [
      // 配列でない
      { events: [] },
      // store が無い
      [emulatedEvent({ store: undefined })],
      // firstSeen が数でない
      [emulatedEvent({ firstSeen: '2026-06-01' })],
      // 日付が YYYY-MM-DD でない
      [emulatedEvent({ startDate: '2026/06/10' })],
      [emulatedEvent({ endDate: '2026/06/30' })],
      [emulatedEvent({ endDate: '2026-06-30T00:00:00Z' })],
      [emulatedEvent({ endedAt: '2026-06-01T00:00:00Z' })],
      // 広げた項目が無い・合わない
      [emulatedEvent({ id: undefined })],
      [emulatedEvent({ id: 'example/1' })],
      [emulatedEvent({ item: undefined })],
      [emulatedEvent({ category: 'unknown' })],
      [emulatedEvent({ status: 'unknown' })],
      [emulatedEvent({ startUnknown: undefined })],
      [emulatedEvent({ lastSeen: '2026-06-20' })],
      [emulatedEvent({ quantity: 0 })],
      // 言及（posts）の形が合わない
      [emulatedEvent({ posts: undefined })],
      [emulatedEvent({ posts: { postId: '1' } })],
      [emulatedEvent({ posts: [{ status: 'announce', index: 0 }] })],
      [emulatedEvent({ posts: [{ postId: '1', status: 'unknown', index: 0 }] })],
      [emulatedEvent({ posts: [{ postId: '1', status: 'announce', index: -1 }] })],
      [emulatedEvent({ posts: [{ postId: '1', status: 'announce' }] })],
      [emulatedEvent({ posts: [{ postId: '1', status: 'announce', index: 0, verify: { choice: 'new' } }] })],
      [
        emulatedEvent({
          posts: [
            { postId: '1', status: 'announce', index: 0, verify: { choice: 'new', probability: '1', merged: true } }
          ]
        })
      ]
    ]) {
      await writeFile(path, JSON.stringify(broken))
      await expect(readEmulatedEvents(dir)).rejects.toThrow(`${path}`)
      await expect(readEmulatedEvents(dir)).rejects.toThrow('(re-run emulate)')
    }
  })
})
