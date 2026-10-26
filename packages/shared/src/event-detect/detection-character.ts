import { ASSOCIATION_MULTIPLE, ASSOCIATION_NONE, CHARACTER_STORE, selectedCharacterIds } from './associations'

export type CharacterInput = {
  /** 採用した店舗（確認も通ったもの）。採用しなければ空。 */
  stores: readonly string[]
  /**
   * 明示として採用された娘の最上位。1段目の最上位の確率が下限（70%）以上のもの、または70%未満で2段目の確認が下限以上のもの。
   * 明示されなければ undefined（確認が低い・確認が無い・回答が無い）。
   */
  choice: string | undefined
  /** 1段目の娘の最上位（確率を問わない）。回答が無ければ undefined。 */
  top: string | undefined
}

/** 採用した店舗の娘。店舗が採用されないとき、店舗の ID が EventCharacter として無効なときは空。 */
const storeCharacterIds = (stores: readonly string[]) => stores.flatMap((store) => selectedCharacterIds(store))

/**
 * 登録する対象ビッカメ娘を決める。規則は「ビッカメ娘の値が明示されていないときは、その店舗のビッカメ娘」。
 * D1 でも娘が明示されるのは店舗の娘と違うときだけで、店舗から推定した娘は書かれていない。
 *
 * 明示されている（その娘を採用する。choice に入る）:
 *  - 最上位の確率が下限（70%）以上のもの。2段目の確認は見ない（店舗と別の具体的な娘、店舗と同じ娘、other・secret）。
 *  - 70% 未満でも、2段目の確認の「はい」が下限以上の具体的な娘。
 * 明示されていない（採用した店舗の娘にして、保留しない）:
 *  - 1段目の最上位が store_character（v17 以降。本文でビッカメ娘に特に言及がない）のとき。確率が下限以上でも未満でも同じ。
 *  - 70% 未満で、最上位が none・multiple でないとき（確認が低い = 本文から読めない、確認の質問が無い保存データ、other・secret を含む）。
 * 保留する（空を返す）:
 *  - 確率が下限以上の none・multiple。確率が下限に届かず最上位が none・multiple のとき。回答が無いとき。
 *  - 明示されていないのに、店舗が採用されない（none・multiple・確率が70%未満で確認が低い）か、店舗の ID が無効なとき。
 */
export const resolveCharacterIds = ({ stores, choice, top }: CharacterInput): string[] => {
  if (choice === CHARACTER_STORE) return storeCharacterIds(stores)
  if (choice !== undefined) return selectedCharacterIds(choice)
  if (top === undefined || top === ASSOCIATION_NONE || top === ASSOCIATION_MULTIPLE) return []
  return storeCharacterIds(stores)
}

/**
 * 保留ジョブの下書きの娘。1段目の最上位が store_character なら、下書きの店舗の娘にする（店舗が無い・店舗の ID が無効なら空）。
 * それ以外は最上位を EventCharacter として採る（none・multiple・未知の値は空）。
 */
export const draftCharacterIds = (top: string | undefined, stores: readonly string[]) =>
  top === CHARACTER_STORE ? storeCharacterIds(stores) : selectedCharacterIds(top)
