import { type ReactNode, useEffect, useRef } from 'react'

type TwitterTimelineProps = {
  /** TwitterのURL（例: https://twitter.com/username） */
  twitterUrl: string
  /** ボタンの中身（省略時はデフォルトのフォローボタン） */
  children?: ReactNode
}

/**
 * TwitterのURLからユーザー名を抽出する
 */
const extractUsername = (url: string): string | null => {
  const match = url.match(/(?:twitter\.com|x\.com)\/([^/?]+)/)
  return match ? match[1] : null
}

// TypeScript用の型定義
declare global {
  interface Window {
    twttr?: {
      widgets: {
        load: (element?: HTMLElement | null) => void
      }
    }
  }
}

/**
 * Twitterフォローボタン埋め込みコンポーネント
 */
export const TwitterTimeline = ({ twitterUrl, children }: TwitterTimelineProps) => {
  const username = extractUsername(twitterUrl)
  const containerRef = useRef<HTMLDivElement>(null)

  // コンポーネントマウント時にウィジェットを再読み込み
  useEffect(() => {
    if (window.twttr?.widgets && containerRef.current) {
      window.twttr.widgets.load(containerRef.current)
    }
  }, [])

  if (!username) {
    return null
  }

  return (
    <div ref={containerRef}>
      <a
        href={`https://twitter.com/${username}?ref_src=twsrc%5Etfw`}
        className='twitter-follow-button'
        data-show-count='false'
      >
        {children ?? `Follow @${username}`}
      </a>
    </div>
  )
}
