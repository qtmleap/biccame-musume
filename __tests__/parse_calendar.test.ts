import { describe, expect, test } from 'bun:test'
import { parseCalendarHtml } from '../.vscode/scripts/parsers/calendar'

const buildCell = (day: number, opts: { gray?: boolean; entries?: { key: string; label: string }[] } = {}): string => {
  const style = opts.gray ? 'color:#CCCCCC;height:100px;' : 'height:100px;'
  const entries = (opts.entries ?? [])
    .map(
      ({ key, label }) =>
        `<a href='https://biccame.jp/profile/${key}.html' target='_blank'><img src='x.png' width='18'>${label}</a>`
    )
    .join('')
  return `<td class='days wd1' style='${style}'><div>${day}</div>${entries}</td>`
}

const wrapTable = (cells: string[]): string => `
<table class='calendar1'>
<tr class='calendardateheaders1'><th>日</th></tr>
<tr>${cells.join('')}</tr>
</table>`

describe('parseCalendarHtml', () => {
  test('擬人化N周年から character_birthday を抽出 (year - N)', () => {
    const html = wrapTable([buildCell(26, { entries: [{ key: 'nagoya', label: 'なごやたん擬人化10周年' }] })])
    const result = parseCalendarHtml(html, 2026, 4)
    expect(result.nagoya?.character_birthday).toBe('2016-04-26')
  })

  test('店舗誕生N周年から store_birthday を抽出', () => {
    const html = wrapTable([buildCell(10, { entries: [{ key: 'nanba', label: 'なんばたん店舗誕生25周年' }] })])
    const result = parseCalendarHtml(html, 2026, 5)
    expect(result.nanba?.store_birthday).toBe('2001-05-10')
  })

  test('擬人化記念日 (デビュー年) は year - 0 として扱う', () => {
    const html = wrapTable([buildCell(14, { entries: [{ key: 'itt', label: 'いっとーたん擬人化記念日' }] })])
    const result = parseCalendarHtml(html, 2026, 3)
    expect(result.itt?.character_birthday).toBe('2026-03-14')
  })

  test('店舗誕生記念日 (新規店) も year - 0 として扱う', () => {
    const html = wrapTable([buildCell(20, { entries: [{ key: 'aitawa', label: 'あいタワたん店舗誕生記念日' }] })])
    const result = parseCalendarHtml(html, 2026, 6)
    expect(result.aitawa?.store_birthday).toBe('2026-06-20')
  })

  test('グレーアウトした隣月セルは無視する', () => {
    const html = wrapTable([
      buildCell(26, { gray: true, entries: [{ key: 'nagoya', label: 'なごやたん擬人化10周年' }] }),
      buildCell(1)
    ])
    const result = parseCalendarHtml(html, 2026, 5)
    expect(result.nagoya).toBeUndefined()
  })

  test('1セル内の複数キャラを個別に抽出する', () => {
    const html = wrapTable([
      buildCell(14, {
        entries: [
          { key: 'hachioji', label: '八王子たん擬人化11周年' },
          { key: 'kashiwa', label: '柏たん擬人化11周年' }
        ]
      })
    ])
    const result = parseCalendarHtml(html, 2026, 5)
    expect(result.hachioji?.character_birthday).toBe('2015-05-14')
    expect(result.kashiwa?.character_birthday).toBe('2015-05-14')
  })

  test('同じ日に擬人化と店舗誕生が両方あれば両方マージする', () => {
    const html = wrapTable([
      buildCell(23, {
        entries: [
          { key: 'shinjyuku', label: '新宿西口たん擬人化10周年' },
          { key: 'shinjyuku', label: '新宿西口たん店舗誕生24周年' }
        ]
      })
    ])
    const result = parseCalendarHtml(html, 2026, 5)
    expect(result.shinjyuku?.character_birthday).toBe('2016-05-23')
    expect(result.shinjyuku?.store_birthday).toBe('2002-05-23')
  })

  test('day が <div class="today"> の場合も抽出できる', () => {
    const html = wrapTable([
      `<td class='days wd5' style='height:100px;'><div class='today'>1</div><a href='https://biccame.jp/profile/foo.html'><img src='x.png'>ふーたん擬人化1周年</a></td>`
    ])
    const result = parseCalendarHtml(html, 2026, 5)
    expect(result.foo?.character_birthday).toBe('2025-05-01')
  })

  test('未知のラベル形式は黙って無視する', () => {
    const html = wrapTable([buildCell(15, { entries: [{ key: 'bar', label: 'ばーたんイベント開催' }] })])
    const result = parseCalendarHtml(html, 2026, 5)
    expect(result.bar).toBeUndefined()
  })
})
