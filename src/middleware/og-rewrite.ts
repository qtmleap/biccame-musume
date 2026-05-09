import type { Context } from 'hono'
import type { Bindings, Variables } from '@/types/bindings'
import { resolveOgMeta } from '@/utils/og-meta'

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const replaceTitle = (html: string, title: string): string =>
  html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)

const replaceMetaName = (html: string, name: string, content: string): string => {
  const re = new RegExp(`<meta name="${name}" content="[^"]*"\\s*/?>`)
  return html.replace(re, `<meta name="${name}" content="${content}" />`)
}

const replaceMetaProperty = (html: string, property: string, content: string): string => {
  const re = new RegExp(`<meta property="${property}" content="[^"]*"\\s*/?>`)
  return html.replace(re, `<meta property="${property}" content="${content}" />`)
}

const replaceCanonical = (html: string, href: string): string =>
  html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${href}" />`)

/**
 * ASSETS が返した index.html を string レベルで書き換え、ルート毎の OGP / Twitter
 * Card メタを埋め込んで返す。HTMLRewriter (streaming) ではなく文字列置換で行うのは
 * X / Bluesky のクローラーが streaming 書き換え後のレスポンスでメタを認識しなかった
 * 実害があったため。新規 Response を返すので元レスポンス由来のヘッダーも引き継がない。
 */
export const rewriteIndexHtml = async (c: AppContext, htmlResponse: Response): Promise<Response> => {
  const meta = await resolveOgMeta(c.env, c.req.url)
  const html = await htmlResponse.text()

  const title = escapeHtml(meta.title)
  const description = escapeHtml(meta.description)
  const url = escapeHtml(meta.url)
  const image = escapeHtml(meta.image)
  const type = escapeHtml(meta.type)

  const injected = [
    (h: string) => replaceTitle(h, title),
    (h: string) => replaceMetaName(h, 'description', description),
    (h: string) => replaceMetaProperty(h, 'og:type', type),
    (h: string) => replaceMetaProperty(h, 'og:url', url),
    (h: string) => replaceMetaProperty(h, 'og:title', title),
    (h: string) => replaceMetaProperty(h, 'og:description', description),
    (h: string) => replaceMetaProperty(h, 'og:image', image),
    (h: string) => replaceMetaName(h, 'twitter:url', url),
    (h: string) => replaceMetaName(h, 'twitter:title', title),
    (h: string) => replaceMetaName(h, 'twitter:description', description),
    (h: string) => replaceMetaName(h, 'twitter:image', image),
    (h: string) => replaceCanonical(h, url)
  ].reduce((acc, fn) => fn(acc), html)

  return new Response(injected, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300'
    }
  })
}
