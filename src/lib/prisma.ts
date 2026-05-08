import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'
import type { Bindings } from '@/types/bindings'

const clientCache = new WeakMap<D1Database, PrismaClient>()

export const getPrisma = (env: Bindings): PrismaClient => {
  const cached = clientCache.get(env.DB)
  if (cached) return cached
  const client = new PrismaClient({ adapter: new PrismaD1(env.DB) })
  clientCache.set(env.DB, client)
  return client
}
