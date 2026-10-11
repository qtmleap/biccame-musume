import { readFileSync, writeFileSync } from 'node:fs'
import { mapKeys, snakeCase } from 'lodash-es'
import { z } from 'zod'
import type { StoreInfo } from './types'

// スネークケース変換関数
const toSnakeCase = (obj: unknown): unknown => {
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase)
  }
  if (obj !== null && typeof obj === 'object') {
    return mapKeys(obj, (_value, key) => snakeCase(key))
  }
  return obj
}

/**
 * JSONファイルに保存（google_maps_urlとparkingを除外、スネークケースに変換）
 */
export const writeStoresJson = (stores: StoreInfo[], outputFile: string): void => {
  const storesForJson = stores.map((store) => {
    if (store.store) {
      const { google_maps_url, parking, ...restStore } = store.store
      return toSnakeCase({
        ...store,
        store: restStore
      })
    }
    return toSnakeCase(store)
  })
  const json = `${JSON.stringify(storesForJson, null, 2)}\n`
  writeFileSync(outputFile, json, 'utf-8')
}

const OutputStoreSchema = z
  .object({
    id: z.string().nonempty(),
    character: z
      .object({
        name: z.string().nonempty(),
        description: z.string(),
        twitter_id: z.string().nonempty().optional(),
        images: z.array(z.string()),
        is_biccame_musume: z.boolean()
      })
      .passthrough(),
    prefecture: z.string().nonempty().nullable(),
    coordinates: z
      .object({
        latitude: z.number(),
        longitude: z.number()
      })
      .optional()
      .nullable(),
    postal_code: z.string().nonempty().optional().nullable()
  })
  .passthrough()
const OutputStoresSchema = z.array(OutputStoreSchema).nonempty()

/**
 * 出力JSONをZodスキーマでバリデーション。失敗時は process.exit(1)
 */
export const validateOutputJson = (outputFile: string): void => {
  console.log('\n\ud83d\udd0d Validating output JSON...')
  const outputData = JSON.parse(readFileSync(outputFile, 'utf-8'))
  const validation = OutputStoresSchema.safeParse(outputData)
  if (!validation.success) {
    console.error('\n\u2717 Validation failed! Parser update required:')
    for (const issue of validation.error.issues) {
      const path = issue.path.join('.')
      const entry = typeof issue.path[0] === 'number' ? outputData[issue.path[0]] : undefined
      const id = entry?.id || 'unknown'
      console.error(`  - [${id}] ${path}: ${issue.message}`)
    }
    process.exit(1)
  }
  console.log('\u2713 Validation passed')
}
