import { createFileRoute, Link } from '@tanstack/react-router'
import {
  accountSortToSearch,
  nextAccountSort,
  resolveAccountSort,
  sortAccounts
} from '@/components/admin/event-detect/account-sort'
import { storeName, TONE } from '@/components/admin/event-detect/constants'
import { formatDate, formatNumber } from '@/components/admin/event-detect/format'
import { SectionHeading } from '@/components/admin/event-detect/section'
import { GROUP_EDGE, SortableTh, Td, TdNum, Th, ThGroup, ThNum } from '@/components/admin/event-detect/table-parts'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableFooter, TableHeader, TableRow } from '@/components/ui/table'
import { useEventDetectSummary } from '@/hooks/use-event-detect'
import { cn } from '@/lib/utils'
import { type EventDetectAccountSortKey, EventDetectStatsSearchSchema } from '@/schemas/event-detect-search'

/** ラベルと値を横に並べる定義リスト */
const Facts = ({ items }: { items: { term: string; description: React.ReactNode }[] }) => (
  <dl className='grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm'>
    {items.map((item) => (
      <div key={item.term} className='contents'>
        <dt className='text-muted-foreground'>{item.term}</dt>
        <dd className='min-w-0 break-words text-foreground'>{item.description}</dd>
      </div>
    ))}
  </dl>
)

/**
 * アカウント別の列。2 段見出しの下段に置く文言（上段の「投稿」「イベント」と合わせて読む）、
 * 数値列か（右寄せ・アイコンは文字の左）、上段と下段にまたがるか、グループの左端か（縦線を引く）を持つ。
 */
const ACCOUNT_COLUMNS: Record<
  EventDetectAccountSortKey,
  { label: string; numeric: boolean; tall: boolean; edge: boolean }
> = {
  screenName: { label: 'アカウント', numeric: false, tall: true, edge: false },
  store: { label: '店舗', numeric: false, tall: true, edge: false },
  posts: { label: '全体', numeric: true, tall: false, edge: true },
  candidates: { label: '候補', numeric: true, tall: false, edge: false },
  emulated: { label: 'LLM', numeric: true, tall: false, edge: true },
  emulatedEnded: { label: '終了', numeric: true, tall: false, edge: false },
  events: { label: 'D1', numeric: true, tall: false, edge: false },
  goldPosts: { label: 'D1 参考投稿', numeric: true, tall: true, edge: true }
}

/** LLM イベントの一覧へ渡す絞り込み。年・店舗の片方か、どちらも無し（全体）に、終了のあるものだけへの絞り込みを足せる */
type EmulatedLink = { year?: number; store?: string; ended?: 1 }

/**
 * 統計の LLM・終了の件数。0 より大きいときだけ、その条件の LLM イベント一覧へのリンクにする
 * （「—」や 0 はそのまま）。数値の右寄せ・等幅は TdNum が持つ。
 */
const EmulatedCount = ({ text, count, filter }: { text: string; count: number; filter: EmulatedLink }) =>
  count > 0 ? (
    <Link
      to='/admin/event-detect/emulated'
      search={filter}
      className='underline-offset-2 hover:text-brand hover:underline'
    >
      {text}
    </Link>
  ) : (
    text
  )

/** 投稿が 1 件も無ければ最古・最新は null */
const formatBound = (iso: string | null): string => (iso === null ? '—' : formatDate(iso))

