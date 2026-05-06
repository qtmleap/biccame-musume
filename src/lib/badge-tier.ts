import type { BadgeRarity } from '@/schemas/badge.dto'

export const getTierFromCount = (count: number, total: number): { label: string; tone: BadgeRarity } => {
  const ratio = total > 0 ? count / total : 0
  if (ratio >= 1) return { label: 'コンプリート', tone: 'legendary' }
  if (ratio >= 0.75) return { label: 'プラチナ', tone: 'epic' }
  if (ratio >= 0.5) return { label: 'ゴールド', tone: 'rare' }
  if (ratio >= 0.25) return { label: 'シルバー', tone: 'common' }
  return { label: 'ブロンズ', tone: 'common' }
}
