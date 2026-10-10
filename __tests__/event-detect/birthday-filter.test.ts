import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { convertArchive, readPosts, readStoreBirthdays } from '../../scripts/lib/event-detect/store'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const tempDir = async () => {
  const path = await mkdtemp(join(tmpdir(), 'event-detect-birthday-'))
  directories.push(path)
  return path
}

/** 2020-05-01 の JST 0 時 = 2020-04-30T15:00:00Z */
const BIRTHDAY = Date.parse('2020-04-30T15:00:00.000Z')

const character = (id: string, fields: { twitter_id?: string; birthday?: string }) => ({
  id,
  character: { name: `キャラ ${id}`, ...fields }
})

/** characters.json を書いてパスを返す */
const charactersFile = async (characters: unknown[]) => {
  const path = join(await tempDir(), 'characters.json')
  await writeFile(path, JSON.stringify(characters))
  return path
}

/** アーカイブの 1 行。raw は X GraphQL の Tweet の形を、変換に要るところだけ再現する */
const record = (id: string, screenName: string, createdAt: string) => ({
  id,
  createdAt,
  author: { id: '1', name: '店舗', screenName },
  url: `https://x.com/${screenName}/status/${id}`,
  raw: {
    __typename: 'Tweet',
    rest_id: id,
    core: { user_results: { result: { core: { screen_name: screenName } } } },
    legacy: { id_str: id, full_text: `本文 ${id}` }
  }
})

/** レコードを JSONL のアーカイブにして変換し、結果と変換後の投稿 ID を返す */
const convert = async (records: unknown[], birthdays?: Map<string, number>) => {
  const dir = await tempDir()
  const archivePath = join(dir, 'posts.jsonl')
  const outPath = join(dir, 'out.jsonl')
  await writeFile(archivePath, `${records.map((value) => JSON.stringify(value)).join('\n')}\n`)
  const result = await convertArchive(archivePath, outPath, undefined, birthdays)
  const posts = await readPosts(outPath)
  return { result, ids: posts.map((post) => post.id) }
}

describe('readStoreBirthdays', () => {
  test('誕生日かアカウントの無いキャラは含めず、キーは小文字、値は記念日の JST 0 時', async () => {
    const path = await charactersFile([
      character('upper', { twitter_id: 'Bic_Example', birthday: '2020-05-01' }),
      character('lower', { twitter_id: 'bic_lower', birthday: '2016-09-07' }),
      character('no-birthday', { twitter_id: 'air_biccamera' }),
      character('no-account', { birthday: '2019-01-23' }),
      character('neither', {})
    ])
    const birthdays = await readStoreBirthdays(path)
    expect([...birthdays.keys()].sort()).toEqual(['bic_example', 'bic_lower'])
    expect(birthdays.get('bic_example')).toBe(BIRTHDAY)
    expect(birthdays.get('bic_lower')).toBe(Date.parse('2016-09-06T15:00:00.000Z'))
  })

  test('誕生日が日付の形でなければエラー', async () => {
    const path = await charactersFile([character('bad', { twitter_id: 'bic_bad', birthday: '2020/05/01' })])
    await expect(readStoreBirthdays(path)).rejects.toThrow()
  })
})

describe('convertArchive の記念日フィルタ', () => {
  const birthdays = new Map([['bic_example', BIRTHDAY]])

  test('記念日の JST 0 時ちょうどの投稿は残り、その 1 秒前は除く', async () => {
    const { result, ids } = await convert(
      [
        record('1', 'bic_example', '2020-04-30T14:59:59.000Z'),
        record('2', 'bic_example', '2020-04-30T15:00:00.000Z'),
        record('3', 'bic_example', '2020-04-30T15:00:01.000Z')
      ],
      birthdays
    )
    expect(ids).toEqual(['2', '3'])
    expect(result.posts).toBe(2)
  })

  test('アカウント名は大文字小文字を区別せず引く', async () => {
    const { ids } = await convert([record('1', 'BIC_Example', '2020-04-30T14:59:59.000Z')], birthdays)
    expect(ids).toEqual([])
  })

  test('Map に無いアカウントの投稿は記念日前でも残る', async () => {
    const { result, ids } = await convert(
      [record('1', 'bic_other', '2010-01-01T00:00:00.000Z'), record('2', 'bic_example', '2010-01-01T00:00:00.000Z')],
      birthdays
    )
    expect(ids).toEqual(['1'])
    expect(result.skipped).toEqual({ before_birthday: 1 })
  })

  test('skipped.before_birthday に除いた件数を数え、重複は二重に数えない', async () => {
    const { result, ids } = await convert(
      [
        record('1', 'bic_example', '2019-01-01T00:00:00.000Z'),
        record('2', 'bic_example', '2019-06-01T00:00:00.000Z'),
        // 記念日前の投稿が 2 回出ても、before_birthday は 1 件、2 回目は duplicate
        record('1', 'bic_example', '2019-01-01T00:00:00.000Z'),
        record('3', 'bic_example', '2021-01-01T00:00:00.000Z'),
        record('3', 'bic_example', '2021-01-01T00:00:00.000Z')
      ],
      birthdays
    )
    expect(ids).toEqual(['3'])
    expect(result.skipped).toEqual({ before_birthday: 2, duplicate: 2 })
    expect(result.lines).toBe(5)
    // manifest の投稿数（重複を除いた数）は posts + before_birthday と一致する
    expect(result.posts + result.skipped.before_birthday).toBe(3)
  })

  test('Map を渡さなければ従来どおり全件残る', async () => {
    const records = [
      record('1', 'bic_example', '2010-01-01T00:00:00.000Z'),
      record('2', 'bic_example', '2020-04-30T14:59:59.000Z'),
      record('3', 'bic_example', '2021-01-01T00:00:00.000Z')
    ]
    const withoutMap = await convert(records)
    expect(withoutMap.ids).toEqual(['1', '2', '3'])
    expect(withoutMap.result.skipped).toEqual({})

    const emptyMap = await convert(records, new Map())
    expect(emptyMap.ids).toEqual(['1', '2', '3'])
  })
})
