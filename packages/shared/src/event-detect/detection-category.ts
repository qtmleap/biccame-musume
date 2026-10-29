/**
 * 配布物の質問（category）にだけある選択肢。保存するカテゴリ（CategorySchema・EventCategorySchema）には無い。
 * 物品名にギフトカードを含む投稿にだけ出し、保存するときは other として扱う（detection-requests.ts）。
 */
export const GIFT_CARD_CHOICE = 'gift_card'

/**
 * 質問の選択肢を、保存するカテゴリのキーに対応づける。gift_card は other にし、それ以外はそのまま返す。
 * しきい値の比較は最上位の選択肢の確率で行うため、この変換は選んだあとに行う（gift_card と other の確率は合算しない）。
 */
export const categoryOfChoice = <T extends string | undefined>(choice: T): T | 'other' =>
  choice === GIFT_CARD_CHOICE ? 'other' : choice
