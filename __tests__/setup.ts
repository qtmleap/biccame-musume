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
