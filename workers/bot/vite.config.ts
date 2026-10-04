import { resolve } from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  root: import.meta.dirname,
  envDir: resolve(import.meta.dirname, '../..'),
  plugins: [cloudflare({
    configPath: resolve(import.meta.dirname, 'wrangler.toml'),
    config: process.env.BICCAME_BOT_BOOTSTRAP === '1' ? (current) => { current.services = [] } : undefined
  })],
  build: { outDir: resolve(import.meta.dirname, 'dist') }
})
