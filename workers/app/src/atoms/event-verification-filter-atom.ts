import { atom } from 'jotai'
import type { VerificationFilter } from '@/utils/admin-event-filter'

/**
 * 管理画面のイベント一覧の確認状態フィルタ
 * 既定は確認済み・未確認のどちらも表示
 */
export const eventVerificationFilterAtom = atom<VerificationFilter>('all')
