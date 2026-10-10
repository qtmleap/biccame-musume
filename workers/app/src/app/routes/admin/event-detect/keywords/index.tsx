import { createFileRoute } from '@tanstack/react-router'
import { EXCLUDE_GROUP_LABELS, GROUP_LABELS, RESCUE_KIND_LABELS } from '@/components/admin/event-detect/constants'
import { formatNumber } from '@/components/admin/event-detect/format'
import { SectionHeading } from '@/components/admin/event-detect/section'
import { Td, TdNum, Th, ThNum } from '@/components/admin/event-detect/table-parts'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/table'
import { useEventDetectKeywords, useSetEventDetectKeywords } from '@/hooks/use-event-detect'
import { cn } from '@/lib/utils'

type Stat = { keyword: string; disabled: boolean }

/** 無効の語は語だけ打ち消し線にして、数値や操作は薄くしない。「無効」の文字も添える */
const WordCell = ({ keyword, disabled }: Stat) => (
  <Td>
    <span className='inline-flex items-center gap-2'>
      <span className={cn(disabled && 'text-muted-foreground line-through')}>{keyword}</span>
      {disabled && (
        <Badge variant='outline' className='rounded-md border-border text-muted-foreground'>
          無効
        </Badge>
      )}
    </span>
  </Td>
)

const KeywordsPage = () => {
  const { data } = useEventDetectKeywords()
  const mutation = useSetEventDetectKeywords()

  // 切り替えた 1 語を反映した「無効の語」一覧を作って保存する
  const disabledOf = (stats: Stat[], toggled?: string) =>
    stats.filter((stat) => (stat.keyword === toggled ? !stat.disabled : stat.disabled)).map((stat) => stat.keyword)
  const toggleKeyword = (keyword: string) =>
    mutation.mutate({ disabled: disabledOf(data.keywords, keyword), disabledExcludes: disabledOf(data.excludes) })
  const toggleExclude = (keyword: string) =>
    mutation.mutate({ disabled: disabledOf(data.keywords), disabledExcludes: disabledOf(data.excludes, keyword) })
  const excludes = [...data.excludes].sort((a, b) => b.posts - a.posts)

  return (
    <div>
      {mutation.isError && (
        <p role='alert' className='mb-3 text-sm text-destructive'>
          保存できませんでした: {mutation.error.message}
        </p>
      )}

      <SectionHeading aside={`${data.keywords.length} 語`}>キーワード</SectionHeading>
      <Table>
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            <Th className='w-16'>有効</Th>
            <Th>語</Th>
            <Th>種類</Th>
            <ThNum>投稿</ThNum>
            <ThNum>正解</ThNum>
            <ThNum>単独 投稿</ThNum>
            <ThNum>単独 正解</ThNum>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.keywords.map((stat) => (
            <TableRow key={stat.keyword}>
              <Td>
                <Checkbox
                  aria-label={`${stat.keyword} を有効にする`}
                  checked={!stat.disabled}
                  disabled={mutation.isPending}
                  onCheckedChange={() => toggleKeyword(stat.keyword)}
                />
              </Td>
              <WordCell {...stat} />
              <Td>{GROUP_LABELS[stat.group]}</Td>
              <TdNum>{formatNumber(stat.posts)}</TdNum>
              <TdNum>{formatNumber(stat.gold)}</TdNum>
              <TdNum>{formatNumber(stat.onlyPosts)}</TdNum>
              <TdNum>{formatNumber(stat.onlyGold)}</TdNum>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <SectionHeading aside={`${excludes.length} 語`}>除外語</SectionHeading>
      <Table>
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            <Th className='w-16'>有効</Th>
            <Th>語</Th>
            <Th>分類</Th>
            <ThNum>投稿</ThNum>
            <ThNum>単独</ThNum>
            <ThNum>含む正解</ThNum>
            <ThNum>救済された正解</ThNum>
            <ThNum>正解が落ちる</ThNum>
          </TableRow>
        </TableHeader>
        <TableBody>
          {excludes.map((stat) => (
            <TableRow key={stat.keyword}>
              <Td>
                <Checkbox
                  aria-label={`${stat.keyword} を有効にする`}
                  checked={!stat.disabled}
                  disabled={mutation.isPending}
                  onCheckedChange={() => toggleExclude(stat.keyword)}
                />
              </Td>
              <WordCell {...stat} />
              <Td>{EXCLUDE_GROUP_LABELS[stat.group]}</Td>
              <TdNum>{formatNumber(stat.posts)}</TdNum>
              <TdNum>{formatNumber(stat.onlyPosts)}</TdNum>
              <TdNum>{formatNumber(stat.gold)}</TdNum>
              <TdNum>{formatNumber(stat.rescuedGold)}</TdNum>
              {/* 0 であるべき値。0 でなければ destructive で目立たせる */}
              <TdNum className={cn(stat.droppedGold > 0 && 'font-bold text-destructive')}>
                {formatNumber(stat.droppedGold)}
              </TdNum>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <SectionHeading aside={`${data.rescues.length} 語`}>救済語</SectionHeading>
      <Table>
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            <Th>語</Th>
            <Th>種類</Th>
            <ThNum>救済した投稿</ThNum>
            <ThNum>単独</ThNum>
            <ThNum>救済した正解</ThNum>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rescues.map((stat) => (
            <TableRow key={stat.keyword}>
              <Td>{stat.keyword}</Td>
              <Td>{RESCUE_KIND_LABELS[stat.kind]}</Td>
              <TdNum>{formatNumber(stat.posts)}</TdNum>
              <TdNum>{formatNumber(stat.onlyPosts)}</TdNum>
              <TdNum>{formatNumber(stat.gold)}</TdNum>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export const Route = createFileRoute('/admin/event-detect/keywords/')({
  component: KeywordsPage
})
