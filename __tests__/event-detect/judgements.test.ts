import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QUESTION_VERSION } from '../../scripts/lib/event-detect/decide'
import { EXTRACT_VERSION } from '../../scripts/lib/event-detect/extract'
import { JUDGE_MODEL } from '../../scripts/lib/event-detect/judge'
import { readJudgements } from '../../scripts/lib/event-detect/store'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const cacheDir = async () => {
  const path = await mkdtemp(join(tmpdir(), 'event-detect-judgements-'))
  directories.push(path)
  return path
}

/** 判定キャッシュのディレクトリ（judge・extract・clef）。実際のコマンドと同じ組み立て方 */
const dirs = (root: string) => ({
  judge: join(root, 'judge', JUDGE_MODEL, QUESTION_VERSION),
  extract: join(root, 'extract', JUDGE_MODEL, EXTRACT_VERSION),
  clef: join(root, 'clef', QUESTION_VERSION)
})

const put = async (dir: string, name: string, body: unknown) => {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), typeof body === 'string' ? body : JSON.stringify(body))
}

const judge = (postId: string, isEvent: number) => ({
  key: postId,
  model: JUDGE_MODEL,
  version: QUESTION_VERSION,
  postId,
  answers: { is_event: isEvent, status: 'none', category: 'none', store: 'bicqlo' }
})

const extract = (postId: string, isEvent: number) => ({
  key: postId,
  model: JUDGE_MODEL,
  version: EXTRACT_VERSION,
  postId,
  isEvent,
  events: []
})

const clef = (postId: string, model: string, noul: number) => ({
  postId,
  model,
  kind: 'gold',
  response: { answers: { is_event: { type: 'noul', noul } } }
})

describe('readJudgements', () => {
  test('LLM は extract を優先し、extract が無い投稿だけ judge を使う', async () => {
    const root = await cacheDir()
    const { judge: judgeDir, extract: extractDir } = dirs(root)
    await put(judgeDir, 'a.json', judge('1', 0.1))
    await put(judgeDir, 'b.json', judge('2', 0.2))
    await put(extractDir, 'c.json', extract('1', 0.9))
    await put(extractDir, 'd.json', extract('3', 1))
    const judgements = await readJudgements(root)
    expect(judgements.llm).toEqual(
      new Map([
        ['1', 0.9],
        ['2', 0.2],
        ['3', 1]
      ])
    )
    expect(judgements.clef.size).toBe(0)
    expect(judgements.invalid).toBe(0)
  })

  test('Clef は同じ投稿に clef と clef-flash があれば clef を使い、ファイル名の並びには依らない', async () => {
    const root = await cacheDir()
    const { clef: clefDir } = dirs(root)
    // clef のファイル名が clef-flash より前でも後でも clef が残る
    await put(clefDir, 'a.json', clef('1', 'clef', 0.7))
    await put(clefDir, 'b.json', clef('1', 'clef-flash', 0.2))
    await put(clefDir, 'c.json', clef('2', 'clef-flash', 0.4))
    await put(clefDir, 'd.json', clef('2', 'clef', 0.6))
    await put(clefDir, 'e.json', clef('3', 'clef-flash', 0.8))
    const judgements = await readJudgements(root)
    expect(judgements.clef).toEqual(
      new Map([
        ['1', 0.7],
        ['2', 0.6],
        ['3', 0.8]
      ])
    )
    expect(judgements.llm.size).toBe(0)
  })

  test('形が合わないファイルは数えて飛ばし、ほかの判定は読む', async () => {
    const root = await cacheDir()
    const { judge: judgeDir, extract: extractDir, clef: clefDir } = dirs(root)
    await put(judgeDir, 'ok.json', judge('1', 0.3))
    await put(judgeDir, 'truncated.json', '{"postId":')
    await put(judgeDir, 'range.json', judge('2', 1.5))
    await put(judgeDir, 'string.json', { postId: '3', answers: { is_event: 'yes' } })
    await put(extractDir, 'ok.json', extract('4', 0.5))
    await put(extractDir, 'no-post.json', { isEvent: 0.5 })
    await put(clefDir, 'ok.json', clef('5', 'clef', 0.5))
    await put(clefDir, 'model.json', clef('6', 'other', 0.5))
    await put(clefDir, 'choice.json', {
      postId: '7',
      model: 'clef',
      response: { answers: { is_event: { type: 'choice', choice: 'none', probabilities: {} } } }
    })
    // 書き込み中の一時ファイルや JSON 以外は対象にしない（飛ばした数にも入れない）
    await put(judgeDir, 'ok.json.123.tmp', '{"postId":')
    await put(judgeDir, 'notes.txt', 'memo')
    const judgements = await readJudgements(root)
    expect(judgements.llm).toEqual(
      new Map([
        ['1', 0.3],
        ['4', 0.5]
      ])
    )
    expect(judgements.clef).toEqual(new Map([['5', 0.5]]))
    expect(judgements.invalid).toBe(6)
  })

  test('キャッシュのディレクトリが無ければ空で返す', async () => {
    const judgements = await readJudgements(join(await cacheDir(), 'missing'))
    expect(judgements).toEqual({ llm: new Map(), clef: new Map(), invalid: 0 })
  })

  test('一部のディレクトリだけがあっても、ある分は読む', async () => {
    const root = await cacheDir()
    await put(dirs(root).extract, 'a.json', extract('1', 0.75))
    const judgements = await readJudgements(root)
    expect(judgements.llm).toEqual(new Map([['1', 0.75]]))
    expect(judgements.clef.size).toBe(0)
  })

  test('並列度の上限（64）を超える数のファイルでも全部読む', async () => {
    const root = await cacheDir()
    const { judge: judgeDir } = dirs(root)
    const ids = Array.from({ length: 150 }, (_, index) => String(index + 1))
    await Promise.all(ids.map((id) => put(judgeDir, `${id}.json`, judge(id, Number(id) / 150))))
    const judgements = await readJudgements(root)
    expect(judgements.llm.size).toBe(150)
    expect(judgements.llm.get('150')).toBe(1)
    expect(judgements.llm.get('75')).toBe(0.5)
  })
})
