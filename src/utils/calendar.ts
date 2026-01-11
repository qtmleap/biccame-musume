import dayjs from 'dayjs'
import type { StoreData } from '@/schemas/store.dto'

/**
 * 年齢/周年を計算する(対象年を指定)
 */
export const calculateYears = (birthday: string, targetYear: number): number => {
  const birthDate = dayjs(birthday)
  return targetYear - birthDate.year()
}

export type CalendarEvent = {
  date: string
  character: StoreData
  type: 'character' | 'store'
  years: number
}

/**
 * 指定月のイベントをフィルタリングする
 */
export const filterMonthEvents = (
  characters: StoreData[],
  targetMonth: number,
  targetYear: number
): CalendarEvent[] => {
  const events: CalendarEvent[] = []

  characters.forEach((character) => {
    // キャラクター誕生日のチェック
    if (character.character?.birthday) {
      const birthDate = dayjs(character.character.birthday)
      if (birthDate.month() + 1 === targetMonth) {
        events.push({
          date: character.character.birthday,
          character,
          type: 'character',
          years: calculateYears(character.character.birthday, targetYear)
        })
      }
    }

    // 店舗誕生日のチェック
    if (character.store?.birthday) {
      const birthDate = dayjs(character.store.birthday)
      if (birthDate.month() + 1 === targetMonth) {
        events.push({
          date: character.store.birthday,
          character,
          type: 'store',
          years: calculateYears(character.store.birthday, targetYear)
        })
      }
    }
  })

  // 日付順にソート(日のみで比較)
  return events.sort((a, b) => {
    const dayA = dayjs(a.date).date()
    const dayB = dayjs(b.date).date()
    return dayA - dayB
  })
}

/**
 * 日付をフォーマットする関数
 */
export const formatDate = (dateString: string): string => {
  return dayjs(dateString).format('YYYY年M月D日')
}
