import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { z } from 'zod'
import type {
  AccountsResponseSchema,
  EventDetailResponseSchema,
  EventView,
  GapsResponseSchema,
  KeywordsResponseSchema,
  PostView,
  Summary
} from '../lib/event-detect/schema'
import { api, type PostFilter } from './client'
import {
  ErrorMessage,
  EXCLUDE_GROUP_LABELS,
  formatDate,
  formatNumber,
  GROUP_LABELS,
  PostItem,
  percent,
  REASON_LABELS,
  TYPE_LABELS
} from './components'
import './style.css'

// イベント検出のデバッグビューワ。bun dev の /__event-detect/ で開く（scripts/lib/event-detect/vite-plugin.ts）。

type Tab = 'funnel' | 'posts' | 'events' | 'gaps' | 'keywords'

const TABS: { key: Tab; label: string }[] = [
  { key: 'funnel', label: 'ファネル' },
  { key: 'posts', label: '投稿' },
  { key: 'events', label: 'D1 イベント' },
  { key: 'gaps', label: '登録漏れ候補' },
  { key: 'keywords', label: 'キーワード' }
]

/** 非同期取得の状態。再取得したいときは reload を呼ぶ */
const useLoad = <T,>(load: () => Promise<T>, deps: readonly unknown[]) => {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true })
  const [version, setVersion] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps は呼び出し側が渡す
  useEffect(() => {
    const controller = { cancelled: false }
    setState((previous) => ({ ...previous, loading: true }))
    load().then(
      (data) => !controller.cancelled && setState({ data, loading: false }),
      (error) => !controller.cancelled && setState({ error, loading: false })
    )
    return () => {
      controller.cancelled = true
    }
  }, [...deps, version])
  return { ...state, setData: (data: T) => setState({ data, loading: false }), reload: () => setVersion((v) => v + 1) }
}

/** 空文字はフィルタ未指定として扱う */
const optional = (value: string) => (value === '' ? undefined : value)

const REASONS = ['retweet', 'reply_to_other', 'non_store_account', 'no_keyword', 'excluded_keyword'] as const

const replacePost = (posts: PostView[], next: PostView) => posts.map((post) => (post.id === next.id ? next : post))

