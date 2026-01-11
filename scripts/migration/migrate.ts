/**
 * Prismaマイグレーションをリセットして作り直すスクリプト
 */

import { existsSync } from 'node:fs'
import { $ } from 'bun'

const main = async () => {
  console.log('🔄 マイグレーションをリセット中...')

  // prisma/migrations ディレクトリを削除
  if (existsSync('prisma/migrations')) {
    await $`rm -rf prisma/migrations`
    console.log('  ✓ prisma/migrations を削除しました')
  }

  // prisma/dev.db を削除
  if (existsSync('prisma/dev.db')) {
    await $`rm -f prisma/dev.db`
    console.log('  ✓ prisma/dev.db を削除しました')
  }

  // マイグレーションを作成して適用
  console.log('\n🚀 新しいマイグレーションを作成中...')
  await $`bunx prisma migrate dev --create-only`

  console.log('\n✅ 完了！')
}

main().catch(console.error)
