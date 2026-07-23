import type { User } from 'firebase/auth'
import { atom } from 'jotai'

/**
 * 現在の認証ユーザー
 */
export const userAtom = atom<User | null>(null)

/**
 * バックエンドの session Cookie が確立済みかどうか。
 * Firebase Auth の完了 (userAtom セット) と、 サーバー側 POST /api/auth によ る
 * session Cookie の発行はタイミングが別なので、 Cookie 認証が必要な API を叩く前に
 * このフラグが true になるまで待つ必要がある。
 *
 * ログアウト時や認証エラー時は false に戻す。
 */
export const backendSessionReadyAtom = atom<boolean>(false)
