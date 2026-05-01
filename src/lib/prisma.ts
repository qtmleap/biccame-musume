import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'
import type { Bindings } from '@/types/bindings'

export const getPrisma = (env: Bindings): PrismaClient => new PrismaClient({ adapter: new PrismaD1(env.DB) })
