import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../../.cache/location-harness-vite', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
      '@vis.gl/react-google-maps': fileURLToPath(new URL('./maps-adapter.tsx', import.meta.url))
    }
  },
  define: { 'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify('test-only-key') },
  server: { host: '127.0.0.1', port: 15413, strictPort: true }
})
