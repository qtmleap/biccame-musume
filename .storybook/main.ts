import { resolve } from 'node:path'
import type { StorybookConfig } from '@storybook/react-vite'
import tailwindcss from '@tailwindcss/vite'

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs'],
  framework: { name: '@storybook/react-vite', options: { builder: { viteConfigPath: '.storybook/vite.config.ts' } } },
  staticDirs: ['../public'],
  core: { disableTelemetry: true },
  async viteFinal(config) {
    config.plugins = [...(config.plugins ?? []), tailwindcss()]
    config.resolve = {
      ...config.resolve,
      alias: [
        { find: '@/utils/client', replacement: resolve(import.meta.dirname, 'mocks/client.ts') },
        { find: '@/lib/pwa-cache', replacement: resolve(import.meta.dirname, 'mocks/pwa-cache.ts') },
        { find: '@/lib/firebase', replacement: resolve(import.meta.dirname, 'mocks/firebase.ts') },
        { find: 'firebase/auth', replacement: resolve(import.meta.dirname, 'mocks/firebase.ts') },
        { find: '@vis.gl/react-google-maps', replacement: resolve(import.meta.dirname, 'mocks/maps.tsx') },
        { find: 'virtual:public-characters', replacement: resolve(import.meta.dirname, '../public/characters.json') },
        { find: '@/atoms/vote-atom', replacement: resolve(import.meta.dirname, 'mocks/vote-atom.ts') },
        { find: '@', replacement: resolve(import.meta.dirname, '../src') }
      ]
    }
    config.cacheDir = resolve(
      import.meta.dirname,
      process.env.STORYBOOK_CATALOGUE_VERIFY === '1' ? '.cache/verify' : '.cache/interactive'
    )
    config.define = {
      ...config.define,
      'import.meta.env.DEV': false,
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify('storybook-boundary'),
      __AUTH_DOMAIN__: JSON.stringify('storybook.invalid'),
      __APP_VERSION__: JSON.stringify('0.35.4-storybook'),
      __GIT_HASH__: JSON.stringify('fixture'),
      __BUILD_AT__: JSON.stringify('2026-10-02T03:00:00Z')
    }
    return config
  }
}
export default config
