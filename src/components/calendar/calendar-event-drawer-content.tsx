import { Cake, Store } from 'lucide-react'
import { motion } from 'motion/react'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DrawerClose, DrawerFooter } from '@/components/ui/drawer'
import { cn, getCharacterImageUrl } from '@/lib/utils'
import type { Character } from '@/schemas/character.dto'

type CalendarEvent = {
  date: string
  character: Character
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
              key={`drawer-${event.character.key}-${event.type}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.15,
                delay: eventIndex * 0.05,
                ease: 'easeOut'
              }}
            >
              <Link
                href={`/characters/${event.character.key}`}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg transition-colors',
                  isCharacter ? 'bg-pink-500/10 hover:bg-pink-500/20' : 'bg-blue-500/10 hover:bg-blue-500/20'
                )}
              >
                <Avatar className='w-12 h-12 border border-border overflow-hidden'>
                  <AvatarImage
                    src={getCharacterImageUrl(event.character)}
                    alt={event.character.character_name}
                    className='object-cover object-top scale-150 translate-y-2'
                  />
                  <AvatarFallback>{event.character.character_name.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className='flex-1 min-w-0'>
                  <p className='font-medium truncate'>{event.character.character_name}</p>
                  <p className='text-sm text-muted-foreground truncate'>{event.character.store_name}</p>
                  <Badge
                    variant='secondary'
                    className={cn(
                      'mt-1 text-xs flex items-center gap-1 w-fit',
                      isCharacter
                        ? 'bg-pink-500/20 text-pink-700 dark:text-pink-300'
                        : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                    )}
                  >
                    {isCharacter ? <Cake className='w-3 h-3' /> : <Store className='w-3 h-3' />}
                    {event.years}
                    {isCharacter ? '歳' : '周年'}
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
