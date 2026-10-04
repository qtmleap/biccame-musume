type CharacterTwitterLinkProps = {
  twitterId?: string
}

/**
 * ビッカメ娘のTwitter IDリンクコンポーネント
 */
export const CharacterTwitterLink = ({ twitterId }: CharacterTwitterLinkProps) => {
  if (!twitterId) return null

  return (
    <a
      href={`https://x.com/${twitterId}`}
      target='_blank'
      rel='noopener noreferrer'
      onClick={(e) => e.stopPropagation()}
      className='text-sm text-sky-600 hover:text-sky-800'
    >
      @{twitterId}
    </a>
  )
}
