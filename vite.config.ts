import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
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
        configPath: './wrangler.toml'
      }),
      tailwindcss(),
      sitemap({
        hostname: 'https://biccame-musume.com',
        dynamicRoutes: [
          '/',
          '/about',
          '/calendar',
          '/characters',
          '/contact',
          '/location',
          '/ranking'
        ],
        changefreq: 'weekly',
      })
    ],
    build: {
      rollupOptions: {
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
            react: ['react', 'react-dom'],
          }
        }
      },
      target: 'esnext'
    },
    worker: {
      format: 'es'
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    },
    optimizeDeps: {
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
