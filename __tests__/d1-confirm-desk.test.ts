import { expect, test } from 'bun:test'
import {
  type Confirmation,
  confirmationsFor,
  type DeskRow,
  gateOutcome,
  unmeasuredBreakdown
} from '../scripts/lib/event-detect/d1-confirm-desk'
import { planCandidate } from '../scripts/lib/event-detect/d1-confirm-plan'
import {
  distributionRow,
  passRates,
  percent,
  renderTable,
  spreadOf
} from '../scripts/lib/event-detect/d1-confirm-stats'
import { factOf } from './d1-confirm-fixtures'

const row = (index: number, overrides: Partial<DeskRow> = {}): DeskRow => ({
  caseId: 'c',
  index,
  matchedGold: 'g',
  registered: true,
  exact: true,
  storeTop: 'akiba',
  characterTop: 'akiba',
  auditSavedReasons: [],
  audit70Reasons: [],
  ...overrides
})
const confirmation = (storeYes: number | null, characterYesA: number | null): Confirmation => ({
  storeYes,
  characterYesA,
  characterYesB: characterYesA
})
const book = (entries: [number, Confirmation][]) => new Map(entries.map(([index, value]) => [`c#${index}`, value]))
const options = { threshold: 0.9, policy: 'hold', audit: 'none', characterQuestion: 'a' } as const

test('the gate keeps a candidate only when every concrete side clears the threshold', () => {
  const rows = [row(0), row(1), row(2)]
  const confirmations = book([
    [0, confirmation(0.95, 0.92)],
    [1, confirmation(0.95, 0.6)],
    [2, confirmation(0.5, 0.95)]
  ])
  expect(gateOutcome(rows, confirmations, options)).toMatchObject({ registered: 1, exact: 1, unmeasured: 0 })
  expect(gateOutcome(rows, confirmations, { ...options, threshold: 0.5 }).registered).toBe(3)
})

test('unmeasured candidates are held in one bound and passed in the other', () => {
  const rows = [row(0), row(1, { matchedGold: null, exact: null })]
  const confirmations = book([[0, confirmation(0.95, 0.95)]])
  const hold = gateOutcome(rows, confirmations, options)
  const pass = gateOutcome(rows, confirmations, { ...options, policy: 'pass' })
  expect(hold).toMatchObject({ registered: 1, unmatched: 0, unmeasured: 1 })
  expect(pass).toMatchObject({ registered: 2, unmatched: 1, unmeasured: 1 })
})

test('a special top (multiple, other, secret) is not gated, and unregistered rows never enter', () => {
  const rows = [row(0, { storeTop: 'multiple', characterTop: 'other' }), row(1, { registered: false, exact: null })]
  const confirmations = book([[0, confirmation(null, null)]])
  expect(gateOutcome(rows, confirmations, options)).toMatchObject({ registered: 1, unmeasured: 0 })
})

test('the item-count audit gate holds candidates with a review reason before the confirm gate', () => {
  const rows = [
    row(0, { auditSavedReasons: ['distribution_item_count_low_confidence'] }),
    row(1, { audit70Reasons: [] })
  ]
  const confirmations = book([
    [0, confirmation(1, 1)],
    [1, confirmation(1, 1)]
  ])
  expect(gateOutcome(rows, confirmations, options).registered).toBe(2)
  expect(gateOutcome(rows, confirmations, { ...options, audit: 'saved-0.9' }).registered).toBe(1)
  expect(gateOutcome(rows, confirmations, { ...options, audit: 'alt-0.7' }).registered).toBe(2)
})

test('confirmationsFor uses T items only and leaves a target that differs from the choice top unmeasured', () => {
  const items = planCandidate(factOf({ caseId: 'c', index: 0 }))
  const yes = (item: { kind: string }, key: string) => (item.kind === 'T' ? (key === 'store' ? 0.9 : 0.8) : 0.01)
  const map = confirmationsFor(items, yes, { store: 'store', a: 'a', b: 'b' })
  expect(map.get('c#0')).toEqual({ storeYes: 0.9, characterYesA: 0.8, characterYesB: 0.8 })
  const shifted = planCandidate(factOf({ caseId: 'c', index: 1, extractionStore: 'akiba', gold: factOf().gold }))
  const differing = shifted.map((item) => ({ ...item, storeIsChoiceTop: false }))
  expect(confirmationsFor(differing, yes, { store: 'store', a: 'a', b: 'b' }).get('c#1')?.storeYes).toBeNull()
})

test('unmeasuredBreakdown names why a registered candidate has no confirmation', () => {
  const rows = [row(0), row(1, { matchedGold: null, exact: null }), row(2)]
  const confirmations = book([
    [0, confirmation(0.9, 0.9)],
    [2, confirmation(null, 0.9)]
  ])
  expect(unmeasuredBreakdown(rows, confirmations)).toEqual({
    measured: 1,
    'no D1 match (no gold, so no T)': 1,
    'store T target differs from choice top': 1
  })
})

test('stats: quartiles, pass rates by threshold and aligned table rendering', () => {
  const spread = spreadOf([0.2, 0.4, 0.6, 0.8, 1])
  expect(spread).toMatchObject({ n: 5, min: 0.2, median: 0.6, max: 1 })
  expect(passRates([0.95, 0.85, 0.75, 0.55, 0.1]).map((value) => value.n)).toEqual([1, 2, 3, 4])
  expect(percent(null)).toBe('-')
  expect(distributionRow('x', [])[1]).toBe('0')
  const table = renderTable(['a', 'bb'], [['長い', '1']]).split('\n')
  expect(table).toHaveLength(3)
})
