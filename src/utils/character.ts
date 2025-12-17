import dayjs from 'dayjs'
import type { Character } from '@/schemas/character.dto'

/**
 * 日付文字列を解析してdayjsオブジェクトに変換
 */
export const parseDate = (dateStr: string | undefined): dayjs.Dayjs | null => {
  if (!dateStr) return null
  const parsed = dayjs(dateStr)
  if (!parsed.isValid()) return null
  return parsed
}

/**
 * 誕生日が近い順にソートするための日数計算
 */
export const getDaysUntilBirthday = (dateStr: string | undefined): number => {
  const birthday = parseDate(dateStr)
  if (!birthday) return Number.MAX_SAFE_INTEGER

  const now = dayjs()
  const thisYear = now.year()
  let nextBirthday = dayjs().year(thisYear).month(birthday.month()).date(birthday.date())

  if (nextBirthday.isBefore(now, 'day') || nextBirthday.isSame(now, 'day')) {
    nextBirthday = nextBirthday.add(1, 'year')
  }

  return nextBirthday.diff(now, 'day')
}

/**
 * キャラクターをソートする
 */
export const sortCharacters = (
  characters: Character[],
  sortType: 'character_birthday' | 'store_birthday' | 'upcoming_birthday'
): Character[] => {
  return [...characters].sort((a, b) => {
    if (sortType === 'character_birthday') {
      const dateA = parseDate(a.character_birthday)
      const dateB = parseDate(b.character_birthday)
      if (!dateA && !dateB) return 0
      if (!dateA) return 1
      if (!dateB) return -1
      return dateA.valueOf() - dateB.valueOf()
    }

    if (sortType === 'store_birthday') {
      const dateA = parseDate(a.store_birthday)
      const dateB = parseDate(b.store_birthday)
      if (!dateA && !dateB) return 0
      if (!dateA) return 1
      if (!dateB) return -1
      return dateA.valueOf() - dateB.valueOf()
    }

    if (sortType === 'upcoming_birthday') {
      const daysA = getDaysUntilBirthday(a.character_birthday)
      const daysB = getDaysUntilBirthday(b.character_birthday)
      return daysA - daysB
    }

    return 0
  })
}
