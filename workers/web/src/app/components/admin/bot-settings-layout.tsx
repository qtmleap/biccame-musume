import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** 左上の戻るリンク。親の画面に戻れるよう、画面ごとに戻り先を指定できる。 */
type BotSettingsBackLink = { to: '/admin' | '/admin/webhooks'; label: string }

type BotSettingsLayoutProps = {
  title: string
  description: string
  actions?: ReactNode
  /** 未指定は管理画面（最上位）に戻る。受信詳細のように親が受信履歴の画面は指定する。 */
  back?: BotSettingsBackLink
  children: ReactNode
}

const DEFAULT_BACK: BotSettingsBackLink = { to: '/admin', label: '管理画面に戻る' }

export const BotSettingsLayout = ({
  title,
  description,
  actions,
  back = DEFAULT_BACK,
  children
}: BotSettingsLayoutProps) => (
  <div className='min-h-screen bg-page-bg'>
    <main className='mx-auto max-w-6xl px-4 py-4 md:px-8 md:py-6'>
      <Button variant='ghost' size='sm' className='-ml-2 mb-4 text-muted-foreground' asChild>
        <Link to={back.to}>
          <ArrowLeft className='size-4' />
          {back.label}
        </Link>
      </Button>
      <header className='mb-6 flex flex-wrap items-start justify-between gap-4 pb-5'>
        <div>
          <h1 className='font-display text-2xl font-bold md:text-3xl'>{title}</h1>
          <p className='mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground'>{description}</p>
        </div>
        {actions && <div className='flex flex-wrap items-center gap-2'>{actions}</div>}
      </header>
      {children}
    </main>
  </div>
)

export const BotSettingRow = ({
  label,
  children,
  className
}: {
  label: string
  children: ReactNode
  className?: string
}) => (
  <div className={cn('grid gap-1 border-b py-3 text-sm last:border-b-0 sm:grid-cols-[15rem_1fr] sm:gap-5', className)}>
    <dt className='text-muted-foreground'>{label}</dt>
    <dd className='min-w-0 break-words font-medium'>{children}</dd>
  </div>
)
