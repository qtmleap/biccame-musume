import { cn } from '@/lib/utils'

type StatCardProps = { label: string; value: number; accent?: string }

export const StatCard = ({ label, value, accent = 'text-foreground' }: StatCardProps) => (
  <div className='bg-card border border-card-border rounded-xl px-3 py-3 md:px-4 min-w-0 text-center overflow-hidden'>
    <div
      className={cn('font-numeric font-black tabular-nums text-xl md:text-3xl leading-none truncate', accent)}
      style={{ letterSpacing: '-0.04em' }}
    >
      {value}
    </div>
    <div className='mt-1 text-[10px] md:text-[11px] text-muted-foreground truncate'>{label}</div>
  </div>
)
