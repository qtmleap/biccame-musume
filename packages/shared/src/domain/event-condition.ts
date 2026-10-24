import type { Event } from '../schemas/event.dto'

/** 購入と入金は異なる条件として表示する。 */
export const eventConditionLabel = (condition: Event['conditions'][number]): string => {
  switch (condition.type) {
    case 'purchase':
      return condition.purchaseAmount === undefined
        ? '商品購入'
        : `${condition.purchaseAmount.toLocaleString('ja-JP')}円以上購入`
    case 'charge':
      return condition.chargeAmount === undefined
        ? '入金・チャージ'
        : `${condition.chargeAmount.toLocaleString('ja-JP')}円以上入金`
    case 'first_come':
      return condition.quantity === undefined ? '先着順' : `先着${condition.quantity}名`
    case 'lottery':
      return condition.quantity === undefined ? '抽選' : `抽選${condition.quantity}名`
    case 'everyone':
      return '全員配布'
  }
}
