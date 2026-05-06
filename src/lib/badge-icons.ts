import type { LucideIcon } from 'lucide-react'
import {
  Award,
  CalendarCheck,
  Compass,
  Crown,
  Heart,
  HeartHandshake,
  MapPin,
  MapPinCheck,
  Navigation,
  Sparkles,
  Star,
  Swords,
  Trophy,
  Users,
  Vote
} from 'lucide-react'

export const ICON_MAP: Record<string, LucideIcon> = {
  Award,
  CalendarCheck,
  Compass,
  Crown,
  Heart,
  HeartHandshake,
  MapPin,
  MapPinCheck,
  Navigation,
  Sparkles,
  Star,
  Swords,
  Trophy,
  Users,
  Vote
}

export const getBadgeIcon = (iconName: string): LucideIcon => {
  const icon = ICON_MAP[iconName]
  if (!icon) {
    throw new Error(`Unknown badge icon: ${iconName}`)
  }
  return icon
}
