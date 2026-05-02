const PREFECTURES = [
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
] as const

const STORE_ID_OVERRIDES: Record<string, string | null> = {
  biccamera: null,
  bicsim: null,
  oeraitan: null,
  camera: '東京都',
  funato: '千葉県',
  machida: '東京都',
  naisen: null,
  photo: '東京都',
  prosta: '東京都',
  seiseki: '東京都',
  tamapla: '神奈川県'
}

const STORE_NAME_TO_PREFECTURE: Record<string, string> = {
  札幌: '北海道',
  新潟: '新潟県',
  浜松: '静岡県',
  名古屋: '愛知県',
  京都: '京都府',
  大阪: '大阪府',
  なんば: '大阪府',
  天神: '福岡県',
  広島: '広島県',
  岡山: '岡山県',
  鹿児島: '鹿児島県',
  高槻: '大阪府',
  あべの: '大阪府',
  八尾: '大阪府'
}

export const extractPrefecture = (
  address?: string,
  storeName?: string,
  characterName?: string,
  storeId?: string
): string | undefined => {
  if (storeId && storeId in STORE_ID_OVERRIDES) {
    return STORE_ID_OVERRIDES[storeId] ?? undefined
  }

  if (address) {
    for (const pref of PREFECTURES) {
      if (address.includes(pref)) return pref
    }
  }

  const textToCheck = storeName || characterName || ''
  for (const [location, pref] of Object.entries(STORE_NAME_TO_PREFECTURE)) {
    if (textToCheck.includes(location)) return pref
  }

  return '東京都'
}