import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type CalendarBirthday, parseCalendarHtml } from '../parsers/calendar'
import type { StoreInfo } from './types'

/**
 * 擬人化記念日はカレンダーの「擬人化N周年」表記から逆算するため、
 * 初年度のキャラはどこにも載らず取得できない。掲載され次第カレンダー側が優先される。
 * profile ページの「店舗誕生日」は開店日であって擬人化記念日ではないので流用できない。
 */
const CHARACTER_BIRTHDAY_OVERRIDES: Record<string, string> = {
  urawa: '2026-08-26'
}

/**
 * すべてのカレンダーHTMLから誕生日マップを構築
 */
const buildCalendarBirthdayMap = (cacheDir: string): Record<string, CalendarBirthday> => {
  const map: Record<string, CalendarBirthday> = {}
  const files = readdirSync(cacheDir)
    .filter((file) => file.startsWith('calendar_') && file.endsWith('.html'))
    .sort()

  for (const file of files) {
    const fileMatch = file.match(/^calendar_(\d{4})_(\d{2})\.html$/)
    if (!fileMatch) continue
    const year = Number.parseInt(fileMatch[1], 10)
    const month = Number.parseInt(fileMatch[2], 10)

    const html = readFileSync(join(cacheDir, file), 'utf-8')
    const monthMap = parseCalendarHtml(html, year, month)
    for (const [key, entry] of Object.entries(monthMap)) {
      map[key] ??= {}
      if (entry.character_birthday) map[key].character_birthday = entry.character_birthday
      if (entry.store_birthday) map[key].store_birthday = entry.store_birthday
    }
  }

  return map
}

/**
 * カレンダーHTMLの誕生日を店舗情報にマージ
 */
export const mergeCalendarBirthdays = (stores: StoreInfo[], cacheDir: string): void => {
  // カレンダーHTMLから誕生日マップを構築してマージ
  console.log('\n📋 Merging birthday data from calendar HTML...')
  const calendarBirthdayMap = buildCalendarBirthdayMap(cacheDir)
  const calendarKeyCount = Object.keys(calendarBirthdayMap).length
  if (calendarKeyCount === 0) {
    console.warn('  ⚠️ No calendar HTML found. Run "Fetch HTML Cache" first.')
  } else {
    console.log(`  ✓ Loaded ${calendarKeyCount} keys from calendar HTML`)
    for (const store of stores) {
      const entry = calendarBirthdayMap[store.id]
      if (!entry) continue
      if (entry.character_birthday) {
        store.character.birthday = entry.character_birthday
      }
      if (entry.store_birthday && store.store && !store.store.birthday) {
        store.store.birthday = entry.store_birthday
      }
    }
    console.log('✓ Birthday data merged from calendar')
  }
}

/**
 * カレンダーに載らないキャラクターの擬人化記念日を補完
 */
export const applyCharacterBirthdayOverrides = (stores: StoreInfo[]): void => {
  for (const store of stores) {
    const override = CHARACTER_BIRTHDAY_OVERRIDES[store.id]
    if (override && !store.character.birthday) {
      store.character.birthday = override
      console.log(`  ✓ Applied character birthday override: ${store.id} → ${override}`)
    }
  }
}
