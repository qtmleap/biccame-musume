import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { intlayer } from 'vite-intlayer' // Add the plugin to the Vite plugin list
import { VitePWA } from 'vite-plugin-pwa'
import sitemap from 'vite-plugin-sitemap'
import { linkLocalEnvironmentFiles, localEnvironmentFiles } from './local-env'
import { eventDetectViewer } from '../../scripts/lib/event-detect/vite-plugin'
import { appBotBinding } from '../../scripts/worker-bindings'

const appRoot = import.meta.dirname
const repoRoot = resolve(appRoot, '../..')
const version = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf-8')).version
const hash = execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim()
const buildAt = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  // Cloudflare の環境選択も Vite と同じルートの環境ディレクトリを使用する。
  Object.assign(process.env, loadEnv(mode, repoRoot, ['CLOUDFLARE_', 'WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_']))
  if (command === 'serve') linkLocalEnvironmentFiles(repoRoot, appRoot, process.env.CLOUDFLARE_ENV)
  return {
    root: appRoot,
    envDir: repoRoot,
    server: {
      port: 5173,
      proxy: {}
    },
    plugins: [
      // /__event-detect/ でイベント検出のデバッグビューワを開く（serve のみ）。Worker より先に処理させる
      eventDetectViewer({ repoRoot, now: () => new Date().toISOString() }),
      {
        name: 'root-local-vars',
        configureServer(server) {
          server.watcher.add(localEnvironmentFiles(process.env.CLOUDFLARE_ENV).map((name) => resolve(repoRoot, name)))
        },
        async handleHotUpdate({ file, server }) {
          if (dirname(file) === repoRoot && localEnvironmentFiles(process.env.CLOUDFLARE_ENV).includes(basename(file))) {
            await server.restart()
            return []
          }
        }
      },
      {
        name: 'build-info',
        buildStart() {
          console.log(`Building app version: ${version} (git hash: ${hash}) in ${mode} mode`)
        }
      },
      {
        name: 'ensure-client-dir',
        buildStart() {
          mkdirSync(resolve(appRoot, 'dist/client'), { recursive: true })
        }
      },
      {
        name: 'virtual-public-characters',
        resolveId(id) {
          if (id === 'virtual:public-characters') return `\0${id}`
        },
        load(id) {
          if (id === '\0virtual:public-characters') {
            const raw = readFileSync(resolve(import.meta.dirname, 'public/characters.json'), 'utf-8')
            return `export default ${raw}`
          }
        }
      },
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: resolve(import.meta.dirname, './src/app/routes'),
        generatedRouteTree: resolve(import.meta.dirname, './src/app/routeTree.gen.ts')
      }),
      react(),
      cloudflare({
        configPath: resolve(appRoot, 'wrangler.toml'),
        persistState: { path: resolve(repoRoot, '.wrangler/state') },
        auxiliaryWorkers: [
          {
            configPath: resolve(repoRoot, 'workers/bot/wrangler.toml'),
            config: command === 'serve' ? { name: 'musume-workers' } : undefined
          }
        ],
        // configPath は migration の出力パスにも使われるため、canonical な app 設定を維持する。
        // E2E は投票制限を検証する。ENVIRONMENT は localhost の CSRF 許可のため維持する。
        config: (current) => ({
          ...(command === 'serve' ? { services: [appBotBinding(process.env.CLOUDFLARE_ENV, true)] } : {}),
          ...(process.env.E2E === '1' ? { vars: { ...current.vars, VOTE_LIMIT_BYPASS: 'false' } } : {})
        })
      }),
      tailwindcss(),
      intlayer(),
      sitemap({
        hostname: 'https://biccame-musume.com',
        dynamicRoutes: ['/', '/about', '/calendar', '/characters', '/contact', '/location', '/ranking'],
        changefreq: 'weekly',
        outDir: resolve(appRoot, 'dist/client')
      }),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'icons/*.png', 'og_image.webp'],
        manifest: false, // manifest.webmanifestを直接使用
        workbox: {
          skipWaiting: false,
          clientsClaim: false,
          globPatterns: [],
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30日
                }
              }
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module'
        }
      })
    ],
    build: {
      outDir: resolve(appRoot, 'dist'),
      rollupOptions: {
        external: [],
        output: {
          manualChunks: (id) => {
            if (id.includes('@tanstack/react-router')) return 'router'
            if (id.includes('@tanstack/react-query')) return 'query'
            const radixUiPackages = [
              '@radix-ui/react-dialog',
              '@radix-ui/react-popover',
              '@radix-ui/react-select',
              '@radix-ui/react-avatar',
              '@radix-ui/react-alert-dialog'
            ]
            if (radixUiPackages.some((pkg) => id.includes(pkg))) return 'ui'
            if (id.includes('node_modules/axios') || id.includes('node_modules/dayjs')) return 'utils'
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'react'
          }
        }
      },
      target: 'esnext',
      minify: true,
      drop: mode === 'production' ? ['console', 'debugger'] : []
    },
    worker: {
      format: 'es'
    },
    ssr: {
      target: 'webworker',
      noExternal: ['@prisma/client', '@prisma/adapter-d1'],
      resolve: {
        conditions: ['workerd', 'worker', 'browser']
      }
    },
    resolve: {
      alias: [
        // satoriのharfbuzzはfs/XMLHttpRequestでWASMを探すため、同梱WASMを渡すWorkers版へ置換する。
        { find: /^harfbuzzjs$/, replacement: resolve(import.meta.dirname, './src/lib/harfbuzz-workers.ts') },
        { find: '@', replacement: resolve(import.meta.dirname, './src') }
      ],
    },
    define: {
      global: 'globalThis',
      __APP_VERSION__: JSON.stringify(version),
      __GIT_HASH__: JSON.stringify(hash),
      __BUILD_AT__: JSON.stringify(buildAt),
      __AUTH_DOMAIN__: JSON.stringify(mode === 'production' ? 'biccame-musume.com' : 'dev.biccame-musume.com')
    },
    envPrefix: 'VITE_'
  }
})