const StatsPage = () => {
  const { data } = useEventDetectSummary()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { source, totals } = data
  const sort = resolveAccountSort(search)
  // 店舗のあるアカウントだけを並べ替える。その他は並びに関わらず表の最後に置く
  const storeAccounts = sortAccounts(
    data.accounts.flatMap((account) => (account.store === null ? [] : [{ ...account, store: account.store }])),
    sort
  )
  const otherAccounts = data.accounts.filter((account) => account.store === null)
  // emulate を実行していないと件数は 0 になるので、0 件と区別して「—」にする
  const emulatedCell = (value: number): string => (source.emulatedAt === null ? '—' : formatNumber(value))
  const sortableTh = (key: EventDetectAccountSortKey) => {
    const column = ACCOUNT_COLUMNS[key]
    return (
      <SortableTh
        scope='col'
        rowSpan={column.tall ? 2 : undefined}
        label={column.label}
        numeric={column.numeric}
        className={cn(column.edge && GROUP_EDGE)}
        order={sort.key === key ? sort.order : null}
        onSort={() =>
          navigate({
            search: (previous) => ({ ...previous, ...accountSortToSearch(nextAccountSort(sort, key)) }),
            replace: true
          })
        }
      />
    )
  }
  const sumOf = (pick: (account: (typeof data.accounts)[number]) => number) =>
    otherAccounts.reduce((total, account) => total + pick(account), 0)

  return (
    <div>
      <SectionHeading>データ</SectionHeading>
      <Facts
        items={[
          {
            term: 'アーカイブ',
            description: `${source.archive}（${formatNumber(source.pages)} ページ）`
          },
          {
            term: '期間',
            description: `${formatBound(source.oldest)} 〜 ${formatBound(source.newest)}`
          },
          { term: '投稿', description: `${formatNumber(totals.posts)} 件` },
          {
            term: 'アカウント',
            description: `${formatNumber(totals.accounts)} 件（店舗 ${formatNumber(totals.storeAccounts)} / その他 ${formatNumber(totals.accounts - totals.storeAccounts)}）`
          },
          {
            term: '取得状況',
            description: source.complete ? (
              '完了'
            ) : (
              <Badge variant='outline' className={TONE.warning}>
                未完了: 投稿が欠けている可能性がある
              </Badge>
            )
          },
          {
            term: '正解データ',
            description: `公開 API の検証済みイベント ${formatNumber(source.events)} 件（${formatDate(source.goldFetchedAt)} 取得）`
          },
          {
            term: '手動ラベル',
            description: `${formatNumber(data.labels.total)} 件（イベント ${data.labels.event} / 違う ${data.labels.notEvent} / 保留 ${data.labels.unsure}）`
          }
        ]}
      />

      <SectionHeading aside={`${formatNumber(data.years.length)} 年`}>年別</SectionHeading>
      <Table>
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            <Th scope='col' rowSpan={2}>
              年
            </Th>
            <ThGroup colSpan={4}>投稿</ThGroup>
            <ThGroup colSpan={3}>イベント</ThGroup>
          </TableRow>
          <TableRow className='hover:bg-transparent'>
            <ThNum scope='col' className={GROUP_EDGE}>
              全体
            </ThNum>
            <ThNum scope='col'>候補</ThNum>
            <ThNum scope='col'>LLM</ThNum>
            <ThNum scope='col'>Clef</ThNum>
            <ThNum scope='col' className={GROUP_EDGE}>
              LLM
            </ThNum>
            <ThNum scope='col'>終了</ThNum>
            <ThNum scope='col'>D1</ThNum>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.years.map((year) => (
            <TableRow key={year.year}>
              <Td>{year.year}</Td>
              <TdNum className={GROUP_EDGE}>{formatNumber(year.posts)}</TdNum>
              <TdNum>{formatNumber(year.candidates)}</TdNum>
              <TdNum>{formatNumber(year.llm)}</TdNum>
              <TdNum>{formatNumber(year.clef)}</TdNum>
              <TdNum className={GROUP_EDGE}>
                <EmulatedCount text={emulatedCell(year.emulated)} count={year.emulated} filter={{ year: year.year }} />
              </TdNum>
              <TdNum>
                <EmulatedCount
                  text={emulatedCell(year.emulatedEnded)}
                  count={year.emulatedEnded}
                  filter={{ year: year.year, ended: 1 }}
                />
              </TdNum>
              <TdNum>{formatNumber(year.events)}</TdNum>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className='hover:bg-transparent'>
            <Td>合計</Td>
            <TdNum className={GROUP_EDGE}>{formatNumber(totals.posts)}</TdNum>
            <TdNum>{formatNumber(totals.candidates)}</TdNum>
            <TdNum>{formatNumber(totals.llm)}</TdNum>
            <TdNum>{formatNumber(totals.clef)}</TdNum>
            <TdNum className={GROUP_EDGE}>
              <EmulatedCount text={emulatedCell(totals.emulated)} count={totals.emulated} filter={{}} />
            </TdNum>
            <TdNum>
              <EmulatedCount
                text={emulatedCell(totals.emulatedEnded)}
                count={totals.emulatedEnded}
                filter={{ ended: 1 }}
              />
            </TdNum>
            <TdNum>{formatNumber(totals.events)}</TdNum>
          </TableRow>
        </TableFooter>
      </Table>

      <SectionHeading aside={`店舗アカウント ${formatNumber(storeAccounts.length)} 件`}>アカウント別</SectionHeading>
      <Table>
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            {sortableTh('screenName')}
            {sortableTh('store')}
            <ThGroup colSpan={2}>投稿</ThGroup>
            <ThGroup colSpan={3}>イベント</ThGroup>
            {sortableTh('goldPosts')}
          </TableRow>
          <TableRow className='hover:bg-transparent'>
            {sortableTh('posts')}
            {sortableTh('candidates')}
            {sortableTh('emulated')}
            {sortableTh('emulatedEnded')}
            {sortableTh('events')}
          </TableRow>
        </TableHeader>
        <TableBody>
          {storeAccounts.map((account) => (
            <TableRow key={account.screenName}>
              <Td>@{account.screenName}</Td>
              <Td>{storeName(account.store)}</Td>
              <TdNum className={GROUP_EDGE}>{formatNumber(account.posts)}</TdNum>
              <TdNum>{formatNumber(account.candidates)}</TdNum>
              <TdNum className={GROUP_EDGE}>
                <EmulatedCount
                  text={emulatedCell(account.emulated)}
                  count={account.emulated}
                  filter={{ store: account.store }}
                />
              </TdNum>
              <TdNum>
                <EmulatedCount
                  text={emulatedCell(account.emulatedEnded)}
                  count={account.emulatedEnded}
                  filter={{ store: account.store, ended: 1 }}
                />
              </TdNum>
              <TdNum>{formatNumber(account.events)}</TdNum>
              <TdNum className={GROUP_EDGE}>{formatNumber(account.goldPosts)}</TdNum>
            </TableRow>
          ))}
          {otherAccounts.length > 0 && (
            <TableRow className='text-muted-foreground'>
              <Td>その他 {formatNumber(otherAccounts.length)} アカウント</Td>
              <Td>—</Td>
              <TdNum className={GROUP_EDGE}>{formatNumber(sumOf((account) => account.posts))}</TdNum>
              <TdNum>{formatNumber(sumOf((account) => account.candidates))}</TdNum>
              <TdNum className={GROUP_EDGE}>—</TdNum>
              <TdNum>—</TdNum>
              <TdNum>—</TdNum>
              <TdNum className={GROUP_EDGE}>{formatNumber(sumOf((account) => account.goldPosts))}</TdNum>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export const Route = createFileRoute('/admin/event-detect/')({
  validateSearch: EventDetectStatsSearchSchema,
  component: StatsPage
})