const FunnelView = ({ onOpenEvent }: { onOpenEvent: (id: string) => void }) => {
  const summary = useLoad(api.summary, [])
  if (summary.error) return <ErrorMessage error={summary.error} />
  if (!summary.data) return <p className='muted'>読み込み中…</p>
  const data: Summary = summary.data
  const total = data.totals
  return (
    <>
      <h2>データ</h2>
      <dl className='facts'>
        <dt>アーカイブ</dt>
        <dd>
          {data.source.archive}（{formatNumber(data.source.posts)} 件、{formatDate(data.source.from)} 〜{' '}
          {formatDate(data.source.until)}、{formatNumber(data.source.pages)} ページ）
        </dd>
        <dt>取得状況</dt>
        <dd>
          {data.source.complete ? (
            '完了'
          ) : (
            <span className='tag drop'>未完了: 期間内でも投稿が欠けている可能性がある</span>
          )}
        </dd>
        <dt>正解データ</dt>
        <dd>
          公開 API の検証済みイベント {formatNumber(data.source.events)} 件（{formatDate(data.source.goldFetchedAt)}{' '}
          取得）、参考 URL がアーカイブ内の投稿を指すもの {formatNumber(total.gold)} 件
        </dd>
        <dt>手動ラベル</dt>
        <dd>
          {formatNumber(data.labels.total)} 件（イベント {data.labels.event} / 違う {data.labels.notEvent} / 保留{' '}
          {data.labels.unsure}）
        </dd>
      </dl>

      <h2>ファネル</h2>
      <p className='note'>
        各段はそれより上の除外をすべて適用した後の件数。正解は参考 URL
        が指す投稿で、正例しか無いため適合率は測れない（手動ラベルで補う）。
      </p>
      <table>
        <thead>
          <tr>
            <th>段階</th>
            <th className='num'>投稿</th>
            <th className='num'>残存率</th>
            <th className='num'>正解</th>
            <th className='num'>再現率</th>
            <th className='num'>告知</th>
            <th className='num'>開始</th>
            <th className='num'>終了</th>
          </tr>
        </thead>
        <tbody>
          {data.funnel.map((stage) => (
            <tr key={stage.key}>
              <td>{stage.label}</td>
              <td className='num'>{formatNumber(stage.posts)}</td>
              <td className='num'>{percent(stage.posts, data.funnel[0].posts)}</td>
              <td className='num'>{formatNumber(stage.gold)}</td>
              <td className='num'>{percent(stage.gold, total.gold)}</td>
              <td className='num'>{stage.goldByType.announce}</td>
              <td className='num'>{stage.goldByType.start}</td>
              <td className='num'>{stage.goldByType.end}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>除外された正解（{data.droppedGold.length} 件）</h2>
      <p className='note'>機械フィルタで落ちた正解投稿。本文に手掛かりが無いものは画像を読む必要がある。</p>
      <DroppedGold posts={data.droppedGold} onOpenEvent={onOpenEvent} />

      <h2>アーカイブに無い正解（期間内 {data.missingGold.filter((entry) => entry.inRange).length} 件）</h2>
      <p className='note'>期間外のものはアーカイブ開始前の投稿。期間内のものはリスト外のアカウントか、取得漏れ。</p>
      <table>
        <thead>
          <tr>
            <th>投稿</th>
            <th>アカウント</th>
            <th>期間内</th>
            <th>イベント</th>
          </tr>
        </thead>
        <tbody>
          {data.missingGold
            .filter((entry) => entry.inRange)
            .map((entry) => (
              <tr key={entry.id}>
                <td>
                  <a href={`https://x.com/${entry.screenName}/status/${entry.id}`} target='_blank' rel='noreferrer'>
                    {entry.id}
                  </a>
                </td>
                <td>@{entry.screenName}</td>
                <td>{entry.inRange ? 'はい' : 'いいえ'}</td>
                <td>
                  {entry.events.map((event) => (
                    <button
                      key={event.eventId}
                      type='button'
                      className='btn'
                      onClick={() => onOpenEvent(event.eventId)}
                    >
                      {TYPE_LABELS[event.type]}: {event.title}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </>
  )
}

const DroppedGold = ({ posts, onOpenEvent }: { posts: PostView[]; onOpenEvent: (id: string) => void }) => {
  const [items, setItems] = useState(posts)
  useEffect(() => setItems(posts), [posts])
  return (
    <>
      {items.map((post) => (
        <PostItem
          key={post.id}
          post={post}
          onOpenEvent={onOpenEvent}
          onChange={(next) => setItems((list) => replacePost(list, next))}
        />
      ))}
    </>
  )
}

const SCOPES: { value: NonNullable<PostFilter['scope']>; label: string }[] = [
  { value: 'passed', label: '通過' },
  { value: 'unlabeled', label: '通過・正解なし・未ラベル' },
  { value: 'strong', label: '強シグナル' },
  { value: 'gold', label: '正解' },
  { value: 'gold_dropped', label: '除外された正解' },
  { value: 'dropped', label: '除外' },
  { value: 'all', label: 'すべて' }
]

const PAGE = 50

const hasDropped = (scope: PostFilter['scope']) => scope === 'dropped' || scope === 'all' || scope === 'gold_dropped'

const PostsView = ({ onOpenEvent }: { onOpenEvent: (id: string) => void }) => {
  const accounts = useLoad(api.accounts, [])
  const [filter, setFilter] = useState<PostFilter>({ scope: 'unlabeled', dedup: '1' })
  const [draft, setDraft] = useState('')
  const [offset, setOffset] = useState(0)
  const posts = useLoad(() => api.posts(filter, offset, PAGE), [JSON.stringify(filter), offset])
  const update = (next: PostFilter) => {
    setOffset(0)
    setFilter(next)
  }
  const accountList: z.infer<typeof AccountsResponseSchema>['accounts'] = accounts.data ? accounts.data.accounts : []
  return (
    <>
      <div className='toolbar'>
        <label>
          範囲
          <select
            value={filter.scope}
            onChange={(event) => {
              const scope = SCOPES.find((entry) => entry.value === event.target.value)?.value
              // 除外を含まない範囲に切り替えたら除外理由の絞り込みを外す
              const { reason, ...rest } = filter
              update(hasDropped(scope) ? { ...rest, scope, reason } : { ...rest, scope })
            }}
          >
            {SCOPES.map((scope) => (
              <option key={scope.value} value={scope.value}>
                {scope.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          アカウント
          <select
            value={filter.account === undefined ? '' : filter.account}
            onChange={(event) => update({ ...filter, account: optional(event.target.value) })}
          >
            <option value=''>すべて</option>
            {accountList.map((account) => (
              <option key={account.screenName} value={account.screenName}>
                @{account.screenName}（通過 {account.passed}）
              </option>
            ))}
          </select>
        </label>
        <label>
          除外理由
          {/* 通過した投稿には除外理由が無いので、除外を含む範囲でだけ選べる */}
          <select
            value={filter.reason === undefined ? '' : filter.reason}
            disabled={!hasDropped(filter.scope)}
            onChange={(event) =>
              update({
                ...filter,
                reason: REASONS.find((key) => key === event.target.value)
              })
            }
          >
            <option value=''>すべて</option>
            {Object.entries(REASON_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          期間
          <input
            type='date'
            value={filter.from === undefined ? '' : filter.from}
            onChange={(event) => update({ ...filter, from: optional(event.target.value) })}
          />
          〜
          <input
            type='date'
            value={filter.until === undefined ? '' : filter.until}
            onChange={(event) => update({ ...filter, until: optional(event.target.value) })}
          />
        </label>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            update({ ...filter, q: optional(draft) })
          }}
        >
          <label>
            本文
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder='部分一致' />
          </label>
        </form>
        <label>
          <input
            type='checkbox'
            checked={filter.dedup === '1'}
            onChange={(event) => update({ ...filter, dedup: event.target.checked ? '1' : '0' })}
          />
          同一文面をまとめる
        </label>
      </div>
      {posts.error ? <ErrorMessage error={posts.error} /> : null}
      {posts.data && (
        <>
          <div className='pager'>
            <span>
              {formatNumber(posts.data.total)} 件中 {formatNumber(Math.min(offset + 1, posts.data.total))}〜
              {formatNumber(Math.min(offset + PAGE, posts.data.total))}
            </span>
            <button type='button' className='btn' disabled={offset === 0} onClick={() => setOffset(offset - PAGE)}>
              前へ
            </button>
            <button
              type='button'
              className='btn'
              disabled={offset + PAGE >= posts.data.total}
              onClick={() => setOffset(offset + PAGE)}
            >
              次へ
            </button>
            {posts.loading && <span>読み込み中…</span>}
          </div>
          {posts.data.posts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              onOpenEvent={onOpenEvent}
              onChange={(next) => {
                if (posts.data) posts.setData({ ...posts.data, posts: replacePost(posts.data.posts, next) })
              }}
            />
          ))}
        </>
      )}
    </>
  )
}

const EVENT_FILTERS = [
  { value: 'all', label: 'すべて' },
  { value: 'end_candidate', label: '終了の登録漏れ候補' },
  { value: 'no_archived', label: '正解投稿がアーカイブに無い' },
  { value: 'announce_only', label: '告知のみ' }
] as const

const EventsView = ({ onOpenEvent }: { onOpenEvent: (id: string) => void }) => {
  const events = useLoad(api.events, [])
  const [mode, setMode] = useState<(typeof EVENT_FILTERS)[number]['value']>('end_candidate')
  const [query, setQuery] = useState('')
  if (events.error) return <ErrorMessage error={events.error} />
  if (!events.data) return <p className='muted'>読み込み中…</p>
  const filtered = events.data.events
    .filter((event) => {
      if (mode === 'end_candidate') return event.endCandidate
      if (mode === 'no_archived') return event.archived === 0
      if (mode === 'announce_only') return event.refs.start === 0 && event.refs.end === 0
      return true
    })
    .filter((event) => !query || event.title.includes(query) || event.stores.some((store) => store.includes(query)))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
  return (
    <>
      <div className='toolbar'>
        {EVENT_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type='button'
            className='btn'
            aria-pressed={mode === filter.value}
            onClick={() => setMode(filter.value)}
          >
            {filter.label}
          </button>
        ))}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder='タイトル・店舗キー' />
        <span className='muted'>{filtered.length} 件</span>
      </div>
      <p className='note'>
        終了の登録漏れ候補: 終了の参考 URL
        も実終了日時も無いが、開始後に担当アカウントが「終了」系の語と景品名を含む投稿をしているイベント。別の景品の終了報告も混ざる。
      </p>
      <table>
        <thead>
          <tr>
            <th>開始</th>
            <th>終了予定</th>
            <th>実終了</th>
            <th>店舗</th>
            <th>タイトル</th>
            <th>カテゴリ</th>
            <th className='num'>告知</th>
            <th className='num'>開始</th>
            <th className='num'>終了</th>
            <th className='num'>アーカイブ内</th>
            <th className='num'>関連投稿</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((event: EventView) => (
            <tr key={event.uuid} className='clickable' onClick={() => onOpenEvent(event.uuid)}>
              <td className='num'>{formatDate(event.startDate)}</td>
              <td className='num'>{formatDate(event.endDate)}</td>
              <td className='num'>{formatDate(event.endedAt)}</td>
              <td>{event.stores.join(', ')}</td>
              <td>{event.title}</td>
              <td>{event.category}</td>
              <td className='num'>{event.refs.announce}</td>
              <td className='num'>{event.refs.start}</td>
              <td className='num'>{event.refs.end}</td>
              <td className='num'>{event.archived}</td>
              <td className='num'>{event.related}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

const EventDetail = ({ id, onOpenEvent }: { id: string; onOpenEvent: (id: string) => void }) => {
  const detail = useLoad(() => api.event(id), [id])
  const [onlySignals, setOnlySignals] = useState(true)
  if (detail.error) return <ErrorMessage error={detail.error} />
  if (!detail.data) return <p className='muted'>読み込み中…</p>
  const data: z.infer<typeof EventDetailResponseSchema> = detail.data
  const { event } = data
  const posts = data.posts.filter(
    (post) => !onlySignals || post.gold.length > 0 || post.hits.some((hit) => hit.group === 'item')
  )
  return (
    <>
      <h2>{event.title}</h2>
      <dl className='facts'>
        <dt>店舗</dt>
        <dd>{event.stores.join(', ')}</dd>
        <dt>期間</dt>
        <dd>
          {formatDate(event.startDate)} 〜 {formatDate(event.endDate)}（実終了 {formatDate(event.endedAt)}）
        </dd>
        <dt>カテゴリ</dt>
        <dd>{event.category}</dd>
        <dt>参考 URL</dt>
        <dd>
          {event.referenceUrls.map((reference) => (
            <div key={reference.url}>
              <span className='tag gold'>{TYPE_LABELS[reference.type]}</span>{' '}
              <a href={reference.url} target='_blank' rel='noreferrer'>
                {reference.url}
              </a>{' '}
              {!reference.archived && <span className='muted'>（アーカイブ外）</span>}
            </div>
          ))}
        </dd>
        <dt>管理画面</dt>
        <dd>
          <a href={`https://biccame-musume.com/admin/events/${event.uuid}`} target='_blank' rel='noreferrer'>
            編集
          </a>
        </dd>
      </dl>
      <div className='toolbar'>
        <label>
          <input type='checkbox' checked={onlySignals} onChange={(e) => setOnlySignals(e.target.checked)} />
          正解と景品名を含む投稿だけ
        </label>
        <span className='muted'>
          {posts.length} / {data.posts.length} 件（担当アカウントの、告知 45 日前〜終了 7 日後の通過投稿）
        </span>
      </div>
      {posts.map((post) => (
        <PostItem
          key={post.id}
          post={post}
          onOpenEvent={(next) => next !== id && onOpenEvent(next)}
          onChange={(next) => detail.setData({ ...data, posts: replacePost(data.posts, next) })}
        />
      ))}
    </>
  )
}

const GapsView = () => {
  const gaps = useLoad(api.gaps, [])
  if (gaps.error) return <ErrorMessage error={gaps.error} />
  if (!gaps.data) return <p className='muted'>読み込み中…</p>
  const data: z.infer<typeof GapsResponseSchema> = gaps.data
  const total = data.gaps.reduce((sum, gap) => sum + gap.posts.length, 0)
  const update = (account: string, next: PostView) =>
    gaps.setData({
      gaps: data.gaps.map((gap) => (gap.account === account ? { ...gap, posts: replacePost(gap.posts, next) } : gap))
    })
  return (
    <>
      <p className='note'>
        強シグナル（景品名＋配布方法か購入条件＋日付表現）の投稿のうち、その店舗の D1 イベント期間（告知 45 日前〜終了 7
        日後、終了日なしは開始 120 日後まで）のどれにも入らないもの。{total} 件 / {data.gaps.length} アカウント。
      </p>
      <table>
        <thead>
          <tr>
            <th>アカウント</th>
            <th>店舗キー</th>
            <th className='num'>件数</th>
            <th>最初</th>
            <th>最後</th>
          </tr>
        </thead>
        <tbody>
          {data.gaps.map((gap) => (
            <tr key={gap.account}>
              <td>
                <a href={`#gap-${gap.account}`}>@{gap.account}</a>
              </td>
              <td>{gap.stores.join(', ')}</td>
              <td className='num'>{gap.posts.length}</td>
              <td className='num'>{formatDate(gap.posts[0].createdAt)}</td>
              <td className='num'>{formatDate(gap.posts[gap.posts.length - 1].createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.gaps.map((gap) => (
        <section key={gap.account} id={`gap-${gap.account}`}>
          <h2>
            @{gap.account}（{gap.stores.join(', ')}）
          </h2>
          {gap.posts.map((post) => (
            <PostItem key={post.id} post={post} onChange={(next) => update(gap.account, next)} />
          ))}
        </section>
      ))}
    </>
  )
}

const KeywordsView = () => {
  const keywords = useLoad(api.keywords, [])
  const [busy, setBusy] = useState(false)
  if (keywords.error) return <ErrorMessage error={keywords.error} />
  if (!keywords.data) return <p className='muted'>読み込み中…</p>
  const data: z.infer<typeof KeywordsResponseSchema> = keywords.data
  const disabledOf = (stats: { keyword: string; disabled: boolean }[], toggled?: string) =>
    stats.filter((stat) => (stat.keyword === toggled ? !stat.disabled : stat.disabled)).map((stat) => stat.keyword)
  const save = async (disabled: string[], disabledExcludes: string[]) => {
    setBusy(true)
    try {
      keywords.setData(await api.setDisabledKeywords(disabled, disabledExcludes))
    } finally {
      setBusy(false)
    }
  }
  const toggleKeyword = (keyword: string) => save(disabledOf(data.keywords, keyword), disabledOf(data.excludes))
  const toggleExclude = (keyword: string) => save(disabledOf(data.keywords), disabledOf(data.excludes, keyword))
  const excludes = [...data.excludes].sort((a, b) => b.posts - a.posts)
  return (
    <>
      <p className='note'>
        チェックを外した語はサーバー上の判定から一時的に外れる（再起動で戻る）。ファネル・投稿一覧にもそのまま反映される。
      </p>
      <h2>キーワード（含む投稿を通す）</h2>
      <p className='note'>単独件数は「この語以外に当たる語が無い」投稿の数で、外したときに落ちる件数。</p>
      <table>
        <thead>
          <tr>
            <th>有効</th>
            <th>語</th>
            <th>種類</th>
            <th className='num'>投稿</th>
            <th className='num'>正解</th>
            <th className='num'>単独 投稿</th>
            <th className='num'>単独 正解</th>
          </tr>
        </thead>
        <tbody>
          {data.keywords.map((stat) => (
            <tr key={stat.keyword} className={stat.disabled ? 'disabled' : undefined}>
              <td>
                <input
                  type='checkbox'
                  checked={!stat.disabled}
                  disabled={busy}
                  onChange={() => toggleKeyword(stat.keyword)}
                />
              </td>
              <td>{stat.keyword}</td>
              <td>{GROUP_LABELS[stat.group]}</td>
              <td className='num'>{formatNumber(stat.posts)}</td>
              <td className='num'>{formatNumber(stat.gold)}</td>
              <td className='num'>{formatNumber(stat.onlyPosts)}</td>
              <td className='num'>{formatNumber(stat.onlyGold)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>除外語（救済語が無ければ落とす）</h2>
      <p className='note'>
        救済語はビッカメ娘・ビッ旅・名刺・アクキー・アクスタ・缶バッジ・ノベルティとキャラクター名（○○たん）。
        投稿はキーワードを通過し、この語を含み、救済語を含まない件数。単独はこの語だけで落ちている件数（外すと通過に戻る）。
        「正解が落ちる」は 0 であるべき。
      </p>
      <table>
        <thead>
          <tr>
            <th>有効</th>
            <th>語</th>
            <th>分類</th>
            <th className='num'>投稿</th>
            <th className='num'>単独</th>
            <th className='num'>含む正解</th>
            <th className='num'>救済された正解</th>
            <th className='num'>正解が落ちる</th>
          </tr>
        </thead>
        <tbody>
          {excludes.map((stat) => (
            <tr key={stat.keyword} className={stat.disabled ? 'disabled' : undefined}>
              <td>
                <input
                  type='checkbox'
                  checked={!stat.disabled}
                  disabled={busy}
                  onChange={() => toggleExclude(stat.keyword)}
                />
              </td>
              <td>{stat.keyword}</td>
              <td>{EXCLUDE_GROUP_LABELS[stat.group]}</td>
              <td className='num'>{formatNumber(stat.posts)}</td>
              <td className='num'>{formatNumber(stat.onlyPosts)}</td>
              <td className='num'>{formatNumber(stat.gold)}</td>
              <td className='num'>{formatNumber(stat.rescuedGold)}</td>
              <td className='num'>{formatNumber(stat.droppedGold)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

const readHash = (): { tab: Tab; event?: string } => {
  const [tab, event] = location.hash.replace(/^#\/?/, '').split('/')
  const found = TABS.find((entry) => entry.key === tab)
  return { tab: found ? found.key : 'funnel', ...(event ? { event } : {}) }
}

const App = () => {
  const [route, setRoute] = useState(readHash)
  useEffect(() => {
    const listener = () => setRoute(readHash())
    window.addEventListener('hashchange', listener)
    return () => window.removeEventListener('hashchange', listener)
  }, [])
  const openEvent = useCallback((id: string) => {
    location.hash = `#/events/${id}`
  }, [])
  return (
    <>
      <header className='app'>
        <h1>イベント検出ビューワ</h1>
        <nav className='tabs'>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type='button'
              aria-current={route.tab === tab.key && !route.event ? 'page' : undefined}
              onClick={() => {
                location.hash = `#/${tab.key}`
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {route.event ? (
          <EventDetail id={route.event} onOpenEvent={openEvent} />
        ) : route.tab === 'funnel' ? (
          <FunnelView onOpenEvent={openEvent} />
        ) : route.tab === 'posts' ? (
          <PostsView onOpenEvent={openEvent} />
        ) : route.tab === 'events' ? (
          <EventsView onOpenEvent={openEvent} />
        ) : route.tab === 'gaps' ? (
          <GapsView />
        ) : (
          <KeywordsView />
        )}
      </main>
    </>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
