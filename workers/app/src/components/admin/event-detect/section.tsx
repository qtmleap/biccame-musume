import type { ReactNode } from 'react'

/** 画面内の見出し。件数など補足は右に寄せる */
export const SectionHeading = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div className='mb-2 mt-8 flex items-baseline justify-between gap-4 first:mt-0'>
    <h2 className='text-xl font-bold text-foreground'>{children}</h2>
    {aside && <span className='text-sm text-muted-foreground tabular-nums'>{aside}</span>}
  </div>
)

/** 一覧が空のとき */
export const EmptyState = ({ children }: { children: ReactNode }) => (
  <div className='rounded-lg border border-card-border p-6 text-center text-sm text-muted-foreground'>{children}</div>
)
