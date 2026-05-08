/**
 * HTML extraction helpers for x.com home page parsing.
 * Replaces the upstream Python lib's BeautifulSoup usage.
 *
 * The page structure relied upon is:
 *   <meta name="twitter-site-verification" content="...">
 *   <svg id="loading-x-anim-0..3"><g><path d="..."/><path d="..."/></g></svg>
 *
 * We extract:
 *   - the verification key (from the meta tag)
 *   - the `d` attribute of the SECOND <path> inside each loading-x-anim svg
 */

export const extractTwitterSiteVerification = (html: string): string => {
  const re = /<meta\s+[^>]*name=["']twitter-site-verification["'][^>]*content=["']([^"']+)["']/i
  const match =
    html.match(re) ?? html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']twitter-site-verification["']/i)
  if (!match) throw new Error("Couldn't extract twitter-site-verification meta tag")
  return match[1]
}

export const extractLoadingXAnimPaths = (html: string): string[] => {
  const svgRe = /<svg[^>]*\sid=["']loading-x-anim-(\d)["'][^>]*>([\s\S]*?)<\/svg>/g
  const result: { index: number; d: string }[] = []
  for (const m of html.matchAll(svgRe)) {
    const inner = m[2]
    const paths = [...inner.matchAll(/<path\b[^>]*?\sd=["']([^"']+)["']/g)]
    if (paths.length < 2) {
      throw new Error(`loading-x-anim-${m[1]}: expected >=2 <path> elements, got ${paths.length}`)
    }
    result.push({ index: Number(m[1]), d: paths[1][1] })
  }
  if (result.length !== 4) {
    throw new Error(`Expected 4 loading-x-anim svg elements, got ${result.length}`)
  }
  return result.sort((a, b) => a.index - b.index).map((r) => r.d)
}

/**
 * From the home page HTML, find the dynamic ondemand.s.<hash>a.js URL.
 * Format: ondemand.s.<hash>a.js where <hash> is referenced by the bundler chunk index.
 */
export const extractOnDemandFileUrl = (html: string): string => {
  const indexMatch = html.match(/,(\d+):["']ondemand\.s["']/)
  if (!indexMatch) throw new Error("Couldn't find ondemand.s chunk index")
  const index = indexMatch[1]
  const hashRegex = new RegExp(`,${index}:"([0-9a-f]+)"`)
  const hashMatch = html.match(hashRegex)
  if (!hashMatch) throw new Error(`Couldn't find hash for ondemand.s chunk ${index}`)
  return `https://abs.twimg.com/responsive-web/client-web/ondemand.s.${hashMatch[1]}a.js`
}
