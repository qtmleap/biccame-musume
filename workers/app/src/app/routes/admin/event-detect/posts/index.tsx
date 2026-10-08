import { DropReasonSchema, POST_SCOPES } from '@biccame/shared/event-detect/viewer'
import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, Suspense, useId, useState } from 'react'
import { REASON_LABELS } from '@/components/admin/event-detect/constants'
import { FilterField } from '@/components/admin/event-detect/filter-field'
import { formatNumber } from '@/components/admin/event-detect/format'
import { ListSkeleton } from '@/components/admin/event-detect/loading'
import { PostList } from '@/components/admin/event-detect/post-item'
import { EmptyState } from '@/components/admin/event-detect/section'
import { EventListPagination } from '@/components/admin/event-list-pagination'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEventDetectAccounts, useEventDetectPosts } from '@/hooks/use-event-detect'
import { EventDetectPostsSearchSchema } from '@/schemas/event-detect-search'

const PER_PAGE = 50

const SCOPE_LABELS: Record<(typeof POST_SCOPES)[number], string> = {
  passed: '通過',
  unlabeled: '通過・正解なし・未ラベル',
  strong: '強シグナル',
  gold: '正解',
  gold_dropped: '除外された正解',
  dropped: '除外',
  all: 'すべて'
}

/** Radix の Select は空文字の値を持てないので、「指定なし」はこの値で表す */
const ANY = '__any__'

/** 通過した投稿には除外理由が無いので、除外を含む範囲でだけ選べる */
const includesDropped = (scope: (typeof POST_SCOPES)[number]) =>
  scope === 'dropped' || scope === 'all' || scope === 'gold_dropped'

type Search = ReturnType<typeof Route.useSearch>

const Filters = ({ search, onChange }: { search: Search; onChange: (patch: Partial<Search>) => void }) => {
  const id = useId()
  const { data: accounts } = useEventDetectAccounts()
  const [draft, setDraft] = useState(search.q === undefined ? '' : search.q)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onChange({ q: draft === '' ? undefined : draft })
  }
  return (
    <div className='space-y-3'>
      <div className='grid gap-3 md:grid-cols-3'>
        <FilterField label='範囲'>
          <Select
            value={search.scope}
            onValueChange={(value) => {
              const scope = POST_SCOPES.find((entry) => entry === value)
              if (scope === undefined) return
              // 除外を含まない範囲に切り替えたら、除外理由の絞り込みは外す
              onChange(includesDropped(scope) ? { scope } : { scope, reason: undefined })
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POST_SCOPES.map((scope) => (
                <SelectItem key={scope} value={scope}>
                  {SCOPE_LABELS[scope]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label='アカウント'>
          <Select
            value={search.account === undefined ? ANY : search.account}
            onValueChange={(value) => onChange({ account: value === ANY ? undefined : value })}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>すべて</SelectItem>
              {accounts.accounts.map((account) => (
                <SelectItem key={account.screenName} value={account.screenName}>
                  @{account.screenName}（通過 {account.passed}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label='除外理由'>
          <Select
            value={search.reason === undefined ? ANY : search.reason}
            disabled={!includesDropped(search.scope)}
            onValueChange={(value) => {
              const reason = DropReasonSchema.safeParse(value)
              onChange({ reason: reason.success ? reason.data : undefined })
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>すべて</SelectItem>
              {DropReasonSchema.options.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {REASON_LABELS[reason]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </div>
      <div className='grid items-end gap-3 md:grid-cols-[repeat(2,minmax(0,10rem))_minmax(0,1fr)_auto]'>
        <FilterField label='期間（開始）' htmlFor={`${id}-from`}>
          <Input
            id={`${id}-from`}
            type='date'
            value={search.from === undefined ? '' : search.from}
            onChange={(event) => onChange({ from: event.target.value === '' ? undefined : event.target.value })}
          />
        </FilterField>
        <FilterField label='期間（終了）' htmlFor={`${id}-until`}>
          <Input
            id={`${id}-until`}
            type='date'
            value={search.until === undefined ? '' : search.until}
            onChange={(event) => onChange({ until: event.target.value === '' ? undefined : event.target.value })}
          />
        </FilterField>
        <form onSubmit={submit}>
          <FilterField label='本文（Enter で検索）' htmlFor={`${id}-q`}>
            <Input
              id={`${id}-q`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder='部分一致'
            />
          </FilterField>
        </form>
        <Label htmlFor={`${id}-dedup`} className='h-9 cursor-pointer gap-2 font-normal text-foreground'>
          <Checkbox
            id={`${id}-dedup`}
            checked={search.dedup}
            onCheckedChange={(checked) => onChange({ dedup: checked === true })}
          />
          同一文面をまとめる
        </Label>
      </div>
    </div>
  )
}

const Results = ({ search, onPage }: { search: Search; onPage: (page: number) => void }) => {
  const { page, dedup, ...filter } = search
  const offset = (page - 1) * PER_PAGE
  const { data } = useEventDetectPosts({ ...filter, dedup: dedup ? '1' : '0' }, offset, PER_PAGE)
  const totalPages = Math.max(1, Math.ceil(data.total / PER_PAGE))
  return (
    <div>
      <p className='mb-2 text-sm text-muted-foreground tabular-nums'>
        {formatNumber(data.total)} 件中 {formatNumber(Math.min(offset + 1, data.total))}〜
        {formatNumber(Math.min(offset + PER_PAGE, data.total))}
      </p>
      {data.posts.length === 0 ? <EmptyState>条件に合う投稿はありません</EmptyState> : <PostList posts={data.posts} />}
      <EventListPagination page={Math.min(page, totalPages)} totalPages={totalPages} onChange={onPage} />
    </div>
  )
}

const PostsPage = () => {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  // 絞り込みを変えたら 1 ページ目に戻す
  const update = (patch: Partial<Search>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true })
  return (
    <div className='space-y-4'>
      <Filters search={search} onChange={update} />
      <Suspense fallback={<ListSkeleton />}>
        <Results search={search} onPage={(page) => navigate({ search: (previous) => ({ ...previous, page }) })} />
      </Suspense>
    </div>
  )
}

export const Route = createFileRoute('/admin/event-detect/posts/')({
  validateSearch: EventDetectPostsSearchSchema,
  component: PostsPage
})
