import { atomWithStorage } from 'jotai/utils'

export type RegionType = 'all' | 'hokkaido' | 'kanto' | 'chubu' | 'kinki' | 'kyushu'

/**
 * 地域フィルターを保存するatom
 * localStorageに永続化される
 */
export const regionFilterAtom = atomWithStorage<RegionType>('biccame-region-filter', 'all')

/**
 * 都道府県から地域へのマッピング
 */
export const prefectureToRegion: Record<string, RegionType> = {
  北海道: 'hokkaido',
  茨城県: 'kanto',
  栃木県: 'kanto',
  群馬県: 'kanto',
  埼玉県: 'kanto',
  千葉県: 'kanto',
  東京都: 'kanto',
  神奈川県: 'kanto',
  新潟県: 'chubu',
  富山県: 'chubu',
  石川県: 'chubu',
  福井県: 'chubu',
  山梨県: 'chubu',
  長野県: 'chubu',
  岐阜県: 'chubu',
  静岡県: 'chubu',
  愛知県: 'chubu',
  三重県: 'kinki',
  滋賀県: 'kinki',
  京都府: 'kinki',
  大阪府: 'kinki',
  兵庫県: 'kinki',
  奈良県: 'kinki',
  和歌山県: 'kinki',
  鳥取県: 'kinki',
  島根県: 'kinki',
  岡山県: 'kinki',
  広島県: 'kinki',
  山口県: 'kinki',
  徳島県: 'kinki',
  香川県: 'kinki',
  愛媛県: 'kinki',
  高知県: 'kinki',
  福岡県: 'kyushu',
  佐賀県: 'kyushu',
  長崎県: 'kyushu',
  熊本県: 'kyushu',
  大分県: 'kyushu',
  宮崎県: 'kyushu',
  鹿児島県: 'kyushu'
}

/**
 * 地域名のラベル
 */
export const regionLabels: Record<RegionType, string> = {
  all: 'すべて',
  hokkaido: '北海道',
  kanto: '関東',
  chubu: '中部',
  kinki: '関西',
  kyushu: '九州'
}
