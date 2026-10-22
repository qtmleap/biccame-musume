import { normalizeText } from './filter'
import type { DetectPost } from './post'

/** 初期の配布上限だけを候補にする。残数・累計・一人分・セット内訳を総数へ流用しない。 */
export const quantityCandidates = (post: DetectPost): number[] => {
  const text = normalizeText(post.text).replaceAll(',', '')
  return [
    ...new Set(
      [...text.matchAll(/(?<!\d)(\d{1,6})(?:個|枚|名|人|セット|点|本)/g)].flatMap((match) => {
        const index = match.index
        const before = text.slice(Math.max(0, index - 35), index)
        const after = text.slice(index + match[0].length, index + match[0].length + 18)
        const residual =
          /残(?:り|数)?[^。！？]{0,12}$|配布済(?:み|数)?[^。！？]{0,12}$|累計[^。！？]{0,12}$|時点[^。！？]{0,18}$|時(?:くらい)?での[^。！？]{0,18}$/.test(
            before
          )
        const individual = /お(?:一人|ひとり)様?[^。！？]{0,8}$|一人[^。！？]{0,8}$|1人[^。！？]{0,8}$/.test(before)
        const total =
          /先着[^。！？]{0,12}$|限定[^。！？]{0,12}$|総数[^。！？]{0,12}$|配布(?:予定|総)?数(?:は|が|:)?[^。！？]{0,6}$|合計[^。！？]{0,6}$|各日[^。！？]{0,8}$/.test(
            before
          ) || /^(?:限定|を?ご用意|(?:様|さま)?にプレゼント)/.test(after)
        const quantity = Number(match[1])
        return quantity > 0 && !residual && !individual && total ? [quantity] : []
      })
    )
  ].sort((a, b) => a - b)
}
