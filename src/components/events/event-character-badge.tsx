import { UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CHARACTER_NAME_LABELS, SPECIAL_CHARACTER_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import { isSpecialCharacter, resolveEventCharacter } from '@/utils/event-character'

type EventCharacterBadgeProps = {
  event: Pick<Event, 'characterId' | 'stores'>
  className?: string
}

/**
 * 対象ビッカメ娘バッジ
 * 開催店舗の娘がそのまま対象のときは店舗表示と重複するため出さない
 */
export const EventCharacterBadge = ({ event, className }: EventCharacterBadgeProps) => {
  const character = resolveEventCharacter(event)
  if (character === event.stores[0]) return null

  return (
    <Badge className={cn('gap-1 border-transparent bg-character text-character-foreground', className)}>
      <UserRound className='size-3' />
      {isSpecialCharacter(character)
        ? SPECIAL_CHARACTER_LABELS[character]
        : CHARACTER_NAME_LABELS[character] || STORE_NAME_LABELS[character] || character}
    </Badge>
  )
}
