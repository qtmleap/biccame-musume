import { describe, expect, test } from 'bun:test'
import { convertRotationToMatrix } from '../../src/lib/x-transaction/rotation'

describe('convertRotationToMatrix', () => {
  test('0 degrees -> identity-like [cos,−sin,sin,cos] = [1,0,0,1]', () => {
    const m = convertRotationToMatrix(0)
    expect(m[0]).toBeCloseTo(1)
    expect(m[1]).toBeCloseTo(0)
    expect(m[2]).toBeCloseTo(0)
    expect(m[3]).toBeCloseTo(1)
  })

  test('90 degrees -> [0,−1,1,0]', () => {
    const m = convertRotationToMatrix(90)
    expect(m[0]).toBeCloseTo(0, 5)
    expect(m[1]).toBeCloseTo(-1, 5)
    expect(m[2]).toBeCloseTo(1, 5)
    expect(m[3]).toBeCloseTo(0, 5)
  })

  test('180 degrees -> [-1,0,0,-1]', () => {
    const m = convertRotationToMatrix(180)
    expect(m[0]).toBeCloseTo(-1, 5)
    expect(m[1]).toBeCloseTo(0, 5)
    expect(m[2]).toBeCloseTo(0, 5)
    expect(m[3]).toBeCloseTo(-1, 5)
  })
})
