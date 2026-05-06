import { Link } from '@tanstack/react-router'
import { Cake, Store } from 'lucide-react'
import { motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DrawerClose, DrawerFooter } from '@/components/ui/drawer'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { CALENDAR_LABELS } from '@/locales/app.content'
import type { StoreData } from '@/schemas/store.dto'

type CalendarEvent = {
  date: string
  character: StoreData
  type: 'character' | 'store'
  years: number
}

type CalendarEventDrawerContentProps = {
  year: number
  month: number
  day: number
  events: CalendarEvent[]
}

/**
 * カレンダーイベント詳細Drawerコンテンツ
 */
export const CalendarEventDrawerContent = ({ events }: CalendarEventDrawerContentProps) => {
  return (
    <>
      <div className='px-4 pb-4 space-y-3 overflow-y-auto'>
        {events.map((event, eventIndex) => {
          const isCharacter = event.type === 'character'
          return (
            <motion.div
              key={`drawer-${event.character.id}-${event.type}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: DURATION.fast,
                delay: eventIndex * 0.05,
                ease: 'easeOut'
              }}
            >
              <Link
                to='/characters/$id'
                params={{ id: event.character.id }}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border-card transition-colors',
                  isCharacter ? 'bg-action-interest/15 hover:bg-action-interest/25' : 'bg-info/15 hover:bg-info/25'
                )}
              >
                <Avatar className='w-12 h-12'>
                  <AvatarImage
                    src={event.character.character?.image_url}
                    alt={event.character.character?.name || ''}
                    className='object-cover object-top scale-150 translate-y-2'
                  />
                  <AvatarFallback>{event.character.character?.name?.slice(0, 1) || '?'}</AvatarFallback>
                </Avatar>
                <div className='flex-1 min-w-0'>
                  <p className='font-medium truncate'>{event.character.character?.name}</p>
                  <p className='text-sm text-muted-foreground truncate'>{event.character.store?.name}</p>
                  <Badge variant='secondary' className='mt-1'>
                    {isCharacter ? <Cake className='w-3 h-3' /> : <Store className='w-3 h-3' />}
                    {event.years}
                    {isCharacter ? CALENDAR_LABELS.age : CALENDAR_LABELS.anniversary}
                  </Badge>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>
      <DrawerFooter>
        <DrawerClose asChild>
          <Button variant='outline'>閉じる</Button>
        </DrawerClose>
      </DrawerFooter>
    </>
  )
}
