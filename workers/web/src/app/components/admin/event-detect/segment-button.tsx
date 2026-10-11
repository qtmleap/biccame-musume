import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// 選択状態を持つ小さなボタン。押しても幅・高さ・枠・太さが変わらないよう、
// チェック印の場所を常に確保し、選択色は枠と淡い背景だけで示す。
const PRESSED = {
  brand: 'aria-pressed:border-brand aria-pressed:bg-brand/10',
  success: 'aria-pressed:border-success aria-pressed:bg-success/15',
  warning: 'aria-pressed:border-warning aria-pressed:bg-warning/20',
  destructive: 'aria-pressed:border-destructive aria-pressed:bg-destructive/15'
} as const

export const SegmentButton = ({
  pressed,
  tone = 'brand',
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'variant' | 'size' | 'aria-pressed'> & {
  pressed: boolean
  tone?: keyof typeof PRESSED
}) => (
  <Button
    type='button'
    variant='ghost'
    size='sm'
    aria-pressed={pressed}
    className={cn(
      'h-7 min-w-0 gap-1 border border-border px-1.5 text-xs font-medium text-foreground',
      PRESSED[tone],
      className
    )}
    {...props}
  >
    <Check aria-hidden className={cn('size-3.5 shrink-0', !pressed && 'invisible')} />
    <span className='truncate'>{children}</span>
  </Button>
)
