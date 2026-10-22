import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

// 名前/アカウントはcanonical JSONから生成する。初期通知対象の40店舗は意図的に固定する。
const idsSchema = z.array(z.string().nonempty()).nonempty().refine((ids) => new Set(ids).size === ids.length)
const sourceSchema = z.array(z.object({
  id: z.string().nonempty(),
  character: z.object({ name: z.string().max(1000).optional(), twitter_id: z.string().max(1000).optional() })
})).nonempty()
const generatedSchema = z.array(z.object({
  id: z.string().nonempty(), name: z.string().nonempty(), twitter_id: z.string().nonempty()
})).nonempty()

export const buildBotStores = (input: unknown, selected: unknown) => {
  const source = sourceSchema.safeParse(input)
  const ids = idsSchema.safeParse(selected)
  if (!source.success || !ids.success) throw new Error('Invalid bot store source or selection')
  if (new Set(source.data.map((item) => item.id)).size !== source.data.length) throw new Error('Duplicate canonical store ID')
  const byId = new Map(source.data.map((item) => [item.id, item]))
  const output = generatedSchema.safeParse(ids.data.map((id) => {
    const character = byId.get(id)?.character
    return { id, name: character?.name, twitter_id: character?.twitter_id }
  }))
  if (!output.success) throw new Error('Selected bot store is missing a canonical name or account')
  if (new Set(output.data.map((item) => item.twitter_id)).size !== output.data.length) throw new Error('Duplicate canonical bot account')
  return output.data
}

// バッジの閉店判定も canonical JSON から生成し、shared の Vite 依存をなくす。
const storeStatusSourceSchema = z.array(z.object({
  id: z.string().nonempty(),
  character: z.object({ is_biccame_musume: z.boolean().default(false) }),
  store: z.unknown().optional()
})).nonempty()

export const buildClosedStoreKeys = (input: unknown) => {
  const source = storeStatusSourceSchema.safeParse(input)
  if (!source.success) throw new Error('Invalid canonical store status source')
  return source.data
    .filter((item) => item.character.is_biccame_musume && (item.store === undefined || item.store === null))
    .map((item) => item.id)
}

const detectionSourceSchema = z.array(z.object({
  id: z.string().nonempty(),
  character: z.object({ name: z.string().nonempty(), is_biccame_musume: z.boolean().default(false), twitter_id: z.string().nonempty().optional() }),
  store: z.object({ name: z.string().nonempty().optional() }).nullish()
})).nonempty()

export const buildDetectionCatalog = (input: unknown) => {
  const parsed = detectionSourceSchema.safeParse(input)
  if (!parsed.success) throw new Error('Invalid canonical detection catalog')
  return {
    stores: parsed.data.flatMap((entry) => entry.store === undefined || entry.store === null ? [] : [{ id: entry.id, name: entry.store.name === undefined ? entry.id : entry.store.name, ...(entry.character.twitter_id === undefined ? {} : { screenName: entry.character.twitter_id }) }]),
    characters: parsed.data.filter((entry) => entry.character.is_biccame_musume).map((entry) => ({ id: entry.id, name: entry.character.name }))
  }
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, '..')
  const source = JSON.parse(readFileSync(resolve(root, 'workers/web/public/characters.json'), 'utf8'))
  const selected = JSON.parse(readFileSync(resolve(root, 'packages/shared/data/bot-store-ids.json'), 'utf8'))
  const expected = `${JSON.stringify(buildBotStores(source, selected), null, 2)}\n`
  const output = resolve(root, 'packages/shared/src/generated/bot-stores.json')
  const closedOutput = resolve(root, 'packages/shared/src/generated/closed-store-keys.json')
  const closedExpected = `${JSON.stringify(buildClosedStoreKeys(source), null, 2)}\n`
  const catalogOutput = resolve(root, 'packages/shared/src/generated/detection-catalog.json')
  const catalogExpected = `${JSON.stringify(buildDetectionCatalog(source), null, 2)}\n`
  if (process.argv.includes('--check')) {
    if (readFileSync(catalogOutput, 'utf8') !== catalogExpected) throw new Error('Detection catalog is stale; run bun scripts/generate-bot-stores.ts')
    if (readFileSync(output, 'utf8') !== expected) throw new Error('Bot store data is stale; run bun scripts/generate-bot-stores.ts')
    if (readFileSync(closedOutput, 'utf8') !== closedExpected) throw new Error('Closed store data is stale; run bun scripts/generate-bot-stores.ts')
  } else {
    writeFileSync(catalogOutput, catalogExpected)
    writeFileSync(output, expected)
    writeFileSync(closedOutput, closedExpected)
  }
  console.log('Verified canonical bot store data (fixed notification coverage)')
}
