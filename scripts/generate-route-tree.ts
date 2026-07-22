#!/usr/bin/env bun
/**
 * routeTree.gen.ts をビルド前に生成するスタンドアロンスクリプト。
 *
 * routeTree.gen.ts は gitignore されているので、フレッシュな clone や
 * `bun run build` 時 ( `tsc -b` が最初に走る) には存在しないことがある。
 * このスクリプトを `predev` / `prebuild` で走らせて確実に生成する。
 *
 * 生成設定は `vite.config.ts` の `tanstackRouter({ ... })` に合わせている。
 */
import { resolve } from 'node:path'
import { Generator, getConfig } from '@tanstack/router-generator'

const root = process.cwd()

const config = getConfig({
  target: 'react',
  autoCodeSplitting: true,
  routesDirectory: resolve(root, './src/app/routes'),
  generatedRouteTree: resolve(root, './src/app/routeTree.gen.ts')
})

const generator = new Generator({ config, root })
await generator.run()

console.log('routeTree.gen.ts generated at src/app/routeTree.gen.ts')
