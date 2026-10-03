import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../../.cache/b06/vite', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      ...(process.env.B06_CAPTURE === 'before'
        ? [
            {
              find: '@/app/routes/location',
              replacement: fileURLToPath(new URL('../../.cache/b06/base-location.tsx', import.meta.url))
            },
            {
              find: '@/components/location/store-list',
              replacement: fileURLToPath(new URL('../../.cache/b06/base-store-list.tsx', import.meta.url))
            }
          ]
        : []),
      { find: '@/hooks/use-auth', replacement: fileURLToPath(new URL('./auth-adapter.ts', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('../../workers/app/src', import.meta.url)) },
      {
        find: '@vis.gl/react-google-maps',
        replacement: fileURLToPath(new URL('../location-harness/maps-adapter.tsx', import.meta.url))
      }
    ]
  },
  define: { 'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify('test-only-key') },
  server: {
    fs: {
      allow: [
        fileURLToPath(new URL('../../', import.meta.url)),
        realpathSync(fileURLToPath(new URL('../../node_modules', import.meta.url)))
      ]
    },
    host: '127.0.0.1',
    port: 15464,
    strictPort: true
  }
})
