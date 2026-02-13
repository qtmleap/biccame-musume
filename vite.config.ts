import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import { intlayer } from 'vite-intlayer' // Add the plugin to the Vite plugin list
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { VitePWA } from 'vite-plugin-pwa'
import sitemap from 'vite-plugin-sitemap'

const version = JSON.parse(readFileSync('./package.json', 'utf-8')).version
const hash = execSync('git rev-parse --short HEAD').toString().trim()

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    server: {
      port: 5173,
      proxy: {}
    },
    plugins: [
      {
        name: 'build-info',
        buildStart() {
          console.log(`Building app version: ${version} (git hash: ${hash}) in ${mode} mode`)
        }
      },
      {
        name: 'ensure-client-dir',
        buildStart() {
          mkdirSync('dist/client', { recursive: true })
        }
      },
      nodePolyfills({
        include: ['path'],
        exclude: ['http'],
        globals: {
          Buffer: true,
          global: true,
          process: true
        },
        overrides: {
          fs: 'memfs'
        },
        protocolImports: true
      }),
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: resolve(__dirname, './src/app/routes'),
        generatedRouteTree: resolve(__dirname, './src/app/routeTree.gen.ts')
      }),
      react(),
      cloudflare({
        configPath: './wrangler.toml',
      }),
      tailwindcss(),
      intlayer(),
      sitemap({
        hostname: 'https://biccame-musume.com',
        dynamicRoutes: ['/', '/about', '/calendar', '/characters', '/contact', '/location', '/ranking'],
        changefreq: 'weekly',
        outDir: 'dist/client'
      }),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icons/*.png', 'og_image.webp'],
        manifest: false, // manifest.webmanifestを直接使用
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1年
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1年
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
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
            {
              urlPattern: /\/api\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 10,
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 5 // 5分
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/, /\/__\/auth/]
        },
        devOptions: {
          enabled: true,
          type: 'module'
        }
      })
    ],
    build: {
      rollupOptions: {
        external: [],
        output: {
          manualChunks: {
            router: ['@tanstack/react-router'],
            query: ['@tanstack/react-query'],
            ui: [
              '@radix-ui/react-dialog',
              '@radix-ui/react-popover',
              '@radix-ui/react-select',
              '@radix-ui/react-avatar',
              '@radix-ui/react-alert-dialog'
            ],
            utils: ['axios', 'dayjs'],
            react: ['react', 'react-dom']
          }
        }
      },
      target: 'esnext',
      minify: true
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
      alias: {
        '@': resolve(__dirname, './src'),
        '.prisma/client/default': './node_modules/.prisma/client/default.js'
      },
    },
    optimizeDeps: {
      include: ['sonner'],
      esbuildOptions: {
        define: {
          global: 'globalThis'
        },
        drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : []
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __GIT_HASH__: JSON.stringify(hash)
    },
    envPrefix: 'VITE_'
  }
})
