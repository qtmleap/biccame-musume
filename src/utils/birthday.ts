import dayjs from 'dayjs'
import type { StoreData } from '@/schemas/store.dto'

/**
 * 誕生日画像のパスを取得
 * birth/MMDD.webp 形式で返す（例: 0123.webp）
 */
export const getBirthdayImagePath = (characters: StoreData[]): string => {
  if (characters.length === 0) return ''
  const birthday = characters[0].character?.birthday
  if (!birthday) return ''
  return `/birth/${dayjs(birthday).format('MMDD')}.webp`
}
