import type { ComponentProps } from 'react'
import { TableCell, TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { NUM } from './constants'

// 表のセルの共通の見た目。ヘッダは淡い地、数値は右寄せ・等幅数字。複合指標は 1 セルに詰めず列を分ける。
export const Th = ({ className, ...props }: ComponentProps<typeof TableHead>) => (
  <TableHead className={cn('h-9 bg-muted px-3 text-xs font-medium text-muted-foreground', className)} {...props} />
)

export const ThNum = ({ className, ...props }: ComponentProps<typeof TableHead>) => (
  <Th className={cn(NUM, className)} {...props} />
)

export const Td = ({ className, ...props }: ComponentProps<typeof TableCell>) => (
  <TableCell className={cn('px-3 py-2 align-top', className)} {...props} />
)

export const TdNum = ({ className, ...props }: ComponentProps<typeof TableCell>) => (
  <Td className={cn(NUM, className)} {...props} />
)
