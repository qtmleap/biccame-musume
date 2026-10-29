import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import { GIFT_CARD_CHOICE } from '@biccame/shared/event-detect/detection'
import type { WebhookPromptDefinition } from '@biccame/shared/schemas/webhook.dto'

// 現行の 1 段目の request を、v15 の版定義の質問へ戻す（d1-gold-regression.test.ts が、v15 で作った request の sha256 と比べるために使う）。
// 現行のソースは v15 の質問をもう作れない。戻すのは次の 2 つの質問だけで、他の質問・state・モデルは現行のまま比べる。
//   character: v17 で store_character を足した。v15 の定義の質問（型・文言・選択肢）にそのまま置き換える。
//   category:  v19 で gift_card の選択肢を足した。質問文は v15 から変わっていないので触らず、criteria だけを戻す
//              （gift_card を外し、other の説明を v15 のものに戻す）。名刺・アクキー・アクスタは本文の根拠語で投稿ごとに絞られるため、
//              他の選択肢は触らない（版定義の criteria は全投稿の和集合で、1 件の request の選択肢とは一致しない）。
// gift_card が無い request の category は何も変えない（説明を v15 のもので上書きすると、意図しない変更を見逃す）。

type ChoiceQuestion = Extract<ClefRequest['questions'][string], { type: 'choice' }>

const choiceQuestionOf = (definition: WebhookPromptDefinition, key: string) => {
  const question = definition.questions.find((entry) => entry.key === key)
  if (question === undefined || question.type !== 'choice') throw new Error(`Missing v15 ${key} question`)
  return question
}

/** 現行の category の質問を、v15 の質問に戻す。gift_card があるときだけ、選択肢から外して other の説明も戻す。質問文はそのまま。 */
export const restoreCategoryQuestion = (current: ChoiceQuestion, v15: WebhookPromptDefinition): ChoiceQuestion => {
  if (!Object.hasOwn(current.criteria, GIFT_CARD_CHOICE)) return current
  const other = choiceQuestionOf(v15, 'category').criteria.other
  if (other === undefined) throw new Error('Missing v15 other criteria')
  const criteria = Object.fromEntries(
    Object.entries(current.criteria).flatMap(([key, label]): [string, string][] => {
      if (key === GIFT_CARD_CHOICE) return []
      return [[key, key === 'other' ? other : label]]
    })
  )
  return { ...current, criteria }
}

/** 現行の request の character と category の質問を、v15 の版定義の質問に戻す。 */
export const restoreV15Request = (request: ClefRequest, v15: WebhookPromptDefinition): ClefRequest => {
  const category = request.questions.category
  if (category?.type !== 'choice') throw new Error('Missing category question')
  const character = choiceQuestionOf(v15, 'character')
  return {
    ...request,
    questions: {
      ...request.questions,
      character: { type: 'choice', instructions: character.instructions, criteria: character.criteria },
      category: restoreCategoryQuestion(category, v15)
    }
  }
}
