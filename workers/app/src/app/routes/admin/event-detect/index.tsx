import { createFileRoute, Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { TONE, TYPE_LABELS } from '@/components/admin/event-detect/constants'
import { formatDate, formatNumber, percent } from '@/components/admin/event-detect/format'
import { PostList } from '@/components/admin/event-detect/post-item'
import { EmptyState, Note, SectionHeading } from '@/components/admin/event-detect/section'
import { Td, TdNum, Th, ThNum } from '@/components/admin/event-detect/table-parts'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/table'
import { useEventDetectSummary } from '@/hooks/use-event-detect'

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

const FunnelPage = () => {
  const { data } = useEventDetectSummary()
  const total = data.totals
  const first = data.funnel[0]
  const missingInRange = data.missingGold.filter((entry) => entry.inRange)

  return (
    <div>
      <SectionHeading>データ</SectionHeading>
      <Facts
        items={[
          {
            term: 'アーカイブ',
            description: `${data.source.archive}（${formatNumber(data.source.posts)} 件、${formatDate(data.source.from)} 〜 ${formatDate(data.source.until)}、${formatNumber(data.source.pages)} ページ）`
          },
          {
            term: '取得状況',
            description: data.source.complete ? (
              '完了'
            ) : (
              <Badge variant='outline' className={TONE.warning}>
                未完了: 期間内でも投稿が欠けている可能性がある
              </Badge>
            )
          },
          {
            term: '正解データ',
            description: `公開 API の検証済みイベント ${formatNumber(data.source.events)} 件（${formatDate(data.source.goldFetchedAt)} 取得）、参考 URL がアーカイブ内の投稿を指すもの ${formatNumber(total.gold)} 件`
          },
          {
            term: '手動ラベル',
            description: `${formatNumber(data.labels.total)} 件（イベント ${data.labels.event} / 違う ${data.labels.notEvent} / 保留 ${data.labels.unsure}）`
          }
        ]}
      />

      <SectionHeading>ファネル</SectionHeading>
      <Note>
        各段はそれより上の除外をすべて適用した後の件数。正解は参考 URL
        が指す投稿で、正例しか無いため適合率は測れない（手動ラベルで補う）。
      </Note>
      <Table>
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            <Th>段階</Th>
            <ThNum>投稿</ThNum>
            <ThNum>残存率</ThNum>
            <ThNum>正解</ThNum>
            <ThNum>再現率</ThNum>
            <ThNum>告知</ThNum>
            <ThNum>開始</ThNum>
            <ThNum>終了</ThNum>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.funnel.map((stage) => (
            <TableRow key={stage.key}>
              <Td>{stage.label}</Td>
              <TdNum>{formatNumber(stage.posts)}</TdNum>
              <TdNum>{percent(stage.posts, first.posts)}</TdNum>
              <TdNum>{formatNumber(stage.gold)}</TdNum>
              <TdNum>{percent(stage.gold, total.gold)}</TdNum>
              <TdNum>{stage.goldByType.announce}</TdNum>
              <TdNum>{stage.goldByType.start}</TdNum>
              <TdNum>{stage.goldByType.end}</TdNum>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <SectionHeading aside={`${data.droppedGold.length} 件`}>除外された正解</SectionHeading>
      <Note>機械フィルタで落ちた正解投稿。本文に手掛かりが無いものは画像を読む必要がある。</Note>
      {data.droppedGold.length === 0 ? (
        <EmptyState>除外された正解はありません</EmptyState>
      ) : (
        <PostList posts={data.droppedGold} />
      )}

      <SectionHeading aside={`期間内 ${missingInRange.length} 件`}>アーカイブに無い正解</SectionHeading>
      <Note>期間外のものはアーカイブ開始前の投稿。期間内のものはリスト外のアカウントか、取得漏れ。</Note>
      {missingInRange.length === 0 ? (
        <EmptyState>期間内でアーカイブに無い正解はありません</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className='hover:bg-transparent'>
              <Th>投稿</Th>
              <Th>アカウント</Th>
              <Th>イベント</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {missingInRange.map((entry) => (
              <TableRow key={entry.id}>
                <Td>
                  <a
                    href={`https://x.com/${entry.screenName}/status/${entry.id}`}
                    target='_blank'
                    rel='noreferrer'
                    className='inline-flex items-center gap-1 font-numeric tabular-nums underline underline-offset-2 hover:text-brand'
                  >
                    {entry.id}
                    <ExternalLink className='size-3' />
                  </a>
                </Td>
                <Td>@{entry.screenName}</Td>
                <Td>
                  <ul className='space-y-1'>
                    {entry.events.map((event) => (
                      <li key={`${event.eventId}-${event.type}`} className='flex items-center gap-2'>
                        <span className='shrink-0 text-xs text-muted-foreground'>{TYPE_LABELS[event.type]}</span>
                        <Link
                          to='/admin/event-detect/events/$uuid'
                          params={{ uuid: event.eventId }}
                          className='underline underline-offset-2 hover:text-brand'
                        >
                          {event.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

export const Route = createFileRoute('/admin/event-detect/')({
  component: FunnelPage
})
