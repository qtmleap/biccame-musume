// 判定に当たった語を強調する。NFKC 正規化後の語で照合するので、全角の表記は強調されないことがある。

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const Highlight = ({
  text,
  keywords,
  excludes = []
}: {
  text: string
  keywords: readonly string[]
  /** 除外語。キーワードとは別の見た目で強調する */
  excludes?: readonly string[]
}) => {
  const all = [...keywords, ...excludes]
  if (all.length === 0) return <>{text}</>
  const pattern = new RegExp(
    `(${[...all]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join('|')})`,
    'g'
  )
  const keywordSet = new Set(keywords)
  const excludeSet = new Set(excludes)
  return (
    <>
      {text.split(pattern).map((part, index) =>
        keywordSet.has(part) ? (
          <mark key={index} className='rounded-sm bg-warning/30 px-0.5 text-foreground'>
            {part}
          </mark>
        ) : excludeSet.has(part) ? (
          <mark
            key={index}
            className='rounded-sm bg-destructive/15 px-0.5 text-foreground underline decoration-destructive decoration-2 underline-offset-2'
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  )
}
