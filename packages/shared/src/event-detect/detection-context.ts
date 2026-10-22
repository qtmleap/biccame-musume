import { detectionCharacters, detectionStores } from './associations'
import { buildRescueTerms, classifyPost } from './filter'
import type { DetectPost } from './post'

export const accounts = detectionStores.flatMap((store) =>
  store.screenName === undefined ? [] : [{ storeId: store.id, name: store.name, screenName: store.screenName }]
)
export const labels = new Map(detectionStores.map((store) => [store.id, store.name]))
const filterOptions = {
  storeAccounts: new Set(accounts.map((store) => store.screenName.toLowerCase())),
  rescueTerms: buildRescueTerms(detectionCharacters.map((character) => character.name))
}
export const filterWebhookPost = (post: DetectPost) => classifyPost(post, filterOptions)

/** 一覧の「判定」列と絞り込みの選択肢。表示（一致 / 不一致 / 除外）と絞り込みが食い違わないよう、キーはここだけで持つ。 */
export const WEBHOOK_KEYWORD_VERDICTS = ['match', 'mismatch', 'excluded'] as const
export type WebhookKeywordVerdict = (typeof WEBHOOK_KEYWORD_VERDICTS)[number]

/**
 * 現在のキーワードルールによる投稿本文の判定。DB には保存せず、読み取りのたびに計算する。
 * 除外理由があれば excluded（キーワード未検出の no_keyword は除外ではない）、無ければ一致語の有無で match / mismatch。
 */
export const webhookKeywordVerdict = (post: DetectPost): WebhookKeywordVerdict => {
  const verdict = filterWebhookPost(post)
  if (verdict.reason !== undefined && verdict.reason !== 'no_keyword') return 'excluded'
  return verdict.hits.length > 0 ? 'match' : 'mismatch'
}

export const categoryLabels = {
  limited_card: '限定名刺',
  regular_card: '通常名刺',
  ackey: 'アクリルキーホルダー',
  acsta: 'アクリルスタンド',
  other: 'ノベルティ'
}
