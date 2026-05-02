import { describe, expect, test } from 'bun:test'
import { extractPrefecture } from '../.vscode/scripts/lib/prefecture'

describe('extractPrefecture', () => {
  describe('storeId override', () => {
    test('biccamera は undefined を返す（企業キャラ）', () => {
      expect(extractPrefecture(undefined, undefined, undefined, 'biccamera')).toBeUndefined()
    })

    test('camera は東京都を返す', () => {
      expect(extractPrefecture(undefined, undefined, undefined, 'camera')).toBe('東京都')
    })

    test('funato は千葉県を返す', () => {
      expect(extractPrefecture(undefined, undefined, undefined, 'funato')).toBe('千葉県')
    })

    test('tamapla は神奈川県を返す', () => {
      expect(extractPrefecture(undefined, undefined, undefined, 'tamapla')).toBe('神奈川県')
    })

    test('オーバーライド対象は他の引数より優先される', () => {
      expect(extractPrefecture('大阪府大阪市', '大阪店', undefined, 'machida')).toBe('東京都')
    })
  })

  describe('住所から抽出', () => {
    test('住所に都道府県名が含まれる場合はそれを返す', () => {
      expect(extractPrefecture('北海道札幌市中央区')).toBe('北海道')
      expect(extractPrefecture('東京都新宿区西新宿1-2-3')).toBe('東京都')
      expect(extractPrefecture('大阪府大阪市北区')).toBe('大阪府')
      expect(extractPrefecture('京都府京都市')).toBe('京都府')
    })

    test('全 47 都道府県を網羅する', () => {
      expect(extractPrefecture('青森県青森市')).toBe('青森県')
      expect(extractPrefecture('沖縄県那覇市')).toBe('沖縄県')
      expect(extractPrefecture('鹿児島県鹿児島市')).toBe('鹿児島県')
    })

    test('住所優先で店舗名は無視される', () => {
      expect(extractPrefecture('福岡県福岡市', '札幌店')).toBe('福岡県')
    })
  })

  describe('店舗名 / キャラクター名から推定', () => {
    test('住所が無く店舗名にキーワードがあれば推定する', () => {
      expect(extractPrefecture(undefined, '札幌店')).toBe('北海道')
      expect(extractPrefecture(undefined, '名古屋駅前店')).toBe('愛知県')
      expect(extractPrefecture(undefined, 'なんば店')).toBe('大阪府')
      expect(extractPrefecture(undefined, '天神2号店')).toBe('福岡県')
    })

    test('storeName が空でも characterName で推定する', () => {
      expect(extractPrefecture(undefined, '', '広島たん')).toBe('広島県')
    })

    test('storeName 優先で characterName は補完用', () => {
      expect(extractPrefecture(undefined, '岡山店', '広島たん')).toBe('岡山県')
    })
  })

  describe('デフォルト', () => {
    test('全引数 undefined の場合は東京都', () => {
      expect(extractPrefecture()).toBe('東京都')
    })

    test('どれにも該当しない場合は東京都', () => {
      expect(extractPrefecture('火星市', 'マーズ店', '火星たん', 'unknown')).toBe('東京都')
    })
  })
})
