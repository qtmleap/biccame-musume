import dayjs from 'dayjs'
import { prefectureToRegion, type RegionType } from '@/atoms/filterAtom'
import type { StoreData } from '@/schemas/store.dto'

/**
 * 名前がスラッシュで区切られている場合、最初の部分のみ返す
 */
export const getDisplayName = (name: string) => {
  return name.split('/')[0].trim()
}

/**
 * 誕生日でキャラクターをグループ化
 * 同じ誕生日のキャラクターをIDでアルファベット順にソートしてアンダーバー区切りで結合
 */
export const groupCharactersByBirthday = (characters: StoreData[]) => {
  const groups = new Map<string, StoreData[]>()

  for (const character of characters) {
    const birthday = character.character?.birthday
    if (!birthday) continue

    const key = dayjs(birthday).format('MM-DD')
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)?.push(character)
  }

  return Array.from(groups.entries())
    .map(([birthday, chars]) => {
      const sortedChars = [...chars].sort((a, b) => a.id.localeCompare(b.id))
      const groupId = sortedChars.map((c) => c.id).join('_')
      const groupName = sortedChars.map((c) => c.character?.name || c.id).join(' & ')
      return {
        id: groupId,
        birthday,
        name: groupName,
        characters: sortedChars
      }
    })
    .sort((a, b) => a.birthday.localeCompare(b.birthday))
}

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
 * 今日が誕生日かどうかを判定
 */
export const isBirthdayToday = (dateStr: string | undefined): boolean => {
  const birthday = parseDate(dateStr)
  if (!birthday) return false

  const currentTime = dayjs()
  return birthday.month() === currentTime.month() && birthday.date() === currentTime.date()
}

/**
 * 今日が誕生日のキャラクターを取得
 * 開発環境では指定されたキャラクターID（アンダーバー区切りで複数指定可）を使用
 */
export const getBirthdayCharacters = (characters: StoreData[], devCharacterId?: string): StoreData[] => {
  if (import.meta.env.DEV && devCharacterId) {
    const ids = devCharacterId.split('_')
    return characters.filter((c) => ids.includes(c.id))
  }
  if (import.meta.env.DEV) {
    const kyoto = characters.find((character) => character.id === 'kyoto')
    return kyoto ? [kyoto] : []
  }
  return characters.filter((character) => isBirthdayToday(character.character?.birthday))
}

/**
 * 誕生日が近い順にソートするための日数計算（絶対値）
 * 今日を基準に、今年と来年の誕生日のうち、より近い方の日数を返す
 */
export const getDaysFromBirthday = (dateStr: string | undefined | null): number => {
  if (!dateStr) return Number.MAX_SAFE_INTEGER
  const birthday = parseDate(dateStr)
  if (!birthday) return Number.MAX_SAFE_INTEGER

  const currentTime = dayjs()
  const thisYear = currentTime.year()
  const birthdayThisYear = dayjs().year(thisYear).month(birthday.month()).date(birthday.date())
  const birthdayNextYear = birthdayThisYear.add(1, 'year')

  // 今年の誕生日と来年の誕生日、両方との差の絶対値を計算
  const diffThisYear = Math.abs(birthdayThisYear.diff(currentTime, 'day'))
  const diffNextYear = Math.abs(birthdayNextYear.diff(currentTime, 'day'))

  // より近い方を返す
  return Math.min(diffThisYear, diffNextYear)
}

/**
 * 誕生日が近い順にソートするための日数計算
 */
export const getDaysUntilBirthday = (dateStr: string | undefined | null): number => {
  if (!dateStr) return Number.MAX_SAFE_INTEGER
  const birthday = parseDate(dateStr)
  if (!birthday) return Number.MAX_SAFE_INTEGER

  const currentTime = dayjs()
  const thisYear = currentTime.year()
  let nextBirthday = dayjs().year(thisYear).month(birthday.month()).date(birthday.date())

  if (nextBirthday.isBefore(currentTime, 'day') || nextBirthday.isSame(currentTime, 'day')) {
    nextBirthday = nextBirthday.add(1, 'year')
  }

  return nextBirthday.diff(currentTime, 'day')
}

/**
 * Fisher-Yatesアルゴリズムを使用した配列のシャッフル
 */
const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * キャラクターを娘と娘以外に分類
 */
export const categorizeCharacters = (characters: StoreData[]) => {
  const musume = characters.filter((c) => c.character?.is_biccame_musume !== false)
  const others = characters.filter((c) => c.character?.is_biccame_musume === false)
  return { musume, others }
}

/**
 * キャラクターを地域でフィルタリング
 */
export const filterCharactersByRegion = (characters: StoreData[], region: RegionType): StoreData[] => {
  if (region === 'all') return characters

  return characters.filter((character) => {
    // 都道府県フィールドから地域を判定
    const prefecture = character.prefecture
    if (!prefecture) return false
    const characterRegion = prefectureToRegion[prefecture]
    return characterRegion === region
  })
}

/**
 * キャラクターをソートする
 */
export const sortCharacters = (
  characters: StoreData[],
  sortType: 'character_birthday' | 'store_birthday' | 'upcoming_birthday' | 'random'
): StoreData[] => {
  if (sortType === 'random') {
    return shuffleArray(characters)
  }

  return [...characters].sort((a, b) => {
    if (sortType === 'character_birthday') {
      const dateA = parseDate(a.character?.birthday)
      const dateB = parseDate(b.character?.birthday)
      if (!dateA && !dateB) return 0
      if (!dateA) return 1
      if (!dateB) return -1
      return dateA.valueOf() - dateB.valueOf()
    }

    if (sortType === 'store_birthday') {
      const dateA = parseDate(a.store?.birthday)
      const dateB = parseDate(b.store?.birthday)
      if (!dateA && !dateB) return 0
      if (!dateA) return 1
      if (!dateB) return -1
      return dateA.valueOf() - dateB.valueOf()
    }

    if (sortType === 'upcoming_birthday') {
      const daysA = getDaysFromBirthday(a.character?.birthday)
      const daysB = getDaysFromBirthday(b.character?.birthday)
      return daysA - daysB
    }

    return 0
  })
}
