import type { User } from 'firebase/auth'
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

/**
 * 現在の認証ユーザー
 */
export const userAtom = atom<User | null>(null)

/**
 * 認証状態の読み込み中フラグ
 */
export const authLoadingAtom = atom<boolean>(true)

/**
 * ログアウト処理中フラグ
 */
export const loggingOutAtom = atom<boolean>(false)

/**
 * ユーザーのTwitter情報(永続化)
 */
export const twitterProfileAtom = atomWithStorage<{
  displayName: string | null
  photoURL: string | null
  screenName: string | null
} | null>('twitter-profile', null)
