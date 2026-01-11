/**
 * キャラクターデータに都道府県情報を追加し、名前の重複部分を省略するスクリプト
 */
import fs from 'node:fs'
import path from 'node:path'

const charactersPath = path.join(__dirname, '..', 'public', 'characters.json')
const characters = JSON.parse(fs.readFileSync(charactersPath, 'utf-8'))

/**
 * addressから都道府県を抽出
 */
const extractPrefecture = (address: string | undefined): string | undefined => {
  if (!address) return undefined

  const prefectures = [
    '北海道',
    '青森県',
    '岩手県',
    '宮城県',
    '秋田県',
    '山形県',
    '福島県',
    '茨城県',
    '栃木県',
    '群馬県',
    '埼玉県',
    '千葉県',
    '東京都',
    '神奈川県',
    '新潟県',
    '富山県',
    '石川県',
    '福井県',
    '山梨県',
    '長野県',
    '岐阜県',
    '静岡県',
    '愛知県',
    '三重県',
    '滋賀県',
    '京都府',
    '大阪府',
    '兵庫県',
    '奈良県',
    '和歌山県',
    '鳥取県',
    '島根県',
    '岡山県',
    '広島県',
    '山口県',
    '徳島県',
    '香川県',
    '愛媛県',
    '高知県',
    '福岡県',
    '佐賀県',
    '長崎県',
    '熊本県',
    '大分県',
    '宮崎県',
    '鹿児島県',
    '沖縄県'
  ]

  for (const pref of prefectures) {
    if (address.startsWith(pref)) {
      return pref
    }
  }

  return undefined
}

/**
 * character_nameの重複部分を省略
 * 例: 京都たん/京都たん → 京都たん
 */
const simplifyCharacterName = (name: string): string => {
  if (!name.includes('/')) return name

  const [first, second] = name.split('/')
  if (first.trim() === second.trim()) {
    return first.trim()
  }

  return name
}

// 各キャラクターに都道府県を追加し、名前を整形
const updatedCharacters = characters.map((char: any) => {
  const prefecture = extractPrefecture(char.address)
  const simplified_name = simplifyCharacterName(char.character_name)

  return {
    character_name: simplified_name,
    store_name: char.store_name,
    detail_url: char.detail_url,
    key: char.key,
    description: char.description,
    ...(char.profile_image_url && { profile_image_url: char.profile_image_url }),
    ...(char.twitter_url && { twitter_url: char.twitter_url }),
    ...(char.zipcode && { zipcode: char.zipcode }),
    ...(char.address && { address: char.address }),
    ...(prefecture && { prefecture }),
    ...(char.store_birthday && { store_birthday: char.store_birthday }),
    ...(char.store_link && { store_link: char.store_link }),
    ...(char.image_urls && { image_urls: char.image_urls }),
    ...(char.character_birthday && { character_birthday: char.character_birthday }),
    ...(char.latitude !== undefined && { latitude: char.latitude }),
    ...(char.longitude !== undefined && { longitude: char.longitude }),
    is_biccame_musume: char.is_biccame_musume ?? true
  }
})

// JSONファイルに書き込み
fs.writeFileSync(charactersPath, JSON.stringify(updatedCharacters, null, 2) + '\n', 'utf-8')

console.log(`Updated ${updatedCharacters.length} characters with prefecture data`)
console.log('Sample:', updatedCharacters[0])
