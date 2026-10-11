import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import dayjs from 'dayjs'
import { defineConfig, loadEnv } from 'vite'
import { intlayer } from 'vite-intlayer'
import { VitePWA } from 'vite-plugin-pwa'
import sitemap from 'vite-plugin-sitemap'
import { eventDetectProxy } from './vite-plugins/event-detect-proxy.ts'

const appRoot = import.meta.dirname
const repoRoot = resolve(appRoot, '../..')
const version = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf-8')).version
const hash = execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim()
const buildAt = dayjs().toISOString()

export default defineConfig(({ mode, command }) => {
  // Cloudflare の環境選択も Vite と同じルートの環境ディレクトリを使用する。
  Object.assign(process.env, loadEnv(mode, repoRoot, ['CLOUDFLARE_', 'WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_']))
  return {
    root: appRoot,
    envDir: repoRoot,
    server: {
      allowedHosts: ['host.docker.internal']
    },
    plugins: [
      eventDetectProxy(),
      {
        name: 'ensure-client-dir',
        buildStart() {
          mkdirSync(resolve(appRoot, 'dist/client'), { recursive: true })
        }
      },
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: resolve(appRoot, 'src/app/routes'),
        generatedRouteTree: resolve(appRoot, 'src/app/routeTree.gen.ts')
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
        // E2E ではローカル環境の投票制限バイパスを無効にする。
        config: (current) => ({
          ...(command === 'serve' ? { services: [{ binding: 'BOT', service: 'musume-workers', entrypoint: 'BotService' }] } : {}),
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
        includeAssets: ['favicon.ico', 'icons/*.png', 'og_image.webp'],
        manifest: false, // manifest.webmanifest を直接使用
        workbox: {
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
            }
          ]
        }
      })
    ],
    build: {
      outDir: resolve(appRoot, 'dist'),
      rollupOptions: {
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
    resolve: {
      // Bun の依存ストアとの React 二重読み込みを防ぐ。
      dedupe: ['react', 'react-dom'],
      alias: [
        // satori の harfbuzz を同梱 WASM を使用する Workers 版へ置換する。
        { find: /^harfbuzzjs$/, replacement: resolve(appRoot, 'src/api/lib/harfbuzz-workers.ts') },
        { find: '@api', replacement: resolve(appRoot, 'src/api') },
        { find: '@', replacement: resolve(appRoot, 'src/app') }
      ]
    },
    define: {
      global: 'globalThis',
      __APP_VERSION__: JSON.stringify(version),
      __GIT_HASH__: JSON.stringify(hash),
      __BUILD_AT__: JSON.stringify(buildAt),
      __AUTH_DOMAIN__: JSON.stringify(mode === 'production' ? 'biccame-musume.com' : 'dev.biccame-musume.com')
    }
  }
})
