import type { GapEvent, GapVerify } from '@biccame/shared/event-detect/viewer'
import { createFileRoute } from '@tanstack/react-router'
import { categoryName, GOLD_TONE, storeName, TONE, TYPE_LABELS } from '@/components/admin/event-detect/constants'
import { formatDate, formatDateTime, formatDay, formatNumber } from '@/components/admin/event-detect/format'
import { PostList } from '@/components/admin/event-detect/post-item'
import { EmptyState, SectionHeading } from '@/components/admin/event-detect/section'
import { Td, TdNum, Th, ThNum } from '@/components/admin/event-detect/table-parts'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/table'
import { useEventDetectGaps } from '@/hooks/use-event-detect'
import { cn } from '@/lib/utils'

const anchorOf = (id: string) => `gap-event-${id}`

const percentOf = (probability: number) => `${Math.round(probability * 100)}%`

const StatusBadge = ({ status }: { status: GapEvent['status'] }) => (
  <Badge variant='outline' className={cn('rounded-md font-medium', GOLD_TONE[status])}>
    {TYPE_LABELS[status]}
  </Badge>
)

/**
 * Clef による再確認の結果。合流させた / new と答えた / 既存のイベントを選んだがしきい値に届かず見送った。
 * 見送りは合流候補だった印なので、目立つ色（warning）にする。
 */
const VerifyBadge = ({ verify }: { verify: GapVerify }) => {
  const percent = percentOf(verify.probability)
  const [label, tone] = verify.merged
    ? [`Clef 合流 ${percent}`, TONE.success]
    : verify.choice === 'new'
      ? [`Clef 新規 ${percent}`, TONE.info]
      : [`Clef 見送り ${percent}`, TONE.warning]
  return (
    <Badge variant='outline' className={cn('rounded-md font-medium', tone)}>
      {label}
    </Badge>
  )
}

/** 開始日。終了報告から作られて開始の投稿を見ていないイベントは「不明」にする */
const startOf = (event: GapEvent) => (event.startDate || !event.startUnknown ? formatDay(event.startDate) : '不明')

/** イベントの中での、その投稿の状態と再確認の結果 */
const entryOf = (event: GapEvent, postId: string) => event.posts.find((entry) => entry.post.id === postId)

/**
 * イベントを作ったときの再確認の結果。最初の言及が作った言及で、合流した言及の記録は持たない。
 * 同じ店舗に未終了のイベントが無かったときは再確認していないので undefined。
 */
const creationVerify = (event: GapEvent) => {
  const first = event.posts[0]
  return first?.verify && !first.verify.merged ? first.verify : undefined
}

/** 再確認で最も確率の高かった既存のイベント（new を除く）とその確率 */
const nearestExisting = (verify: GapVerify) =>
  Object.entries(verify.probabilities)
    .filter(([key]) => key !== 'new')
    .sort((a, b) => b[1] - a[1])[0]

/** 表の中のイベント名。長い名前は 2 行で切り、全体はツールチップで見せる */
const EventLink = ({ id, label }: { id: string; label: string }) => (
  <a
    href={`#${anchorOf(id)}`}
    title={label}
    className='line-clamp-2 underline underline-offset-2 hover:text-brand'
    onClick={(click) => {
      click.preventDefault()
      document.getElementById(anchorOf(id))?.scrollIntoView({ behavior: 'smooth' })
    }}
  >
    {label}
  </a>
)

const Dash = () => <span className='text-muted-foreground'>—</span>

