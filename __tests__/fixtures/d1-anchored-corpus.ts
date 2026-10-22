import { type FixtureRow, fixtureProvenance, fixtureRows, patchRow } from './expanded-corpus'

// D1起点セットの合成fixture。expanded-v2用fixtureの行を、ID接頭辞・タグ・D1参照だけ付け替えて再利用する。
export const D1_PRIOR = 786
const PREFIX = 'd1-anchored-v1'
const field = (row: FixtureRow, key: string) => row[key]
const postOf = (row: FixtureRow): FixtureRow => Object(field(row, 'post'))

const reference = (row: FixtureRow, origin: string): FixtureRow => {
  const post = postOf(row)
  return {
    eventId: crypto.randomUUID(),
    association: 'reference-url',
    referenceType: 'announce',
    referenceUrl: `https://x.com/${String(post.screenName)}/status/${String(post.id)}`,
    origin
  }
}

const renamed = (row: FixtureRow): FixtureRow => {
  const positive = Reflect.get(Object(field(row, 'expected')), 'isEvent') === true
  const label = positive ? 'positive' : 'negative'
  const id = `${PREFIX}-${label}-${String(postOf(row).id)}`
  const observedD1 = {
    ...Object(field(row, 'observedD1')),
    referencedEvents: positive ? [reference(row, 'manual-or-seed')] : []
  }
  return patchRow(row, { id, tags: ['goal-pipeline', PREFIX, label], observedD1 })
}

export const d1Rows = (pairs: number): FixtureRow[] => fixtureRows(pairs).map(renamed)

const anchoring = (rows: FixtureRow[]) => ({
  referenceSource: 'fixture',
  eventOrigins: { 'manual-or-seed': rows.length },
  referenceRows: { total: rows.length },
  candidatePool: { distinctXStatusIds: rows.length },
  exclusions: { alreadyInPriorOrExpandedV2: 0 },
  unannotatedCandidateReasons: {},
  selectedEventOrigins: { 'manual-or-seed': rows.length / 2 },
  negativeSelection: { method: 'fixture' },
  templateFamilies: [],
  priorTemplateRelated: [],
  limitations: ['fixture']
})

// 行から再計算したprovenance。revisionとd1Anchoringを持つ以外はexpanded-v2と同じ形。
export const d1Provenance = (rows: FixtureRow[], extra: FixtureRow = {}) => ({
  ...fixtureProvenance(rows, D1_PRIOR),
  datasetRevision: 'annotated-d1-anchored-v1',
  d1Anchoring: anchoring(rows),
  ...extra
})
