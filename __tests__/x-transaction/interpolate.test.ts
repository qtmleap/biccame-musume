import { describe, expect, test } from 'bun:test'
import { interpolate } from '../../src/lib/x-transaction/interpolate'

describe('interpolate', () => {
  test('f=0 returns from', () => {
    expect(interpolate([1, 2, 3], [10, 20, 30], 0)).toEqual([1, 2, 3])
  })

  test('f=1 returns to', () => {
    expect(interpolate([1, 2, 3], [10, 20, 30], 1)).toEqual([10, 20, 30])
  })

  test('f=0.5 returns midpoints', () => {
    expect(interpolate([0, 0], [10, 20], 0.5)).toEqual([5, 10])
  })

  test('mismatched lengths throw', () => {
    expect(() => interpolate([1], [1, 2], 0.5)).toThrow()
  })
})
