#!/usr/bin/env bun

/**
 * 店舗HTMLから店舗情報を抽出してJSONファイルに保存するスクリプト
 */

import { join } from 'node:path'
import { applyCharacterBirthdayOverrides, mergeCalendarBirthdays } from './parse_store_info/birthdays'
import { buildStores } from './parse_store_info/build-stores'
import { loadExistingCache } from './parse_store_info/existing-cache'
import { validateOutputJson, writeStoresJson } from './parse_store_info/output'

const CACHE_DIR = join(import.meta.dir, '../archive/html_cache')
const OUTPUT_FILE = join(import.meta.dir, '../../workers/app/public/characters.json')

/**
 * メイン処理
 */
const main = async () => {
  try {
    console.log('📋 Parsing character and store HTML files...\n')

    const existing = loadExistingCache(OUTPUT_FILE)
    const stores = await buildStores(CACHE_DIR, existing)

    mergeCalendarBirthdays(stores, CACHE_DIR)
    applyCharacterBirthdayOverrides(stores)

    writeStoresJson(stores, OUTPUT_FILE)

    console.log(`\n✓ Successfully parsed ${stores.length} characters`)
    console.log(`JSON output: ${OUTPUT_FILE}`)
    validateOutputJson(OUTPUT_FILE)
  } catch (error) {
    console.error('\n✗ Error:', error)
    process.exit(1)
  }
}

if (import.meta.main) {
  main()
}
