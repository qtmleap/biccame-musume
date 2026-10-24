import { afterEach, expect, spyOn, test } from 'bun:test'
import {
  fetchHomePageHtml,
  fetchOnDemandFileText,
  fetchTransactionInputs,
  getOndemandFileUrl
} from '@biccame/shared/x/transaction/discovery'

const root =
  '<meta name="twitter-site-verification" content="key"><script type="module" src="https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js"></script>'
// 現行の x.com は <script src> を持たず、inline script の変数 entryHref にエントリを埋め込む。
const inlineEntry = (href: string) =>
  `<script nonce="n">!function(){var stylesheetHref="https://abs.twimg.com/x-web/x-web/assets/styles-a.css",entryHref="${href}";function startEntry(event){var script=document.createElement('script');script.src=entryHref;document.head.appendChild(script)}document.addEventListener('load',startEntry,true)}();document.currentScript.remove()</script>`
const inlineRoot = inlineEntry('https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js')
afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore()
})
function network(routes: Record<string, string | number>) {
  return spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
        const url = String(input)
        if (!(url in routes)) throw new Error(`Unexpected fetch: ${url}`)
        const value = routes[url]
        return new Response(typeof value === 'string' ? value : '', { status: typeof value === 'number' ? value : 200 })
      },
      { preconnect: () => {} }
    )
  )
}
test('discovers signer through relative static and dynamic imports', async () => {
  network({
    'https://x.com/': root,
    'https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js': 'import{x}from"./assets/sentry-filter-def.js";',
    'https://abs.twimg.com/x-web/x-web/assets/sentry-filter-def.js': 'const sign=()=>import(`./sign.o-ghi.js`)',
    'https://abs.twimg.com/x-web/x-web/assets/sign.o-ghi.js': 'signer source'
  })
  expect(await fetchTransactionInputs()).toEqual({ homePageHtml: root, ondemandFileText: 'signer source' })
})
test('keeps legacy webpack acquisition', async () => {
  const html = ',123:"ondemand.s",123:"abc123"'
  const url = 'https://abs.twimg.com/responsive-web/client-web/ondemand.s.abc123a.js'
  expect(getOndemandFileUrl(html)).toBe(url)
  network({ [url]: 'legacy signer' })
  expect(await fetchOnDemandFileText(html)).toBe('legacy signer')
})
test('reports failed script requests', async () => {
  network({ 'https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js': 503 })
  await expect(fetchOnDemandFileText(root)).rejects.toThrow('503')
})
test('rejects unknown signer without executing scripts', async () => {
  network({ 'https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js': 'globalThis.remoteExecuted=true;' })
  await expect(fetchOnDemandFileText(root)).rejects.toThrow('signer')
})
test('does not fetch hostile imported URLs', async () => {
  const fetch = network({
    'https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js':
      'import "https://evil.example/sign.o.js"; import "https://abs.twimg.com/other/sign.o.js";'
  })
  await expect(fetchOnDemandFileText(root)).rejects.toThrow('signer')
  expect(fetch.mock.calls.length).toBe(1)
})
test('reports homepage HTTP errors', async () => {
  network({ 'https://x.com/': 403 })
  await expect(fetchTransactionInputs()).rejects.toThrow('403')
})
test('falls back to home only when root has no bootstrap', async () => {
  const html = ',1:"ondemand.s",1:"abc"'
  network({
    'https://x.com/': '<html></html>',
    'https://x.com/home': html,
    'https://abs.twimg.com/responsive-web/client-web/ondemand.s.abca.js': 'legacy'
  })
  expect(await fetchTransactionInputs()).toEqual({ homePageHtml: html, ondemandFileText: 'legacy' })
})
test('bounds module discovery on a cyclic graph', async () => {
  const routes: Record<string, string> = {
    'https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js': 'import "./module0.js"'
  }
  for (let i = 0; i < 20; i++)
    routes[`https://abs.twimg.com/x-web/x-web/module${i}.js`] =
      `import "./module${i + 1}.js"; import "./entry-client-logged-out-abc.js"`
  const fetch = network(routes)
  await expect(fetchOnDemandFileText(root)).rejects.toThrow('signer')
  expect(fetch.mock.calls.length).toBeLessThanOrEqual(12)
})
test('searches relevant siblings before unrelated dependency trees', async () => {
  network({
    'https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js':
      'import "./sentry-unrelated.js"; import "./transaction-client.js";',
    'https://abs.twimg.com/x-web/x-web/sentry-unrelated.js': 'import "./irrelevant.js";',
    'https://abs.twimg.com/x-web/x-web/transaction-client.js': 'import("./sign.o-live.js")',
    'https://abs.twimg.com/x-web/x-web/sign.o-live.js': 'real signer'
  })
  expect(await fetchOnDemandFileText(root)).toBe('real signer')
})
test('follows constrained migration HTML and posts the migration form', async () => {
  const html = ',1:"ondemand.s",1:"abc"'
  const fetch = network({
    'https://x.com/': 'https://x.com/x/migrate?tok=abc',
    'https://x.com/x/migrate?tok=abc': '<form action="https://x.com/migrate"><input name="tok" value="abc"></form>',
    'https://x.com/migrate': html,
    'https://abs.twimg.com/responsive-web/client-web/ondemand.s.abca.js': 'legacy'
  })
  expect((await fetchTransactionInputs()).homePageHtml).toBe(html)
  expect(fetch.mock.calls[2]?.[1]?.method).toBe('POST')
  expect(fetch.mock.calls[2]?.[1]?.body).toBe('tok=abc')
})
test('rejects hostile migration actions without posting them', async () => {
  const fetch = network({
    'https://x.com/': '<form action="https://evil.example/migrate"><input name="tok" value="abc"></form>'
  })
  await expect(fetchTransactionInputs()).rejects.toThrow('migration')
  expect(fetch.mock.calls).toHaveLength(1)
})
test('rejects hostile HTTP redirects without following them', async () => {
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(async () => new Response('', { status: 302, headers: { location: 'https://evil.example/' } }), {
      preconnect: () => {}
    })
  )
  await expect(fetchTransactionInputs()).rejects.toThrow('redirect')
  expect(fetch.mock.calls).toHaveLength(1)
})
test('follows official HTTP homepage redirects', async () => {
  const html = ',1:"ondemand.s",1:"abc"'
  spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input)
        if (url === 'https://x.com/') return new Response('', { status: 302, headers: { location: '/home' } })
        return new Response(url === 'https://x.com/home' ? html : 'legacy')
      },
      { preconnect: () => {} }
    )
  )
  expect((await fetchTransactionInputs()).homePageHtml).toBe(html)
})
test('caps broad import graphs at twelve module requests', async () => {
  const routes: Record<string, string> = {
    'https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js': Array.from(
      { length: 20 },
      (_, i) => `import "./leaf${i}.js";`
    ).join('')
  }
  for (let i = 0; i < 20; i++) routes[`https://abs.twimg.com/x-web/x-web/leaf${i}.js`] = 'export const x=1'
  const fetch = network(routes)
  await expect(fetchOnDemandFileText(root)).rejects.toThrow('signer')
  expect(fetch.mock.calls).toHaveLength(12)
})
test('preserves an empty migration POST through an official 307 redirect', async () => {
  const calls: Array<{ url: string; method: string | undefined; body: unknown }> = []
  spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = String(input)
        calls.push({ url, method: init?.method, body: init?.body })
        if (url === 'https://x.com/') return new Response('<form action="/migrate"></form>')
        if (url === 'https://x.com/migrate')
          return new Response('', { status: 307, headers: { location: '/x/migrate' } })
        if (url === 'https://x.com/x/migrate') return new Response(',1:"ondemand.s",1:"abc"')
        return new Response('legacy')
      },
      { preconnect: () => {} }
    )
  )
  await fetchTransactionInputs()
  expect(calls.slice(1, 3).map(({ method, body }) => ({ method, body }))).toEqual([
    { method: 'POST', body: '' },
    { method: 'POST', body: '' }
  ])
})

