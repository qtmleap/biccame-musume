import { resolve } from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'
import { botAppBinding } from '../../scripts/worker-bindings'

export default defineConfig({
  root: import.meta.dirname,
  envDir: resolve(import.meta.dirname, '../..'),
  plugins: [cloudflare({
    configPath: resolve(import.meta.dirname, 'wrangler.toml'),
    config: process.env.BICCAME_BOT_RPC === '1' ? { services: [botAppBinding(process.env.CLOUDFLARE_ENV)] } : undefined
  })],
  build: { outDir: resolve(import.meta.dirname, 'dist') }
})
