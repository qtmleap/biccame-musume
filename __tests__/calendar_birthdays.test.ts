import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { type CalendarBirthday, parseCalendarHtml } from '../.vscode/scripts/parse_store_info'

const CACHE_DIR = join(__dirname, '..', '.vscode', 'archive', 'html_cache')

const EXPECTED: Record<string, { character?: string; store?: string }> = {
  abeno: { character: '2016-09-07', store: '2016-05-19' },
  akasaka: { character: '2019-01-23', store: '2013-06-07' },
  akiba: { character: '2017-06-05', store: '2017-06-22' },
  bicqlo: { character: '2015-05-18', store: '2012-09-27' },
  bicsim: { character: '2018-06-13' },
  camera: { character: '2016-06-29' },
  chiba: { character: '2024-12-12', store: '2022-11-01' },
  chofu: { character: '2017-09-27', store: '2017-09-29' },
  fujisawa: { character: '2016-02-12', store: '2006-08-04' },
  funabashi: { character: '2015-05-18', store: '2010-02-21' },
  funato: { character: '2017-11-15' },
  hachioji: { character: '2015-05-14', store: '2010-11-11' },
  hamamatsu: { character: '2015-05-23', store: '2008-11-20' },
  hiroshima: { character: '2016-08-24', store: '2016-09-14' },
  honten: { character: '2015-10-21', store: '1992-09-24' },
  ikenishi: { character: '2017-05-09', store: '2002-09-19' },
  itt: { character: '2026-03-14', store: '2026-03-14' },
  kagoshima: { character: '2017-12-18', store: '2010-02-18' },
  kashiwa: { character: '2015-05-14', store: '2005-03-10' },
  kawasaki: { character: '2016-12-01', store: '2006-09-28' },
  kumamoto: { character: '2026-02-02', store: '2021-03-05' },
  kyoto: { character: '2017-01-10' },
  machida: { character: '2019-03-01' },
  mito: { character: '2015-04-27', store: '2011-06-23' },
  nagoya: { character: '2016-04-26', store: '2003-11-07' },
  nagoyagate: { character: '2017-03-30', store: '2017-04-07' },
  nanba: { character: '2017-02-21', store: '2001-05-10' },
  niigata: { character: '2018-02-01', store: '2009-02-20' },
  ohmiya: { character: '2015-12-15', store: '2003-11-21' },
  okayama: { character: '2016-10-05', store: '2007-11-20' },
  photo: { character: '2016-03-17' },
  pkan: { character: '2016-06-29', store: '1997-11-27' },
  prosta: { character: '2015-11-11' },
  sagami: { character: '2015-08-04', store: '2010-03-04' },
  sapporo: { character: '2016-08-10', store: '2001-07-26' },
  seiseki: { character: '2016-08-31' },
  shibuhachi: { character: '2019-07-07', store: '1989-12-01' },
  shibuto: { character: '2019-07-07', store: '1993-02-20' },
  shinjyuku: { character: '2016-05-23', store: '2002-05-23' },
  shintou: { character: '2020-10-19', store: '2010-03-03' },
  shinyoko: { character: '2020-01-23', store: '2008-03-26' },
  tachikawa: { character: '2016-10-25', store: '2001-01-26' },
  takasaki: { character: '2026-03-27', store: '1985-06-06' },
  takatsuki: { character: '2023-10-06', store: '2022-06-10' },
  tamapla: { character: '2020-11-26' },
  tenjin: { character: '2020-12-13', store: '1999-04-24' },
  tenjin2: { character: '2017-10-25', store: '2003-03-27' },
  tokorozawa: { character: '2021-11-08', store: '2019-11-08' },
  yao: { character: '2022-11-14', store: '2019-07-01' },
  yokonishi: { character: '2026-01-23', store: '1991-04-23' }
}

const buildBirthdayMap = (year: number): Record<string, CalendarBirthday> => {
  const map: Record<string, CalendarBirthday> = {}
  for (let month = 1; month <= 12; month++) {
    const file = `calendar_${year}_${String(month).padStart(2, '0')}.html`
    const html = readFileSync(join(CACHE_DIR, file), 'utf-8')
    const monthMap = parseCalendarHtml(html, year, month)
    for (const [key, entry] of Object.entries(monthMap)) {
      map[key] ??= {}
      if (entry.character_birthday) map[key].character_birthday = entry.character_birthday
      if (entry.store_birthday) map[key].store_birthday = entry.store_birthday
    }
  }
  return map
}

describe('calendar HTML から抽出される誕生日が characters.json と一致する', () => {
  const extracted = buildBirthdayMap(2026)

  for (const [key, expected] of Object.entries(EXPECTED)) {
    test(`${key}`, () => {
      const actual = extracted[key]
      if (expected.character !== undefined) {
        expect(actual?.character_birthday).toBe(expected.character)
      }
      if (expected.store !== undefined) {
        expect(actual?.store_birthday).toBe(expected.store)
      }
    })
  }
})
