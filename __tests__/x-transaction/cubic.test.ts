import { describe, expect, test } from 'bun:test'
import { Cubic } from '../../src/lib/x-transaction/cubic'

describe('Cubic.getValue', () => {
  test('linear curve [0,0,1,1] is identity', () => {
    const c = new Cubic([0, 0, 1, 1])
    expect(c.getValue(0)).toBe(0)
    expect(c.getValue(1)).toBeCloseTo(1, 5)
    expect(c.getValue(0.5)).toBeCloseTo(0.5, 4)
  })

  test('time below 0 extrapolates by start gradient', () => {
    const c = new Cubic([0.42, 0, 0.58, 1])
    expect(c.getValue(-0.5)).toBeCloseTo(0)
  })

  test('time above 1 extrapolates by end gradient', () => {
    const c = new Cubic([0.42, 0, 0.58, 1])
    expect(c.getValue(1.5)).toBeCloseTo(1, 5)
  })

  test('ease-in curve [0.42,0,1,1] yields slow start', () => {
    const c = new Cubic([0.42, 0, 1, 1])
    expect(c.getValue(0.25)).toBeLessThan(0.25)
    expect(c.getValue(0.75)).toBeGreaterThan(0.5)
  })
})
