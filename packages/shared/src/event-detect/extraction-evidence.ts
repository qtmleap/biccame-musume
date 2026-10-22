/** 空白以外の文字を変えず、単一の連続した原文範囲へ根拠を戻す。 */
export const restoreEvidenceSpan = (sources: readonly string[], evidence: string): string | undefined => {
  const exact = sources.find((source) => source.includes(evidence))
  if (exact !== undefined) return evidence
  const characters = [...evidence].filter((character) => !/\s/u.test(character))
  if (characters.length === 0) return undefined
  const target = characters.join('')
  const matches = sources.flatMap((source) => {
    const offsets = [...source.matchAll(/\S/gu)]
    const compact = offsets.map((match) => match[0]).join('')
    const index = compact.indexOf(target)
    if (index < 0) return []
    if (compact.indexOf(target, index + 1) >= 0) return [undefined, undefined]
    // UTF-16の文字位置と原文位置を対応させ、絵文字も分断しない。
    const startIndex = [...compact.slice(0, index)].length
    const start = offsets[startIndex]
    const end = offsets[startIndex + characters.length - 1]
    return start === undefined || end === undefined ? [] : [source.slice(start.index, end.index + end[0].length)]
  })
  // 複数箇所に一致した場合は、条件の適用範囲を推測しない。
  return matches.length === 1 ? matches[0] : undefined
}

/** item・店舗・娘・原文範囲が完全に同じ候補だけを除く。 */
export const uniqueExtractionEvents = <
  T extends { item: string; stores: string[]; characterIds: string[]; evidence: string[] }
>(
  events: T[]
): T[] => {
  const key = (event: T) =>
    JSON.stringify([
      event.item,
      event.stores.slice().sort(),
      event.characterIds.slice().sort(),
      [...new Set(event.evidence)].sort()
    ])
  return events.filter((event, index) => events.findIndex((candidate) => key(candidate) === key(event)) === index)
}
