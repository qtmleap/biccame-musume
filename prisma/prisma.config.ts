import path from 'node:path'
import type { PrismaConfig } from 'prisma'

export default {
  earlyAccess: true,
  schema: path.join('prisma', 'schema.prisma'),
  migrate: {
    async development() {
      return {
        url: process.env.DATABASE_URL ?? 'file:./dev.db',
      }
    },
  },
} satisfies PrismaConfig
