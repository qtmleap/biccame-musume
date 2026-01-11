import { describe, expect, test } from 'bun:test'
import storesInfoJson from '../scripts/archive/stores_info.json'
import { StoresSchema } from '../src/schemas/store.dto'

/**
 * stores_info.jsonのパースと検証テスト
 * アーカイブされた店舗情報がスキーマに準拠しているかを確認
 */
describe('stores_info.json parsing', () => {
  test('JSONファイル全体がStoresSchemaに準拠していること', () => {
    const result = StoresSchema.safeParse(storesInfoJson)

    if (!result.success) {
      console.error('Validation errors:', result.error.issues)
    }

    expect(result.success).toBe(true)
  })

  test('各店舗が必須フィールドを持っていること', () => {
    const result = StoresSchema.safeParse(storesInfoJson)
    expect(result.success).toBe(true)

    if (result.success) {
      for (const store of result.data) {
        // idは必須
        expect(store.id).toBeDefined()
        expect(typeof store.id).toBe('string')
        expect(store.id.length).toBeGreaterThan(0)
      }
    }
  })

  test('営業時間のフォーマットが正しいこと', () => {
    const result = StoresSchema.safeParse(storesInfoJson)
    expect(result.success).toBe(true)

    if (result.success) {
      for (const store of result.data) {
        if (store.store?.hours && store.store?.hours.length > 0) {
          for (const hour of store.store?.hours) {
            // typeが指定された値のいずれかであること
            expect(['weekday', 'weekend', 'holiday', 'all']).toContain(hour.type)
            // openTimeとcloseTimeが存在すること
            expect(hour.open_time).toBeDefined()
            expect(hour.close_time).toBeDefined()
          }
        }
      }
    }
  })

  test('アクセス情報が正しいフォーマットであること', () => {
    const result = StoresSchema.safeParse(storesInfoJson)
    expect(result.success).toBe(true)

    if (result.success) {
      for (const store of result.data) {
        if (store.store?.access && store.store?.access.length > 0) {
          for (const accessInfo of store.store?.access) {
            // stationは必須
            expect(accessInfo.station).toBeDefined()
            expect(typeof accessInfo.station).toBe('string')
            expect(accessInfo.station.length).toBeGreaterThan(0)

            // linesは配列であること（空配列も許容）
            expect(Array.isArray(accessInfo.lines)).toBe(true)
          }
        }
      }
    }
  })

  test('座標情報が数値であること', () => {
    const result = StoresSchema.safeParse(storesInfoJson)
    expect(result.success).toBe(true)

    if (result.success) {
      for (const store of result.data) {
        if (store.coordinates) {
          expect(typeof store.coordinates.latitude).toBe('number')
          expect(typeof store.coordinates.longitude).toBe('number')

          // 緯度は-90〜90の範囲
          expect(store.coordinates.latitude).toBeGreaterThanOrEqual(-90)
          expect(store.coordinates.latitude).toBeLessThanOrEqual(90)

          // 経度は-180〜180の範囲
          expect(store.coordinates.longitude).toBeGreaterThanOrEqual(-180)
          expect(store.coordinates.longitude).toBeLessThanOrEqual(180)
        }
      }
    }
  })

  test('キャラクター情報が正しいフォーマットであること', () => {
    const result = StoresSchema.safeParse(storesInfoJson)
    expect(result.success).toBe(true)

    if (result.success) {
      for (const store of result.data) {
        if (store.character) {
          // 必須フィールドの確認
          expect(store.character.name).toBeDefined()
          expect(typeof store.character.name).toBe('string')
          expect(store.character.name.length).toBeGreaterThan(0)

          expect(store.character.description).toBeDefined()
          expect(typeof store.character.description).toBe('string')

          expect(store.character.twitter_id).toBeDefined()
          expect(typeof store.character.twitter_id).toBe('string')

          expect(Array.isArray(store.character.images)).toBe(true)
          expect(store.character.images.length).toBeGreaterThan(0)
        }
      }
    }
  })

  test('配列内の全店舗がパース可能であること', () => {
    expect(Array.isArray(storesInfoJson)).toBe(true)
    expect(storesInfoJson.length).toBeGreaterThan(0)

    const result = StoresSchema.safeParse(storesInfoJson)

    if (result.success) {
      expect(result.data.length).toBe(storesInfoJson.length)
    } else {
      // エラー時には詳細を表示
      throw new Error(`Parse failed: ${JSON.stringify(result.error.issues, null, 2)}`)
    }
  })
})
