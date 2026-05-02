import { describe, expect, test } from 'bun:test'
import { parseHours } from '../.vscode/scripts/lib/hours'

describe('parseHours', () => {
  describe('open_all_year フラグ', () => {
    test('「年中無休」を含めば true', () => {
      expect(parseHours('10:00～21:00 年中無休').open_all_year).toBe(true)
    })

    test('含まなければ false', () => {
      expect(parseHours('10:00～21:00').open_all_year).toBe(false)
    })
  })

  describe('平日 / 土日祝パターン', () => {
    test('スラッシュ区切りで weekday + weekend を抽出する', () => {
      const result = parseHours('平日10:00～22:00 / 土日祝10:00～21:00')
      expect(result.hours).toEqual([
        { type: 'weekday', open_time: '10:00', close_time: '22:00' },
        { type: 'weekend', open_time: '10:00', close_time: '21:00' }
      ])
    })

    test('全角チルダでもマッチする', () => {
      const result = parseHours('平日10:00〜22:00 / 土日祝10:00〜21:00')
      expect(result.hours).toHaveLength(2)
      expect(result.hours[0].close_time).toBe('22:00')
    })
  })

  describe('平日・土曜 / 日曜・祝日パターン', () => {
    test('日曜帯は holiday として抽出する', () => {
      const result = parseHours('平日・土曜 10:00～20:30　日曜・祝日 10:00～20:00')
      expect(result.hours).toEqual([
        { type: 'weekday', open_time: '10:00', close_time: '20:30' },
        { type: 'holiday', open_time: '10:00', close_time: '20:00' }
      ])
    })
  })

  describe('全曜日共通パターン', () => {
    test('単一時間帯は all として抽出する', () => {
      const result = parseHours('10:00～21:00')
      expect(result.hours).toEqual([{ type: 'all', open_time: '10:00', close_time: '21:00', note: undefined }])
    })

    test('括弧内のメモを note に取り込む', () => {
      const result = parseHours('10:00～21:00（一部21:30まで）')
      expect(result.hours[0]).toEqual({
        type: 'all',
        open_time: '10:00',
        close_time: '21:00',
        note: '（一部21:30まで）'
      })
    })

    test('時間範囲が見つからない場合は空配列', () => {
      expect(parseHours('完全予約制').hours).toEqual([])
    })
  })

  describe('優先順位', () => {
    test('weekday/weekend パターンが weekday/holiday パターンより優先される', () => {
      const result = parseHours('平日10:00～22:00 / 土日祝10:00～21:00')
      expect(result.hours[1].type).toBe('weekend')
    })
  })
})
