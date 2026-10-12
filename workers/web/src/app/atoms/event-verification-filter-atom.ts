import type { VerificationFilter } from '@biccame/shared/domain/admin-event-filter'
import { atom } from 'jotai'

/**
 * 管理画面のイベント一覧の確認状態フィルタ
 * 既定は確認済み・未確認のどちらも表示
 */
export const eventVerificationFilterAtom = atom<VerificationFilter>('all')
