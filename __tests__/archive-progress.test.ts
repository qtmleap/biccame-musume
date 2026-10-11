import { expect, test } from 'bun:test'

import { createArchiveProgressRenderer } from '../scripts/lib/archive-progress'
import type { ArchiveProgress } from '../scripts/lib/post-archive'

type Snapshot = ArchiveProgress
type Renderer = { update: (snapshot: Snapshot) => void; finish: () => void }
const createRenderer = (write: (value: string) => void, isTTY: boolean, columns = 200): Renderer => {
  return createArchiveProgressRenderer({ write, isTTY, columns: () => columns })
}
const snapshot: Snapshot = {
  date: '2026-10-08',
  seedPages: 50,
  pages: 123,
  posts: 456,
  status: 'running',
  accounts: Array.from({ length: 7 }, (_, index) => ({
    key: `id:${index}`,
    authorId: String(index),
    screenName: `bic_${index}`,
    posts: 100 - index
  }))
}

test('TTY progress overwrites one row and shows at most five leading account summaries', () => {
  const output: string[] = []
  const renderer = createRenderer((value) => output.push(value), true)
  renderer.update(snapshot)
  renderer.update({ ...snapshot, posts: 457 })
  expect(output).toHaveLength(2)
  for (const value of output) {
    expect(value.startsWith('\r\x1b[2K')).toBe(true)
    expect(value).not.toContain('\n')
    expect(value).toContain('2026-10-08')
    expect(value).toContain('50seed')
    expect(value).toContain('123')
    expect(value).toContain('@bic_0')
    expect(value).toContain('@bic_4')
    expect(value).not.toContain('@bic_5')
    expect(value).toContain('7')
  }
  expect(output[1]).toContain('457')
  renderer.finish()
  renderer.finish()
  expect(output.slice(2)).toEqual(['\n'])
})

test('narrow TTY truncates account summaries before core date and saved counts', () => {
  const output: string[] = []
  const renderer = createRenderer((value) => output.push(value), true, 36)
  renderer.update(snapshot)
  const row = output[0].replace('\r\x1b[2K', '')
  expect(row.length).toBeLessThan(36)
  expect(row).toContain('2026-10-08')
  expect(row).toContain('50seed')
  expect(row).toContain('456')
  expect(row).not.toContain('@bic_0')
})

test('account display cannot inject terminal control sequences or multiline output', () => {
  const output: string[] = []
  const renderer = createRenderer((value) => output.push(value), true)
  renderer.update({ ...snapshot, accounts: [{ key: 'id:1', screenName: 'evil\n\r\x1b[31m日本語', posts: 2 }] })
  const row = output[0].replace('\r\x1b[2K', '')
  expect(row).not.toContain('\r')
  expect(row).not.toContain('\n')
  expect(row).not.toContain('\x1b')
  expect(row).not.toContain('日本語')
  expect(row).toMatch(/^[\x20-\x7e]*$/)
})

test('redirected progress uses readable lines and terminal status remains visible', () => {
  const output: string[] = []
  const renderer = createRenderer((value) => output.push(value), false)
  renderer.update(snapshot)
  renderer.update({ ...snapshot, status: 'budget' })
  renderer.finish()
  expect(output).toHaveLength(2)
  for (const value of output) {
    expect(value.endsWith('\n')).toBe(true)
    expect(value).not.toContain('\r')
    expect(value).not.toContain('\x1b')
  }
  expect(output[1]).toContain('budget')
})

test('TTY without ANSI support prints readable newline progress', () => {
  const output: string[] = []
  const renderer = createArchiveProgressRenderer({
    write: (value: string) => output.push(value),
    isTTY: true,
    ansi: false,
    columns: () => 200
  })
  renderer.update(snapshot)
  renderer.finish()
  expect(output).toHaveLength(1)
  expect(output[0].endsWith('\n')).toBe(true)
  expect(output[0]).not.toContain('\r')
  expect(output[0]).not.toContain('\x1b')
})

test('disabled or failed progress writers stop writing without throwing', () => {
  const output: string[] = []
  const renderer = createArchiveProgressRenderer({ write: (value) => output.push(value), isTTY: true })
  renderer.update(snapshot)
  renderer.disable()
  renderer.update(snapshot)
  renderer.finish()
  expect(output).toHaveLength(1)
  let attempts = 0
  const failed = createArchiveProgressRenderer({
    isTTY: true,
    write: () => {
      attempts++
      throw new Error('Broken pipe')
    }
  })
  expect(() => failed.update(snapshot)).not.toThrow()
  failed.update(snapshot)
  failed.finish()
  expect(attempts).toBe(1)
})

test('identical progress does not repeat redirected log lines', () => {
  const output: string[] = []
  const renderer = createArchiveProgressRenderer({ write: (value) => output.push(value), isTTY: false })
  renderer.update(snapshot)
  renderer.update(snapshot)
  renderer.finish()
  expect(output).toHaveLength(1)
})

test('retry progress uses one CR row with attempt, scheduled wait and fixed failure kind', () => {
  for (const columns of [200, 36]) {
    const output: string[] = []
    const renderer = createRenderer((value) => output.push(value), true, columns)
    const retrySnapshot = {
      ...snapshot,
      status: 'retrying' as const,
      retry: { attempt: 2, delayMs: 10000, kind: 'list_dependency' }
    }
    renderer.update(retrySnapshot)
    renderer.update(retrySnapshot)
    expect(output).toHaveLength(1)
    expect(output[0].startsWith('\r\x1b[2K')).toBe(true)
    expect(output[0]).toContain('retrying')
    expect(output[0]).toContain('#2')
    expect(output[0]).toContain('10s')
    expect(output[0]).toContain('list_dependency')
  }
})
