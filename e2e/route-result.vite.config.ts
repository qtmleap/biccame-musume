import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { entries: ['e2e/route-result-harness.tsx', 'e2e/route-race-harness.tsx'] },
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 15300, strictPort: true }
})
