#!/usr/bin/env bun

/**
 * characters.jsonからcharacter_birthdayとis_biccame_musumeを抽出してYAMLファイルに保存するスクリプト
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify } from 'yaml'

const CHARACTERS_JSON = join(import.meta.dir, '../../public/characters.json')
const OUTPUT_FILE = join(import.meta.dir, '../archive/character_fields.yaml')

type Character = {
  key: string
  character_birthday?: string
  is_biccame_musume?: boolean
}

type CharacterFields = Record<
  string,
  {
    character: {
      birthday?: string
      is_biccame_musume?: boolean
    }
  }
>

const main = () => {
  try {
    console.log('📋 Extracting character fields...\n')

    // characters.jsonを読み込む
    const json = readFileSync(CHARACTERS_JSON, 'utf-8')
    const characters: Character[] = JSON.parse(json)

    // keyをidとして、必要なフィールドだけを抽出
    const characterFields: CharacterFields = {}
    for (const character of characters) {
      const id = character.key
      characterFields[id] = {
        character: {
          birthday: character.character_birthday,
          is_biccame_musume: character.is_biccame_musume
        }
      }
    }

    // YAMLファイルに保存
    const yaml = stringify(characterFields, { lineWidth: 0 })
    writeFileSync(OUTPUT_FILE, yaml, 'utf-8')

    console.log(`✓ Successfully extracted ${Object.keys(characterFields).length} characters`)
    console.log(`Output: ${OUTPUT_FILE}`)
  } catch (error) {
    console.error('\n✗ Error:', error)
    process.exit(1)
  }
}

main()
