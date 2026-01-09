import { atom } from 'jotai'
import type { Event } from '@/schemas/event.dto'

/**
 * イベント一覧のAtom（ローカル状態管理）
 */
export const eventsAtom = atom<Event[]>([])

/**
 * 選択中のイベントのAtom
 */
export const selectedEventAtom = atom<Event | null>(null)
