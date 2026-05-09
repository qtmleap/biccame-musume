import type { Context } from 'hono'
import type { Bindings, Variables } from '@/types/bindings'
import { type OgMeta, resolveOgMeta } from '@/utils/og-meta'

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

type ElementHandlers = HTMLRewriterTypes.HTMLRewriterElementContentHandlers

const setContent = (value: string): ElementHandlers => ({
  element: (el) => {
    el.setAttribute('content', value)
  }
})

const setHref = (value: string): ElementHandlers => ({
  element: (el) => {
    el.setAttribute('href', value)
  }
})

const setText = (value: string): ElementHandlers => ({
  element: (el) => {
    el.setInnerContent(escapeHtml(value))
  }
})

const buildRewriter = (meta: OgMeta): HTMLRewriter => {
  const rewriter = new HTMLRewriter()
  rewriter.on('title', setText(meta.title))
  rewriter.on('meta[name="description"]', setContent(meta.description))
  rewriter.on('meta[property="og:url"]', setContent(meta.url))
  rewriter.on('meta[property="og:title"]', setContent(meta.title))
  rewriter.on('meta[property="og:description"]', setContent(meta.description))
  rewriter.on('meta[property="og:image"]', setContent(meta.image))
  rewriter.on('meta[property="og:type"]', setContent(meta.type))
  rewriter.on('meta[name="twitter:url"]', setContent(meta.url))
  rewriter.on('meta[name="twitter:title"]', setContent(meta.title))
  rewriter.on('meta[name="twitter:description"]', setContent(meta.description))
  rewriter.on('meta[name="twitter:image"]', setContent(meta.image))
  rewriter.on('link[rel="canonical"]', setHref(meta.url))
  return rewriter
}

/**
 * ASSETS が返した HTML レスポンスを受け取り、ルート毎の OGP / Twitter Card メタを
 * 書き換えて返す。X / Bluesky 等のクローラーがリンクカードを生成するときに、
 * ページ別の見た目になる。
 */
export const rewriteIndexHtml = async (c: AppContext, htmlResponse: Response): Promise<Response> => {
  const meta = await resolveOgMeta(c.env, c.req.url)
  const rewritten = buildRewriter(meta).transform(htmlResponse)

  const headers = new Headers(rewritten.headers)
  headers.set('Cache-Control', 'public, max-age=0, s-maxage=300')
  return new Response(rewritten.body, {
    status: rewritten.status,
    headers
  })
}
