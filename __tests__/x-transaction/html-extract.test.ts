import { describe, expect, test } from 'bun:test'
import {
  extractLoadingXAnimPaths,
  extractOnDemandFileUrl,
  extractTwitterSiteVerification
} from '../../src/lib/x-transaction/html-extract'

describe('extractTwitterSiteVerification', () => {
  test('extracts content from meta tag (name then content)', () => {
    const html = `<head><meta name="twitter-site-verification" content="ABC123XYZ" /></head>`
    expect(extractTwitterSiteVerification(html)).toBe('ABC123XYZ')
  })

  test('extracts when content comes before name', () => {
    const html = `<head><meta content="ABC123XYZ" name="twitter-site-verification" /></head>`
    expect(extractTwitterSiteVerification(html)).toBe('ABC123XYZ')
  })

  test('throws when meta tag missing', () => {
    expect(() => extractTwitterSiteVerification('<html></html>')).toThrow()
  })
})

describe('extractLoadingXAnimPaths', () => {
  const buildSvg = (i: number, second: string) =>
    `<svg viewBox="0 0 24 24" id="loading-x-anim-${i}"><g><path d="logo"/><path d="${second}"/></g></svg>`

  test('returns 4 path d values in id order', () => {
    const html = [3, 1, 0, 2].map((i) => buildSvg(i, `frame-${i}`)).join('\n')
    expect(extractLoadingXAnimPaths(html)).toEqual(['frame-0', 'frame-1', 'frame-2', 'frame-3'])
  })

  test('throws when fewer than 4 svgs', () => {
    const html = [0, 1, 2].map((i) => buildSvg(i, `f${i}`)).join('\n')
    expect(() => extractLoadingXAnimPaths(html)).toThrow(/4 loading-x-anim/)
  })

  test('throws when an svg has fewer than 2 path elements', () => {
    const broken = `<svg id="loading-x-anim-0"><g><path d="only"/></g></svg>`
    const rest = [1, 2, 3].map((i) => buildSvg(i, `f${i}`)).join('\n')
    expect(() => extractLoadingXAnimPaths(broken + rest)).toThrow(/loading-x-anim-0/)
  })
})

describe('extractOnDemandFileUrl', () => {
  test('builds the canonical abs.twimg.com URL from chunk index + hash', () => {
    const html = `something,99:"ondemand.s",99:"deadbeef",100:"other"`
    const url = extractOnDemandFileUrl(html)
    expect(url).toBe('https://abs.twimg.com/responsive-web/client-web/ondemand.s.deadbeefa.js')
  })

  test('throws when ondemand.s chunk missing', () => {
    expect(() => extractOnDemandFileUrl('<html></html>')).toThrow()
  })

  test('throws when chunk index has no hash entry', () => {
    expect(() => extractOnDemandFileUrl(`,99:"ondemand.s"`)).toThrow()
  })
})
