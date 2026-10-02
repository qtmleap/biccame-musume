import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  cacheDir: '.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch/b09/vite-cache',
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['e2e/route-empty-state-harness.tsx'] },
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: {
    host: '127.0.0.1',
    port: 15409,
    strictPort: true,
    fs: {
      allow: [
        fileURLToPath(new URL('..', import.meta.url)),
        fileURLToPath(new URL('../node_modules', import.meta.url)),
        realpathSync(fileURLToPath(new URL('../node_modules', import.meta.url)))
      ]
    }
  }
})
