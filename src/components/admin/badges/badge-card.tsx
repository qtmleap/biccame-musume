import { Pencil, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useDeleteBadge } from '@/hooks/use-admin-badges'
import { getBadgeIcon } from '@/lib/badge-icons'
import { STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM, STICKER_TAPES } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import { BADGE_LABELS, BADGE_RARITY_LABELS } from '@/locales/app.content'
import type { Badge as BadgeDto } from '@/schemas/badge.dto'
import { RARITY_CHIP, RARITY_ICON_BG } from './badge-display-constants'
import { EditBadgeDialog } from './edit-badge-dialog'

export const BadgeCard = ({ badge, index }: { badge: BadgeDto; index: number }) => {
  const [editOpen, setEditOpen] = useState(false)
  const deleteBadge = useDeleteBadge()
  const isSpecial = badge.code.startsWith('special_')
  const tape = STICKER_TAPES[index % STICKER_TAPES.length]

  const Icon = (() => {
    try {
      return getBadgeIcon(badge.icon_name)
    } catch {
      return null
    }
  })()

  return (
    <>
      <motion.div className='h-full' style={{ filter: STICKER_SHADOW_SM }}>
        <motion.div
          className='h-full'
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={STICKER_HOVER_TRANSITION}
        >
          <div className='relative flex flex-col h-full rounded-xl border border-zinc-200 dark:border-card-border bg-card p-3'>
            {tape && (
              <div
                aria-hidden
                className={cn('absolute rounded-sm', tape.position, tape.size, tape.color, tape.angle)}
              />
            )}
            <div className='mb-2 flex items-start justify-between gap-3'>
              <div className='flex-1 min-w-0 flex items-start gap-3'>
                <div
                  className={cn(
                    'flex size-12 shrink-0 items-center justify-center rounded-2xl',
                    RARITY_ICON_BG[badge.rarity]
                  )}
                >
                  {Icon && <Icon className='size-6' />}
                </div>
                <div className='flex-1 min-w-0'>
                  <h3 className='text-base font-semibold text-foreground line-clamp-2 leading-tight'>{badge.name}</h3>
                  <p className='mt-1 text-xs text-muted-foreground line-clamp-2'>{badge.description}</p>
                  <div className='mt-1 flex items-center gap-1.5 flex-wrap'>
                    <span
                      className={cn(
                        'font-numeric font-bold text-[10px] px-1.5 py-0.5 rounded-full tracking-widest',
                        RARITY_CHIP[badge.rarity]
                      )}
                    >
                      {BADGE_RARITY_LABELS[badge.rarity]}
                    </span>
                    <span className='font-numeric font-bold text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums'>
                      {BADGE_LABELS.earnedCount.replace('{count}', String(badge.earned_count ?? 0))}
                    </span>
                  </div>
                </div>
              </div>
              {(badge.is_hidden || isSpecial) && (
                <div className='shrink-0 flex flex-col items-end gap-1'>
                  {isSpecial && (
                    <span className='text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rank-gold/15 text-rank-gold-foreground'>
                      {BADGE_LABELS.special}
                    </span>
                  )}
                  {badge.is_hidden && (
                    <span className='text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground'>
                      {BADGE_LABELS.hidden}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className='flex items-center justify-end gap-2 mt-auto'>
              <Button size='sm' variant='outline' className='border-card-border' onClick={() => setEditOpen(true)}>
                <Pencil className='mr-1 size-3' />
                編集
              </Button>
              {isSpecial && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size='sm' variant='destructive'>
                      <Trash2 className='mr-1 size-3' />
                      削除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>バッジを削除しますか？</AlertDialogTitle>
                      <AlertDialogDescription>
                        「{badge.name}
                        」を削除します。この操作は取り消せません。獲得済みユーザーのバッジ記録も削除されます。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>キャンセル</AlertDialogCancel>
                      <AlertDialogAction variant='destructive' onClick={() => deleteBadge.mutate(badge.code)}>
                        削除する
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      <EditBadgeDialog badge={badge} open={editOpen} onClose={() => setEditOpen(false)} />
    </>
  )
}