const GapsPage = () => {
  const { data } = useEventDetectGaps()
  const mentions = data.events.reduce((sum, event) => sum + event.mentions, 0)
  const eventById = new Map(data.events.map((event) => [event.id, event]))
  // 再確認は言及単位で数える（同じ投稿が複数のイベントに載っていれば、それぞれ数える）
  const verifies = data.events.flatMap((event) => event.posts.flatMap((entry) => (entry.verify ? [entry.verify] : [])))
  const merged = verifies.filter((verify) => verify.merged).length
  const skipped = verifies.filter((verify) => !verify.merged && verify.choice !== 'new').length
  const clefSummary =
    verifies.length > 0
      ? ` Clef 再確認 ${formatNumber(verifies.length)} 件 / 合流 ${formatNumber(merged)} 件 / 見送り ${formatNumber(skipped)} 件。`
      : ''

  return (
    <div>
      {data.generatedAt !== null && (
        <p className='mb-3 text-sm text-muted-foreground'>
          {`生成 ${formatDateTime(data.generatedAt)} / 再確認 ${
            data.verify ? `${data.verify.model}（しきい値 ${data.verify.threshold}）` : 'なし'
          } / イベント ${formatNumber(data.events.length)} 件 / 言及 ${formatNumber(mentions)} 件 / イベントではない ${formatNumber(data.ignored)} 件。${clefSummary}`}
        </p>
      )}
      {data.events.length === 0 && data.pending.length === 0 ? (
        <EmptyState>登録漏れ候補はありません</EmptyState>
      ) : (
        <>
          {data.events.length > 0 && (
            <>
              <Table>
                <TableHeader>
                  <TableRow className='hover:bg-transparent'>
                    <Th>店舗</Th>
                    <Th>配布物</Th>
                    <Th>種別</Th>
                    <Th>状態</Th>
                    <ThNum>言及</ThNum>
                    <Th>Clef 判定</Th>
                    <Th>最も近い既存イベント</Th>
                    <ThNum>確率</ThNum>
                    <ThNum>開始日</ThNum>
                    <ThNum>終了日</ThNum>
                    <ThNum>最後</ThNum>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.events.map((event) => {
                    const verify = creationVerify(event)
                    const nearest = verify ? nearestExisting(verify) : undefined
                    const nearestEvent = nearest ? eventById.get(nearest[0]) : undefined
                    return (
                      <TableRow key={event.id}>
                        <Td className='min-w-20'>{storeName(event.store)}</Td>
                        <Td className='min-w-40'>
                          <EventLink id={event.id} label={event.item} />
                        </Td>
                        <Td className='whitespace-nowrap'>{categoryName(event.category)}</Td>
                        <Td>
                          <StatusBadge status={event.status} />
                        </Td>
                        <TdNum>{event.mentions}</TdNum>
                        <Td className='whitespace-nowrap'>{verify ? <VerifyBadge verify={verify} /> : <Dash />}</Td>
                        <Td className='min-w-32'>
                          {nearest === undefined ? (
                            <Dash />
                          ) : nearestEvent ? (
                            <EventLink id={nearestEvent.id} label={nearestEvent.item} />
                          ) : (
                            nearest[0]
                          )}
                        </Td>
                        <TdNum>{nearest ? percentOf(nearest[1]) : <Dash />}</TdNum>
                        <TdNum className='whitespace-nowrap'>{startOf(event)}</TdNum>
                        <TdNum className='whitespace-nowrap'>
                          {formatDay(event.endDate ? event.endDate : event.endedAt)}
                        </TdNum>
                        <TdNum className='whitespace-nowrap'>{formatDate(event.lastSeen)}</TdNum>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {data.events.map((event) => (
                <section key={event.id} id={anchorOf(event.id)} className='scroll-mt-4'>
                  <SectionHeading aside={`言及 ${event.mentions} 件`}>
                    {storeName(event.store)} / {event.item}
                  </SectionHeading>
                  <dl className='mb-3 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm'>
                    <dt className='text-muted-foreground'>種別</dt>
                    <dd>{categoryName(event.category)}</dd>
                    <dt className='text-muted-foreground'>期間</dt>
                    <dd>
                      {startOf(event)} 〜 {formatDay(event.endDate)}（実終了 {formatDay(event.endedAt)}）
                    </dd>
                    <dt className='text-muted-foreground'>言及の期間</dt>
                    <dd className='tabular-nums'>
                      {formatDate(event.firstSeen)} 〜 {formatDate(event.lastSeen)}
                    </dd>
                    <dt className='text-muted-foreground'>言及の内訳</dt>
                    <dd className='tabular-nums'>
                      告知 {event.statusCounts.announce} / 開始 {event.statusCounts.start} / 継続中{' '}
                      {event.statusCounts.ongoing} / 終了 {event.statusCounts.end}
                    </dd>
                    {event.quantity !== undefined && (
                      <>
                        <dt className='text-muted-foreground'>配布数</dt>
                        <dd className='tabular-nums'>{formatNumber(event.quantity)}</dd>
                      </>
                    )}
                  </dl>
                  <PostList
                    posts={event.posts.map((entry) => entry.post)}
                    badgeOf={(post) => {
                      const entry = entryOf(event, post.id)
                      if (!entry) return undefined
                      return (
                        <>
                          <StatusBadge status={entry.status} />
                          {entry.verify && <VerifyBadge verify={entry.verify} />}
                        </>
                      )
                    }}
                  />
                </section>
              ))}
            </>
          )}
          {data.pending.length > 0 && (
            <section className='scroll-mt-4'>
              <SectionHeading aside={`${data.pending.length} 件`}>未集約の投稿</SectionHeading>
              <PostList posts={data.pending} />
            </section>
          )}
        </>
      )}
    </div>
  )
}

export const Route = createFileRoute('/admin/event-detect/gaps/')({
  component: GapsPage
})
