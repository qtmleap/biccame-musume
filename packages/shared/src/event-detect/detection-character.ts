import { ASSOCIATION_MULTIPLE, ASSOCIATION_NONE, selectedCharacterIds } from './associations'

export type CharacterInput = {
  /** 採用した店舗（確認も通ったもの）。採用しなければ空。 */
  stores: readonly string[]
  /** 1段目の娘の最上位のうち、確率が下限以上のもの。下限に届かなければ undefined。 */
  choice: string | undefined
  /** 1段目の娘の最上位（確率を問わない）。回答が無ければ undefined。 */
  top: string | undefined
  /** 確率が下限以上の具体的な娘について、2段目の確認が通らなかったか。 */
  confirmLow: boolean
}

/** 採用した店舗の娘。店舗が採用されないとき、店舗の ID が EventCharacter として無効なときは空。 */
const storeCharacterIds = (stores: readonly string[]): string[] =>
  stores.flatMap((store) => selectedCharacterIds(store))

/**
 * 登録する対象ビッカメ娘を決める。規則は「ビッカメ娘の値が明示されていないときは、その店舗のビッカメ娘」。
 * D1 でも娘が明示されるのは店舗の娘と違うときだけで、店舗から推定した娘は書かれていない。
 *
 * 明示されている（その娘を採用する）:
 *  - 確率が下限以上の娘で、2段目の確認を通ったもの（店舗と別の具体的な娘、店舗と同じ娘、other・secret）。
 *    確認の質問が無い保存データ（v15 以前、店舗の娘）は関門なしで通る。
 * 明示されていない（採用した店舗の娘にして、保留しない）:
 *  - 確率が下限に届かず、最上位が none・multiple でないとき。
 *  - 確率が下限以上の具体的な娘でも、2段目の確認が通らないとき（確認が低い = 本文から読めない）。
 * 保留する（空を返す）:
 *  - 確率が下限以上の none・multiple。確率が下限に届かず最上位が none・multiple のとき。回答が無いとき。
 *  - 明示されていないのに、店舗が採用されない（none・multiple・確率不足・確認が低い）か、店舗の ID が無効なとき。
 */
export const resolveCharacterIds = ({ stores, choice, top, confirmLow }: CharacterInput): string[] => {
  if (choice !== undefined) return confirmLow ? storeCharacterIds(stores) : selectedCharacterIds(choice)
  if (top === undefined || top === ASSOCIATION_NONE || top === ASSOCIATION_MULTIPLE) return []
  return storeCharacterIds(stores)
}
