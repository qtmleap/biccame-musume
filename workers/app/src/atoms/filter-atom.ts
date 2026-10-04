import { atom } from 'jotai'
import type { Region } from '@/schemas/store.dto'

export type RegionType = Region

/**
 * キャラクター一覧専用の地域フィルター。
 * 初訪問は全国を表示し、イベント検索のURL条件とは共有しない。
 */
export const regionFilterAtom = atom<RegionType>('all')

/**
 * 都道府県から地域へのマッピング
 * 'all'は絞り込み用なのでマッピングには含めない
 */
export const prefectureToRegion: Record<string, Exclude<RegionType, 'all'>> = {
  北海道: 'hokkaido',
  茨城県: 'kanto',
  栃木県: 'kanto',
  群馬県: 'kanto',
  埼玉県: 'kanto',
  千葉県: 'kanto',
  東京都: 'kanto',
  神奈川県: 'kanto',
  新潟県: 'kanto',
  富山県: 'chubu',
  石川県: 'chubu',
  福井県: 'chubu',
  山梨県: 'chubu',
  長野県: 'chubu',
  岐阜県: 'chubu',
  静岡県: 'chubu',
  愛知県: 'chubu',
  三重県: 'kansai',
  滋賀県: 'kansai',
  京都府: 'kansai',
  大阪府: 'kansai',
  兵庫県: 'kansai',
  奈良県: 'kansai',
  和歌山県: 'kansai',
  鳥取県: 'kansai',
  島根県: 'kansai',
  岡山県: 'kansai',
  広島県: 'kansai',
  山口県: 'kansai',
  徳島県: 'kansai',
  香川県: 'kansai',
  愛媛県: 'kansai',
  高知県: 'kansai',
  福岡県: 'kyushu',
  佐賀県: 'kyushu',
  長崎県: 'kyushu',
  熊本県: 'kyushu',
  大分県: 'kyushu',
  宮崎県: 'kyushu',
  鹿児島県: 'kyushu'
}
