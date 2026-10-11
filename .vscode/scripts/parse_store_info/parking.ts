import type { HTMLElement } from 'node-html-parser'
import type { ParkingCondition, ParkingInfo } from './types'

/**
 * 店舗HTMLから駐車場情報を抽出
 */
export const parseParking = (root: HTMLElement): ParkingInfo[] => {
  const parking: ParkingInfo[] = []
  const parkingElements = root.querySelectorAll('.parking_service')
  for (const parkingElement of parkingElements) {
    const nameElement = parkingElement.querySelector('p a')
    let parkingName = nameElement?.text.trim() || ''
    // 全角スペースを半角スペースに変換
    parkingName = parkingName.replace(/　/g, ' ')

    const conditions: ParkingCondition[] = []
    const rows = parkingElement.querySelectorAll('table tbody tr')
    let isHeader = true
    for (const row of rows) {
      if (isHeader) {
        isHeader = false
        continue
      }

      const cells = row.querySelectorAll('td')
      if (cells.length >= 2) {
        conditions.push({
          purchase: cells[0].text.trim(),
          freeTime: cells[1].text.trim()
        })
      }
    }

    if (parkingName) {
      parking.push({
        name: parkingName,
        conditions
      })
    }
  }
  return parking
}
