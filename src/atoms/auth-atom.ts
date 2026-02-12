import type { User } from 'firebase/auth'
import { atom } from 'jotai'

/**
 * 現在の認証ユーザー
 */
export const userAtom = atom<User | null>(null)
