import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readArchiveState } from '../../scripts/lib/event-detect/store'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

/** scope.json と manifest.json を書いた取得ディレクトリを作り、posts.jsonl のパスを返す */
const archive = async (manifest: Record<string, unknown>) => {
  const path = await mkdtemp(join(tmpdir(), 'event-detect-archive-'))
  directories.push(path)
  await writeFile(
    join(path, 'scope.json'),
    JSON.stringify({ from: '2025-10-07T15:00:00.000Z', until: '2026-10-08T09:26:56.109Z' })
  )
  await writeFile(join(path, 'manifest.json'), JSON.stringify(manifest))
  return join(path, 'posts.jsonl')
}

const base = { complete: false, coverageVerified: false, pages: 14378, posts: 1_247_278, reason: 'budget' }

describe('readArchiveState', () => {
  test('期間を絞った取得は scope.json の期間をそのまま使う', async () => {
    const state = await readArchiveState(
      await archive({
        ...base,
        effectiveScope: { from: '2025-10-07T15:00:00.000Z' },
        minTimestamp: '2025-10-08T00:00:00.000Z'
      })
    )
    expect(state).toEqual({
      from: '2025-10-07T15:00:00.000Z',
      until: '2026-10-08T09:26:56.109Z',
      complete: false,
      coverageVerified: false,
      pages: 14378,
      archivePosts: 1_247_278
    })
  })

  test('全履歴の取得（effectiveScope.from が null）は minTimestamp を下限にする', async () => {
    const state = await readArchiveState(
      await archive({
        ...base,
        effectiveScope: { from: null, until: '2026-10-08T09:26:56.109Z' },
        minTimestamp: '2012-05-26T07:18:20.000Z'
      })
    )
    expect(state.from).toBe('2012-05-26T07:18:20.000Z')
    expect(state.until).toBe('2026-10-08T09:26:56.109Z')
  })

  test('全履歴でも minTimestamp が無ければ scope.json の from のまま', async () => {
    const state = await readArchiveState(await archive({ ...base, effectiveScope: { from: null } }))
    expect(state.from).toBe('2025-10-07T15:00:00.000Z')
  })

  test('manifest の余計なキーは返さない', async () => {
    const state = await readArchiveState(await archive({ ...base, accounts: [{ key: 'id:1' }], coverage: 'text' }))
    expect(Object.keys(state).sort()).toEqual([
      'archivePosts',
      'complete',
      'coverageVerified',
      'from',
      'pages',
      'until'
    ])
  })
})
