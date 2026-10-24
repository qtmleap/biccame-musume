import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadFacts, planCandidate, planSha256, rankedKeys } from '../scripts/lib/event-detect/d1-confirm-plan'
import { factOf, STATE, topOf } from './d1-confirm-fixtures'
import { goldEvent } from './d1-gold-fixtures'

const pair = (items: ReturnType<typeof planCandidate>) => {
  const t = items.find((item) => item.kind === 'T')
  const d = items.find((item) => item.kind === 'D')
  if (t === undefined || d === undefined) throw new Error('Expected both T and D')
  return { t, d }
}

test('rankedKeys orders by probability and breaks ties by key', () => {
  expect(rankedKeys({ b: 0.2, a: 0.2, c: 0.5 })).toEqual(['c', 'a', 'b'])
})

test('T uses the D1 store and the same-store character as an assumed answer; D uses the next wrong ones', () => {
  const { t, d } = pair(planCandidate(factOf()))
  expect(t.storeTarget).toBe('yuurakuchou')
  expect(t.characterTarget).toBe('yuurakuchou')
  expect(t.characterBasis).toBe('assumed')
  // 2 位以降の具体的な店舗のうち、D1 の正解でないものを確率の高い順に（akiba が先、multiple は具体的でないので除く）。
  expect(d.storeTarget).toBe('akiba')
  expect(d.characterTarget).toBe('nanba')
  expect(t.request.state.startsWith(STATE)).toBe(true)
})

test('an explicit D1 character is the T answer and is marked explicit', () => {
  const gold = goldEvent({ stores: ['yuurakuchou'], characterIds: ['nanba'] })
  const { t, d } = pair(planCandidate(factOf({ gold })))
  expect(t.characterTarget).toBe('nanba')
  expect(t.characterBasis).toBe('explicit')
  expect(t.characterSameIdAsStore).toBe(false)
  // 正解の娘（nanba）はひっかけにしない。最上位の yuurakuchou は 2 位以降ではないので除かれ、次は tenjin。
  expect(d.characterTarget).toBe('tenjin')
})

test('decoys never include a D1 store or the top choice, and skip special keys', () => {
  const store = topOf([
    ['yuurakuchou', 0.5],
    ['multiple', 0.3],
    ['none', 0.1],
    ['nanba', 0.05],
    ['akiba', 0.01]
  ])
  const { d } = pair(planCandidate(factOf({ store })))
  expect(d.storeTarget).toBe('nanba')
  const joint = goldEvent({ stores: ['yuurakuchou', 'nanba'] })
  expect(pair(planCandidate(factOf({ store, gold: joint }))).d.storeTarget).toBe('akiba')
})

test('flags record the confound: extraction hint, same id as store, and choice top', () => {
  const { t, d } = pair(planCandidate(factOf()))
  expect(t.storeEqualsHint).toBe(true)
  expect(d.storeEqualsHint).toBe(false)
  expect(t.characterSameIdAsStore).toBe(true)
  expect(d.characterSameIdAsStore).toBe(false)
  expect(t.storeIsChoiceTop).toBe(true)
  expect(t.characterIsChoiceTop).toBe(true)
  expect(t.storeTopProbability).toBe(0.7)
  expect(t.characterTopChoice).toBe('yuurakuchou')
  // 抽出段階の店舗が正解店舗と違う候補は、ヒントと一致しない T になる。
  const other = pair(planCandidate(factOf({ extractionStore: 'akiba' })))
  expect(other.t.storeEqualsHint).toBe(false)
})

test('a side whose saved top is special gets no target line', () => {
  const special = topOf([
    ['multiple', 0.8],
    ['yuurakuchou', 0.1]
  ])
  const onlyCharacter = planCandidate(factOf({ store: special }))
  expect(onlyCharacter.every((item) => item.storeTarget === null)).toBe(true)
  expect(onlyCharacter.every((item) => item.characterTarget !== null)).toBe(true)
  expect(onlyCharacter.every((item) => !item.request.state.includes('確認対象の開催店舗'))).toBe(true)
  const none = planCandidate(
    factOf({
      store: special,
      character: topOf([
        ['other', 0.8],
        ['nanba', 0.1]
      ])
    })
  )
  expect(none).toEqual([])
})

test('the plan hash changes when a request changes', () => {
  const first = planCandidate(factOf())
  const second = planCandidate(factOf({ state: `${STATE}\n追記` }))
  expect(planSha256(first)).toBe(planSha256(planCandidate(factOf())))
  expect(planSha256(first)).not.toBe(planSha256(second))
})

test('loadFacts keeps matched candidates only and reports a state that was never sent as a judge call', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'd1-confirm-plan-'))
  try {
    const caseId = 'd1-gold-77'
    const gold = goldEvent({ uuid: '22222222-2222-4222-8222-222222222222' })
    const top = { choice: 'yuurakuchou', probability: 0.7, probabilities: { yuurakuchou: 0.7, akiba: 0.1 } }
    const candidate = (index: number, matchedGold: string | null) => ({
      index,
      contextOnly: false,
      extractionStore: 'yuurakuchou',
      matchedGold,
      view: { store: top, character: top }
    })
    const records = [
      { caseId, completed: true, calls: 3, candidates: [candidate(0, gold.uuid), candidate(1, null)] },
      { caseId: 'd1-gold-78', completed: false, calls: 0, candidates: [] }
    ]
    const caseDirectory = join(directory, 'cases', caseId)
    await mkdir(caseDirectory, { recursive: true })
    await writeFile(join(directory, 'records.json'), JSON.stringify(records))
    await writeFile(
      join(caseDirectory, 'result.json'),
      JSON.stringify({ judgements: [{ requests: [{ state: STATE }] }, { requests: [{ state: '別' }] }] })
    )
    const call = (state: string) => JSON.stringify({ stage: 'judge', inputHash: 'x', body: { state, questions: {} } })
    await writeFile(join(caseDirectory, 'call-1.json'), call(STATE))
    const golds = new Map([[caseId, [gold]]])
    const loaded = await loadFacts(directory, golds)
    expect(loaded.facts).toHaveLength(1)
    expect(loaded.facts[0].state).toBe(STATE)
    expect(loaded.integrity).toEqual({ checkedStates: 1, stateNotInJudgeCalls: 0, skippedNoStoreOrCharacter: 0 })
    await writeFile(join(caseDirectory, 'call-1.json'), call('違う'))
    expect((await loadFacts(directory, golds)).integrity.stateNotInJudgeCalls).toBe(1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
