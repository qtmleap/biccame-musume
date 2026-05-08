import { describe, expect, test } from 'bun:test'
import { base64Encode, floatToHex, isOdd, jsRound, sha256 } from '../../src/lib/x-transaction/utils'

describe('jsRound', () => {
  test('rounds .5 up (JS-style, not banker)', () => {
    expect(jsRound(0.5)).toBe(1)
    expect(jsRound(1.5)).toBe(2)
    expect(jsRound(2.5)).toBe(3)
  })

  test('rounds .49 down', () => {
    expect(jsRound(0.49)).toBe(0)
    expect(jsRound(1.49)).toBe(1)
  })

  test('handles negatives like JS Math.round (toward +Infinity)', () => {
    expect(jsRound(-0.49)).toBe(-0)
    expect(jsRound(-1.49)).toBe(-1)
    expect(jsRound(-1.5)).toBe(-1)
  })

  test('integer passthrough', () => {
    expect(jsRound(0)).toBe(0)
    expect(jsRound(7)).toBe(7)
    expect(jsRound(-3)).toBe(-3)
  })
})

describe('isOdd', () => {
  test('returns -1 for odd', () => {
    expect(isOdd(1)).toBe(-1)
    expect(isOdd(3)).toBe(-1)
    expect(isOdd(-1)).toBe(-1)
  })

  test('returns 0 for even', () => {
    expect(isOdd(0)).toBe(0)
    expect(isOdd(2)).toBe(0)
    expect(isOdd(-4)).toBe(0)
  })
})

describe('base64Encode', () => {
  test('encodes empty bytes to empty string', () => {
    expect(base64Encode(new Uint8Array())).toBe('')
  })

  test('encodes "Hello" -> SGVsbG8=', () => {
    expect(base64Encode(new TextEncoder().encode('Hello'))).toBe('SGVsbG8=')
  })

  test('encodes binary bytes', () => {
    expect(base64Encode(new Uint8Array([0, 1, 2, 3, 255]))).toBe('AAECA/8=')
  })
})

describe('floatToHex', () => {
  test('integer converts via repeated /16', () => {
    expect(floatToHex(0)).toBe('')
    expect(floatToHex(15)).toBe('F')
    expect(floatToHex(255)).toBe('FF')
    expect(floatToHex(256)).toBe('100')
  })

  test('integer with no fraction returns just the integer part', () => {
    expect(floatToHex(10)).toBe('A')
  })

  test('fraction emits hex digits after dot', () => {
    // 0.5 in hex -> .8
    expect(floatToHex(0.5)).toMatch(/^\.8/)
    // 0.25 in hex -> .4
    expect(floatToHex(0.25)).toMatch(/^\.4/)
  })

  test('combined integer + fraction', () => {
    expect(floatToHex(1.5)).toMatch(/^1\.8/)
  })
})

describe('sha256', () => {
  test('matches known digest of empty string', async () => {
    const out = await sha256('')
    const hex = Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('')
    expect(hex).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  test('matches known digest of "abc"', async () => {
    const out = await sha256('abc')
    const hex = Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('')
    expect(hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
