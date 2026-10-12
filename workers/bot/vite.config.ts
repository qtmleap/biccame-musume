import { resolve } from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig, loadEnv } from 'vite'

const botRoot = import.meta.dirname
const repoRoot = resolve(botRoot, '../..')

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, repoRoot, ['CLOUDFLARE_', 'WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_']))
  return {
    root: botRoot,
    envDir: repoRoot,
    plugins: [cloudflare({
      configPath: resolve(botRoot, 'wrangler.toml'),
      config: process.env.BICCAME_BOT_BOOTSTRAP === '1' ? (current) => { current.services = [] } : undefined
    })],
    build: { outDir: resolve(botRoot, 'dist') }
  }
})
