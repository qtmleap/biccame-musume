import { type ReactNode, useState } from 'react'
import type { LabelRequest, PostView } from '../lib/event-detect/schema'
import { api } from './client'

// 画面間で共有する表示部品。

export const REASON_LABELS: Record<NonNullable<PostView['reason']>, string> = {
  retweet: 'RT',
  reply_to_other: '他者宛てリプライ',
  non_store_account: '店舗外アカウント',
  no_keyword: 'キーワードなし',
  excluded_keyword: '除外語'
}

export const TYPE_LABELS: Record<'announce' | 'start' | 'ongoing' | 'end', string> = {
  announce: '告知',
  start: '開始',
  ongoing: '継続中',
  end: '終了'
}

export const EXCLUDE_GROUP_LABELS: Record<PostView['excludeHits'][number]['group'], string> = {
  sales: '商品の販売・予約',
  games: 'トレカ・ゲーム',
  appliances: '家電・売場',
  promotion: '販促・体験'
}

export const GROUP_LABELS: Record<PostView['hits'][number]['group'], string> = {
  item: '景品',
  give: '配布方法',
  condition: '購入条件',
  end: '終了',
  start: '開始'
}

const jst = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

const jstDate = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

export const formatDateTime = (iso: string) => jst.format(Date.parse(iso))

export const formatDate = (iso: string | undefined) => (iso ? jstDate.format(Date.parse(iso)) : '—')

export const formatNumber = (value: number) => value.toLocaleString('ja-JP')

export const percent = (part: number, whole: number) => (whole === 0 ? '—' : `${((part / whole) * 100).toFixed(1)}%`)

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 判定に当たった語を強調する。NFKC 正規化後の語で照合するので、全角の表記は強調されないことがある。
 */
export const Highlight = ({
  text,
  keywords,
  excludes = []
}: {
  text: string
  keywords: readonly string[]
  /** 除外語。キーワードとは別の色で強調する */
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
          // biome-ignore lint/suspicious/noArrayIndexKey: 分割結果は順序で一意
          <mark key={index}>{part}</mark>
        ) : excludeSet.has(part) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 分割結果は順序で一意
          <mark key={index} className='exclude'>
            {part}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: 分割結果は順序で一意
          <span key={index}>{part}</span>
        )
      )}
    </>
  )
}

const KIND_LABELS: Record<PostView['kind'], string> = {
  original: '通常',
  retweet: 'RT',
  quote: '引用',
  reply: 'リプライ'
}

const VERDICTS: { value: LabelRequest['verdict']; label: string }[] = [
  { value: 'event', label: 'イベント' },
  { value: 'not_event', label: '違う' },
  { value: 'unsure', label: '保留' }
]

const LabelEditor = ({ post, onChange }: { post: PostView; onChange: (post: PostView) => void }) => {
  const [error, setError] = useState<string>()
  const current = post.label
  const save = async (next: LabelRequest | undefined) => {
    setError(undefined)
    try {
      const result = next ? await api.setLabel(post.id, next) : await api.deleteLabel(post.id)
      const { label: _, ...rest } = post
      onChange(result.label ? { ...rest, label: result.label } : rest)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const types = ['announce', 'start', 'ongoing', 'end'] as const
  return (
    <div>
      <div className='labels'>
        {VERDICTS.map((verdict) => (
          <button
            key={verdict.value}
            type='button'
            aria-pressed={current?.verdict === verdict.value}
            onClick={() =>
              current?.verdict === verdict.value
                ? save(undefined)
                : save({
                    verdict: verdict.value,
                    ...(verdict.value === 'event' && current?.type ? { type: current.type } : {})
                  })
            }
          >
            {verdict.label}
          </button>
        ))}
      </div>
      <div className='labels' style={{ marginTop: 4 }}>
        {types.map((type) => (
          <button
            key={type}
            type='button'
            // 種別を選ぶとイベントとして保存する。同じ種別をもう一度押すと種別だけ外す
            aria-pressed={current?.verdict === 'event' && current.type === type}
            onClick={() =>
              save({ verdict: 'event', ...(current?.verdict === 'event' && current.type === type ? {} : { type }) })
            }
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>
      {error && <div className='error'>{error}</div>}
    </div>
  )
}

export const PostItem = ({
  post,
  onChange,
  onOpenEvent,
  extra
}: {
  post: PostView
  onChange: (post: PostView) => void
  onOpenEvent?: (eventId: string) => void
  extra?: ReactNode
}) => {
  const keywords = post.hits.map((hit) => hit.keyword)
  return (
    <article className='post'>
      <div>
        <div className='meta'>
          <span>{formatDateTime(post.createdAt)}</span>
          <span>@{post.screenName}</span>
          <span>{KIND_LABELS[post.kind]}</span>
          {post.replyTo && <span>→ @{post.replyTo.screenName}</span>}
          {post.cluster.size > 1 && <span>同文 {post.cluster.size} 件</span>}
          <a href={post.url} target='_blank' rel='noreferrer'>
            X で開く
          </a>
        </div>
        <div className='body'>
          <Highlight text={post.text} keywords={keywords} excludes={post.excludeHits.map((hit) => hit.keyword)} />
        </div>
        {post.quoted && (
          <div className='quoted'>
            {post.quoted.screenName ? `@${post.quoted.screenName}: ` : ''}
            {post.quoted.text ? post.quoted.text : '（引用元の本文はアーカイブにありません）'}
          </div>
        )}
        {post.media.length > 0 && (
          <div className='media'>
            {post.media.map((url) => (
              <a key={url} href={url} target='_blank' rel='noreferrer'>
                <img src={`${url}?name=small`} alt='' loading='lazy' />
              </a>
            ))}
          </div>
        )}
      </div>
      <aside>
        <div>
          {post.reason ? (
            <span className='tag drop'>除外: {REASON_LABELS[post.reason]}</span>
          ) : (
            <span className='tag ok'>通過{post.strong ? '（強）' : ''}</span>
          )}
        </div>
        {post.gold.map((gold) => (
          <div key={`${gold.eventId}-${gold.type}`}>
            <span className='tag gold'>正解 {TYPE_LABELS[gold.type]}</span>{' '}
            {onOpenEvent ? (
              <button type='button' className='btn' onClick={() => onOpenEvent(gold.eventId)}>
                {gold.title}
              </button>
            ) : (
              gold.title
            )}
          </div>
        ))}
        {post.gold.length === 0 && post.nearbyEvents === 0 && post.reason === undefined && (
          <div className='muted'>期間内の D1 イベントなし</div>
        )}
        {post.hits.length > 0 && (
          <div className='muted'>{post.hits.map((hit) => `${hit.keyword}(${GROUP_LABELS[hit.group]})`).join(' ')}</div>
        )}
        {post.excludeHits.length > 0 && (
          <div className='muted'>
            除外語: {post.excludeHits.map((hit) => hit.keyword).join(' ')}
            {post.rescueHits.length > 0 ? ` / 救済語: ${post.rescueHits.join(' ')}` : ''}
          </div>
        )}
        <LabelEditor post={post} onChange={onChange} />
        {extra}
      </aside>
    </article>
  )
}

export const ErrorMessage = ({ error }: { error: unknown }) => (
  <div className='error'>{error instanceof Error ? error.message : String(error)}</div>
)
