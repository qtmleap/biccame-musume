import { isSpecialCharacter, resolveEventCharacters } from '@biccame/shared/domain/event-character'
import type { Event } from '@biccame/shared/schemas/event.dto'
import { UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CHARACTER_NAME_LABELS, SPECIAL_CHARACTER_LABELS } from '@/locales/app.content'

type EventCharacterBadgeProps = {
  event: Pick<Event, 'characterIds'>
  className?: string
}

/** 開催店舗と独立した対象ビッカメ娘をすべて表示する。 */
export const EventCharacterBadge = ({ event, className }: EventCharacterBadgeProps) => (
  <>
    {resolveEventCharacters(event).map((character) => (
      <Badge
        key={character}
        className={cn('gap-1 border-transparent bg-character text-character-foreground', className)}
      >
        <UserRound className='size-3' />
        {isSpecialCharacter(character) ? SPECIAL_CHARACTER_LABELS[character] : CHARACTER_NAME_LABELS[character]}
      </Badge>
    ))}
  </>
)
