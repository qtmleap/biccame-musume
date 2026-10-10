import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { TableCell, TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { EventDetectSortOrder } from '@/schemas/event-detect-search'
import { NUM } from './constants'

// 表のセルの共通の見た目。ヘッダは淡い地、数値は右寄せ・等幅数字。複合指標は 1 セルに詰めず列を分ける。
export const Th = ({ className, ...props }: ComponentProps<typeof TableHead>) => (
  <TableHead className={cn('h-9 bg-muted px-3 text-xs font-medium text-muted-foreground', className)} {...props} />
)

export const ThNum = ({ className, ...props }: ComponentProps<typeof TableHead>) => (
  <Th className={cn(NUM, className)} {...props} />
)

/** 列グループの左端に引く薄い縦線。見出し・本文・合計行の同じ列に付けて、グループの境を揃える */
export const GROUP_EDGE = 'border-l border-border'

/** 2 段見出しの上段。複数の列にまたがるグループ名を中央に置く */
export const ThGroup = ({ className, ...props }: ComponentProps<typeof TableHead>) => (
  <Th scope='colgroup' className={cn('text-center', GROUP_EDGE, className)} {...props} />
)

const SORT_ICONS = { asc: ArrowUp, desc: ArrowDown } as const

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

/**
 * 押して並べ替える見出し。order は選択中の列の向きで、選択中でなければ null。
 * 向きのアイコンはどれも同じ大きさで、列幅は押しても変わらない。数値列はアイコンを文字の左に置き、文字を数値の右端に揃える。
 */
export const SortableTh = ({
  label,
  order,
  numeric = false,
  onSort,
  className,
  ...props
}: Omit<ComponentProps<typeof TableHead>, 'children' | 'aria-sort' | 'onClick'> & {
  label: string
  order: EventDetectSortOrder | null
  numeric?: boolean
  onSort: () => void
}) => {
  const Icon = order === null ? ArrowUpDown : SORT_ICONS[order]
  return (
    <Th className={cn(numeric && NUM, className)} aria-sort={order === null ? 'none' : ARIA_SORT[order]} {...props}>
      <button
        type='button'
        onClick={onSort}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
          numeric && 'flex-row-reverse',
          order !== null && 'text-foreground'
        )}
      >
        {label}
        <Icon aria-hidden className={cn('size-3.5 shrink-0', order === null && 'opacity-40')} />
      </button>
    </Th>
  )
}

export const Td = ({ className, ...props }: ComponentProps<typeof TableCell>) => (
  <TableCell className={cn('px-3 py-2 align-top', className)} {...props} />
)

export const TdNum = ({ className, ...props }: ComponentProps<typeof TableCell>) => (
  <Td className={cn(NUM, className)} {...props} />
)
