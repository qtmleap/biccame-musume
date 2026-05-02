import { parse } from 'node-html-parser'

export type CalendarBirthday = {
  character_birthday?: string
  store_birthday?: string
}

const LABEL_PATTERN = /^.+?(擬人化|店舗誕生)(?:記念日|(\d+)周年)$/

export const parseCalendarHtml = (
  html: string,
  year: number,
  month: number
): Record<string, CalendarBirthday> => {
  const root = parse(html)
  const map: Record<string, CalendarBirthday> = {}
  const cells = root.querySelectorAll('td[class*="wd"]')

  for (const cell of cells) {
    const style = cell.getAttribute('style') || ''
    if (style.includes('#CCCCCC')) continue

    const dayDiv = cell.querySelector('div')
    if (!dayDiv) continue
    const day = Number.parseInt(dayDiv.text.trim(), 10)
    if (!Number.isFinite(day)) continue

    const links = cell.querySelectorAll('a[href*="/profile/"]')
    for (const a of links) {
      const href = a.getAttribute('href') || ''
      const keyMatch = href.match(/\/profile\/([^/]+)\.html/)
      if (!keyMatch) continue
      const key = keyMatch[1]

      const text = a.text.trim()
      const labelMatch = text.match(LABEL_PATTERN)
      if (!labelMatch) continue

      const kind = labelMatch[1]
      const yearsAgo = labelMatch[2] ? Number.parseInt(labelMatch[2], 10) : 0
      const originYear = year - yearsAgo
      const date = `${originYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      map[key] ??= {}
      if (kind === '擬人化') {
        map[key].character_birthday = date
      } else {
        map[key].store_birthday = date
      }
    }
  }

  return map
}