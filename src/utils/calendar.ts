import dayjs from 'dayjs'
import type { Character } from '@/schemas/character.dto'

/**
 * 年齢/周年を計算する（対象年を指定）
 */
export const calculateYears = (birthday: string, targetYear: number): number => {
  const birthDate = new Date(birthday)
  return targetYear - birthDate.getFullYear()
}

export type CalendarEvent = {
  date: string
  character: Character
  type: 'character' | 'store'
  years: number
}

/**
 * 指定月のイベントをフィルタリングする
 */
export const filterMonthEvents = (
  characters: Character[],
  targetMonth: number,
  targetYear: number
): CalendarEvent[] => {
  const events: CalendarEvent[] = []

  characters.forEach((character) => {
    // キャラクター誕生日のチェック
    if (character.character_birthday) {
      const birthDate = new Date(character.character_birthday)
      if (birthDate.getMonth() + 1 === targetMonth) {
        events.push({
          date: character.character_birthday,
          character,
          type: 'character',
          years: calculateYears(character.character_birthday, targetYear)
        })
      }
    }

    // 店舗誕生日のチェック
    if (character.store_birthday) {
      const birthDate = new Date(character.store_birthday)
      if (birthDate.getMonth() + 1 === targetMonth) {
        events.push({
          date: character.store_birthday,
          character,
          type: 'store',
          years: calculateYears(character.store_birthday, targetYear)
        })
      }
    }
  })

  // 日付順にソート（日のみで比較）
  return events.sort((a, b) => {
    const dayA = new Date(a.date).getDate()
    const dayB = new Date(b.date).getDate()
    return dayA - dayB
  })
}

/**
 * 日付をフォーマットする関数
 */
export const formatDate = (dateString: string): string => {
  return dayjs(dateString).format('YYYY年M月D日')
}
