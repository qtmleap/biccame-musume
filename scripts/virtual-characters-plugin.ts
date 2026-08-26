/**
 * `virtual:public-characters` は vite.config.ts のプラグインが供給する仮想モジュールなので、
 * Vite を通さず bun から直接実行するスクリプトでは解決できない。
 * bun の plugin API で同じ中身を注入し、テストと CLI スクリプトの双方から preload して使う。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { plugin } from 'bun'

plugin({
  name: 'virtual-public-characters',
  setup(build) {
    build.module('virtual:public-characters', () => {
      const raw = readFileSync(resolve(import.meta.dir, '../public/characters.json'), 'utf-8')
      return { exports: { default: JSON.parse(raw) }, loader: 'object' }
    })
  }
})
