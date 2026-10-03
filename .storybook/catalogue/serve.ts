import { resolve, sep } from 'node:path'

const root = resolve('.storybook/.artifacts/build')
Bun.serve({
  hostname: '127.0.0.1',
  port: 16006,
  async fetch(request) {
    const url = new URL(request.url)
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html')
    if (!path.startsWith(root + sep)) return new Response('Forbidden', { status: 403 })
    const file = Bun.file(path)
    if (!(await file.exists())) return new Response('Not found', { status: 404 })
    return new Response(file)
  }
})
console.log('Built Storybook verification server: http://127.0.0.1:16006')
