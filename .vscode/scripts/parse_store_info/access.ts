import jaconv from 'jaconv'
import { HTMLElement, type Node } from 'node-html-parser'
import type { AccessInfo } from './types'

/**
 * 路線名の span は並列 (`<span>A</span><span>B</span>`) にも
 * 入れ子 (`<span>A<span></span>B</span>`) にもなりうるため、
 * 要素そのものではなくテキストノード単位で拾う。
 */
const collectTextParts = (node: Node): string[] =>
  node.childNodes.flatMap((child) => (child.nodeType === 3 ? [child.text] : collectTextParts(child)))

/**
 * 店舗HTMLからアクセス情報（最寄駅・路線）を抽出
 */
export const parseAccess = (root: HTMLElement): AccessInfo[] => {
  const access: AccessInfo[] = []
  const accessElements = root.querySelectorAll('#shop_access .access dl.navi dt')
  for (const dtElement of accessElements) {
    let stationText = dtElement.childNodes
      .filter((node) => node.nodeType === 3)
      .map((node) => node.text.trim())
      .join('')
      .trim()
    // 全角英数記号を半角に、半角カタカナを全角に変換
    stationText = jaconv.normalize(stationText)

    // dtタグの直下にある括弧内の情報を出口情報として抽出（例: 「新宿三丁目駅（A5出口）」）
    const exitMatchInStation = stationText.match(/[()（）]([^()（）]+)[)）]/)
    const exitFromStation = exitMatchInStation ? exitMatchInStation[1].trim() : undefined

    // 駅名から括弧とその中身を削除（例: 「新宿三丁目駅（A5出口）」→「新宿三丁目駅」）
    stationText = stationText.replace(/[()（）][^()（）]*[)）]/g, '').trim()

    const descriptionElement = dtElement.querySelector('span')
    let descriptionText = descriptionElement?.text.trim() || ''
    // 全角英数記号を半角に、半角カタカナを全角に変換
    descriptionText = jaconv.normalize(descriptionText)
    // 括弧を削除
    descriptionText = descriptionText.replace(/[()（）]/g, '').trim()

    // 所要時間を抽出（例: 「徒歩4~8分」「徒歩5分」）
    const durationMatch = descriptionText.match(/徒歩[0-9~]+分/)
    const duration = durationMatch ? durationMatch[0] : undefined

    // 所要時間を除外
    const remainingText = descriptionText.replace(/徒歩[0-9~]+分/g, '').trim()

    // 「より」以降を追加情報として抽出（例: 「12号出口より直結」→ description: "12号出口", notes: "直結"）
    const moreMatch = remainingText.match(/(.+?)より(.+)$/)
    let description = ''
    let notes: string | undefined

    if (moreMatch) {
      description = moreMatch[1].trim()
      notes = moreMatch[2].trim()
    } else {
      description = remainingText
    }

    // spanタグがない場合、駅名から抽出した出口情報を使用
    if (!description && exitFromStation) {
      description = exitFromStation
    }

    const ddElement = dtElement.nextElementSibling
    // dd 直下が地の文だけの店舗もあるため、span の配下に限って路線名を拾う
    const lines = (ddElement?.childNodes || [])
      .filter((child) => child instanceof HTMLElement && child.rawTagName === 'span')
      .flatMap((span) => collectTextParts(span))
      // 括弧とその中身を削除（例: 「中央（快速／各駅停車）線」→「中央線」）
      .map((part) => part.trim().replace(/[()（）][^()（）]*[)）]/g, ''))
      .filter((line) => line.length > 0)

    if (stationText) {
      const accessInfo: AccessInfo = {
        station: stationText,
        description: description || undefined,
        lines
      }
      if (duration) accessInfo.duration = duration
      if (notes) accessInfo.notes = notes
      access.push(accessInfo)
    }
  }
  return access
}
