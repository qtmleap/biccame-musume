import { createFileRoute } from '@tanstack/react-router'
import { storeName } from '@/components/admin/event-detect/constants'
import { formatDate } from '@/components/admin/event-detect/format'
import { PostList } from '@/components/admin/event-detect/post-item'
import { EmptyState, Note, SectionHeading } from '@/components/admin/event-detect/section'
import { Td, TdNum, Th, ThNum } from '@/components/admin/event-detect/table-parts'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/table'
import { useEventDetectGaps } from '@/hooks/use-event-detect'

const anchorOf = (account: string) => `gap-${account}`

const GapsPage = () => {
  const { data } = useEventDetectGaps()
  const total = data.gaps.reduce((sum, gap) => sum + gap.posts.length, 0)

  return (
    <div>
      <Note>
        強シグナル（景品名＋配布方法か購入条件＋日付表現）の投稿のうち、その店舗の D1 イベント期間（告知 45 日前〜終了 7
        日後、終了日なしは開始 120 日後まで）のどれにも入らないもの。{total} 件 / {data.gaps.length} アカウント。
      </Note>
      {data.gaps.length === 0 ? (
        <EmptyState>登録漏れ候補はありません</EmptyState>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className='hover:bg-transparent'>
                <Th>アカウント</Th>
                <Th>店舗</Th>
                <ThNum>件数</ThNum>
                <ThNum>最初</ThNum>
                <ThNum>最後</ThNum>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.gaps.map((gap) => (
                <TableRow key={gap.account}>
                  <Td>
                    <a
                      href={`#${anchorOf(gap.account)}`}
                      className='underline underline-offset-2 hover:text-brand'
                      onClick={(event) => {
                        event.preventDefault()
                        document.getElementById(anchorOf(gap.account))?.scrollIntoView({ behavior: 'smooth' })
                      }}
                    >
                      @{gap.account}
                    </a>
                  </Td>
                  <Td>{gap.stores.map(storeName).join(', ')}</Td>
                  <TdNum>{gap.posts.length}</TdNum>
                  <TdNum>{formatDate(gap.posts[0].createdAt)}</TdNum>
                  <TdNum>{formatDate(gap.posts[gap.posts.length - 1].createdAt)}</TdNum>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.gaps.map((gap) => (
            <section key={gap.account} id={anchorOf(gap.account)} className='scroll-mt-4'>
              <SectionHeading aside={`${gap.posts.length} 件`}>
                @{gap.account}（{gap.stores.map(storeName).join(', ')}）
              </SectionHeading>
              <PostList posts={gap.posts} />
            </section>
          ))}
        </>
      )}
    </div>
  )
}

export const Route = createFileRoute('/admin/event-detect/gaps/')({
  component: GapsPage
})