test('acquires signer assets using Worker-supported redirect handling', async () => {
  spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.redirect === 'error') throw new Error('Workers does not support redirect: error')
        return new Response('legacy signer')
      },
      { preconnect: () => {} }
    )
  )
  expect(await fetchOnDemandFileText(',1:"ondemand.s",1:"abc"')).toBe('legacy signer')
})

test('rejects asset redirects without following their destinations', async () => {
  const requests: string[] = []
  spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        requests.push(String(input))
        if (init?.redirect !== 'manual') throw new Error('Redirects must be inspected before following')
        return new Response('', { status: 302, headers: { location: 'https://evil.example/signer.js' } })
      },
      { preconnect: () => {} }
    )
  )
  await expect(fetchOnDemandFileText(',1:"ondemand.s",1:"abc"')).rejects.toThrow('302')
  expect(requests).toEqual(['https://abs.twimg.com/responsive-web/client-web/ondemand.s.abca.js'])
})

test('discovers signer from an inline entryHref through a backtick dynamic import', async () => {
  const fetch = network({
    'https://x.com/': inlineRoot,
    'https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js':
      'import{t as e}from"./assets/rolldown-runtime-x.js";import{n as t}from"./assets/startup-dynamic-y.js";',
    'https://abs.twimg.com/x-web/x-web/assets/rolldown-runtime-x.js': 'export const t=1',
    'https://abs.twimg.com/x-web/x-web/assets/startup-dynamic-y.js':
      '$p??=R(()=>import(`./sign.o-z.js`).then(e=>e.default()),[])',
    'https://abs.twimg.com/x-web/x-web/assets/sign.o-z.js': 'inline entry signer'
  })
  expect(await fetchTransactionInputs()).toEqual({ homePageHtml: inlineRoot, ondemandFileText: 'inline entry signer' })
  // ホーム → entry → (entry の静的 import 2 本) → sign.o の順に辿る
  expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
    'https://x.com/',
    'https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js',
    'https://abs.twimg.com/x-web/x-web/assets/rolldown-runtime-x.js',
    'https://abs.twimg.com/x-web/x-web/assets/startup-dynamic-y.js',
    'https://abs.twimg.com/x-web/x-web/assets/sign.o-z.js'
  ])
})
test('accepts a homepage whose only bootstrap is an inline entryHref', async () => {
  const fetch = network({ 'https://x.com/': inlineRoot })
  expect(await fetchHomePageHtml()).toBe(inlineRoot)
  expect(fetch.mock.calls).toHaveLength(1)
})
test('deduplicates an entry present as both script src and inline entryHref', async () => {
  const html = `${root}${inlineRoot}`
  const fetch = network({
    'https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js': 'import "./assets/sign.o-dup.js";',
    'https://abs.twimg.com/x-web/x-web/assets/sign.o-dup.js': 'dup signer'
  })
  expect(await fetchOnDemandFileText(html)).toBe('dup signer')
  expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
    'https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js',
    'https://abs.twimg.com/x-web/x-web/assets/sign.o-dup.js'
  ])
})
test('ignores hostile inline entryHref values without fetching them', async () => {
  const hostile = [
    'https://evil.example/x-web/entry-client-a.js',
    'https://abs.twimg.com/other/entry-client-a.js',
    'https://abs.twimg.com/x-web/x-web/assets/startup-a.js'
  ].map(inlineEntry)
  const html = hostile.join('')
  const fetch = network({})
  await expect(fetchOnDemandFileText(html)).rejects.toThrow('searched 0 modules')
  expect(fetch.mock.calls).toHaveLength(0)
  // ホームのブートストラップとしても受理しない (ホームとフォールバックの取得のみ)
  network({ 'https://x.com/': html, 'https://x.com/home': html })
  await expect(fetchHomePageHtml()).rejects.toThrow('No usable transaction bootstrap')
})
test('fetches only the valid entry when hostile entryHref values are mixed in', async () => {
  const html = `${inlineEntry('https://evil.example/x-web/entry-client-a.js')}${inlineRoot}`
  const fetch = network({
    'https://abs.twimg.com/x-web/x-web/entry-client-logged-out-abc.js': 'import "./assets/sign.o-mix.js";',
    'https://abs.twimg.com/x-web/x-web/assets/sign.o-mix.js': 'mixed signer'
  })
  expect(await fetchOnDemandFileText(html)).toBe('mixed signer')
  expect(fetch.mock.calls).toHaveLength(2)
})
