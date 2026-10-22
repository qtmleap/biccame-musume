import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// ローダーと検証を実データなしで確かめる合成fixture。検証側のdigest実装には依存せず、ここで独立に計算する。
export type FixtureRow = Record<string, unknown>

export const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]: [string, unknown]) => [key, sortKeys(item)])
    )
  return value
}
export const canon = (value: unknown) => JSON.stringify(sortKeys(value))
export const digest = (value: unknown) => sha(canon(value))

export const ARCHIVE = '.cache/event-detect/posts.jsonl'
const ANNOTATION_KEYS = ['id', 'expected', 'stageGold', 'rationale', 'tags', 'group', 'reviewStatus']

const pair = (index: number, positive: boolean): FixtureRow => {
  const label = positive ? 'positive' : 'negative'
  const postId = `9${String(index).padStart(5, '0')}${positive ? 1 : 2}`
  // 乱数風の16進列で、別ケース同士の文字3-gramがほぼ重ならないようにする。
  const noise = sha(`${label}:${index}`).slice(0, 40)
  const evidence = `川崎たん限定配布${noise}`
  const text = positive ? `【お知らせ】\n${evidence}\n${sha(`tail:${index}`).slice(0, 24)}` : `営業時間のご案内${noise}`
  const post = {
    id: postId,
    createdAt: `${2018 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-05T03:00:00.000Z`,
    screenName: `Fixture_Store${index}`,
    kind: 'original',
    text,
    url: `https://x.com/Fixture_Store${index}/status/${postId}`,
    media: []
  }
  // 偶数は登録情報が全て確定した陽性、奇数は一部が未確定の陽性。
  const ready = positive && index % 2 === 0
  const unannotated = positive
    ? ready
      ? []
      : ['conditions', 'startDate']
    : ['category', 'stores', 'characterIds', 'startDate', 'conditions']
  const confirmed = positive
    ? {
        isEvent: true,
        category: 'other',
        stores: ['kawasaki'],
        characterIds: ['kawasaki'],
        ...(ready ? { startDate: '2018-04-08', conditions: [] } : {})
      }
    : { isEvent: false }
  return {
    id: `expanded-v2-${label}-${postId}`,
    source: 'public-post',
    description: `fixture ${label} ${index}`,
    post,
    expected: confirmed,
    rationale: positive ? '本文に配布物が明記されている。' : '営業時間だけの一般案内。',
    tags: ['goal-pipeline', 'expanded-v2', label],
    group: `fixture-${label}-group-${index}`,
    reviewStatus: 'provisional',
    stageGold: {
      action: positive ? 'new' : 'not_event',
      registration: positive ? (ready ? 'ready' : 'needs_info') : 'not_applicable',
      items: positive ? [{ item: '限定配布物', evidence: [evidence] }] : [],
      groupingNote: 'fixture',
      unannotatedFields: unannotated
    },
    provenance: {
      archive: ARCHIVE,
      line: 1000 + index * 2 + (positive ? 0 : 1),
      postSha256: digest(post),
      textSha256: sha(text)
    },
    observedD1: {
      annotationUse: 'diagnostic-only-not-gold-not-model-input',
      job: null,
      candidates: [],
      referencedEvents: []
    }
  }
}

// 月×アカウントのbucketごとに陽性と陰性を1件ずつ置いた、組数pairs分の行。
export const fixtureRows = (pairs: number): FixtureRow[] =>
  Array.from({ length: pairs }, (_, index) => [pair(index, true), pair(index, false)]).flat()

const field = (row: FixtureRow, key: string) => row[key]
export const fixtureProvenance = (rows: FixtureRow[], priorCorpusCases: number) => {
  const records = rows
    .map((row) => [String(Reflect.get(Object(field(row, 'post')), 'id')), field(row, 'provenance')])
    .toSorted(([a], [b]) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0))
  const positive = rows.filter((row) => Reflect.get(Object(field(row, 'expected')), 'isEvent') === true).length
  return {
    datasetRevision: 'annotated-expanded-v2',
    annotationStatus: 'provisional-not-human-reviewed',
    cases: rows.length,
    positive,
    negative: rows.length - positive,
    sourceArchives: { [ARCHIVE]: rows.length },
    sourceRecordsSha256: digest(records),
    annotationsSha256: digest(
      rows.map((row) => Object.fromEntries(ANNOTATION_KEYS.map((key) => [key, field(row, key)])))
    ),
    yearAccountMonthMatched: true,
    priorCorpusCases
  }
}

export const writeExpandedFixture = async (directory: string, rows: FixtureRow[], provenance: unknown) => {
  await mkdir(directory, { recursive: true })
  const chunks = Array.from({ length: Math.ceil(rows.length / 20) }, (_, index) =>
    rows.slice(index * 20, index * 20 + 20)
  )
  await Promise.all(
    chunks.map((chunk, index) =>
      writeFile(join(directory, `goal-${String(index + 1).padStart(3, '0')}.json`), JSON.stringify(chunk, null, 2))
    )
  )
  await writeFile(join(directory, 'provenance.json'), JSON.stringify(provenance, null, 2))
}

// 行の一部を差し替えた複製。fixture行の改変による欠陥注入に使う。
export const patchRow = (row: FixtureRow, patch: FixtureRow): FixtureRow => ({ ...row, ...patch })
export const rowPost = (row: FixtureRow): FixtureRow => Object(field(row, 'post'))
// 本文を書き換え、出典のhashも整合させる。本文由来の欠陥だけを分離して検出させる。
export const withText = (row: FixtureRow, text: string): FixtureRow => {
  const post = { ...rowPost(row), text }
  return patchRow(row, {
    post,
    provenance: { ...Object(field(row, 'provenance')), postSha256: digest(post), textSha256: sha(text) }
  })
}
