import { RouteResponseSchema } from '../../src/schemas/route.dto'
import { routeResult } from '../../src/stories/catalogue-fixtures'
import { runtime } from './runtime'

const nativeFetch = globalThis.fetch.bind(globalThis)
export const installNetworkBoundary = () => {
  const boundary = async (...[input, init]: Parameters<typeof nativeFetch>) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, location.origin)
    if (url.origin !== location.origin) {
      runtime.unexpected.push(`external fetch:${url.href}`)
      throw new Error(`Storybook blocks external fetch: ${url.href}`)
    }
    if (url.pathname === '/cdn-cgi/access/get-identity')
      return new Response(
        JSON.stringify(runtime.access ? { email: 'storybook@example.invalid', name: '合成管理者' } : {}),
        { status: runtime.access ? 200 : 401 }
      )
    if (url.pathname === '/api/directions') {
      runtime.calls.push('directions')
      return new Response(JSON.stringify(RouteResponseSchema.parse({ status: 'estimated', legs: routeResult.legs })), {
        headers: { 'content-type': 'application/json' }
      })
    }
    if (url.pathname.startsWith('/api/')) {
      runtime.unexpected.push(url.pathname)
      throw new Error(`Unhandled Storybook fetch boundary: ${url.pathname}`)
    }
    return nativeFetch(input, init)
  }
  globalThis.fetch = Object.assign(boundary, { preconnect: globalThis.fetch.preconnect })
}
