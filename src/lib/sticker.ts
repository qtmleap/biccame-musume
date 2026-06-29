/**
 * ステッカー風 UI の共通定数とユーティリティ
 */

/** 紙のドロップシャドウ（カード用） */
export const STICKER_SHADOW = 'drop-shadow(0 6px 8px rgba(0,0,0,0.12))'

/** 紙のドロップシャドウ（コンパクトな行用） */
export const STICKER_SHADOW_SM = 'drop-shadow(0 3px 5px rgba(0,0,0,0.10))'

/** index ベースの巡回回転値（degrees） */
export const STICKER_ROTATIONS_DEG = [1.5, -2, 1, -1.5, 2, -1]

/**
 * index に対する既定の回転値を返す。
 * override が渡されればそれを優先（0 を渡せば傾きなし）。
 */
export const getStickerRotation = (index: number, override?: number) => {
  return override ?? STICKER_ROTATIONS_DEG[index % STICKER_ROTATIONS_DEG.length]
}

/** ステッカーカードの spring ホバー / タップトランジション */
export const STICKER_HOVER_TRANSITION = { type: 'spring' as const, stiffness: 320, damping: 18 }

/** カードに貼るマスキングテープ装飾 */
export type Tape = {
  /** absolute 配置クラス（rounded カードに対する位置） */
  position: string
  /** w-/h- サイズクラス */
  size: string
  /** 背景色クラス */
  color: string
  /** 回転クラス */
  angle: string
}

/** index で巡回するマスキングテープ装飾。null の index は装飾なし */
export const STICKER_TAPES: (Tape | null)[] = [
  // Top edge — short, near corners
  { position: '-top-1.5 left-4', size: 'w-8 h-3', color: 'bg-yellow-200/80', angle: '-rotate-[12deg]' },
  { position: '-top-1.5 right-4', size: 'w-8 h-3', color: 'bg-pink-200/80', angle: 'rotate-[10deg]' },
  // Top edge — wider, slight inset
  { position: '-top-2 left-1/3', size: 'w-10 h-3.5', color: 'bg-blue-200/80', angle: '-rotate-[5deg]' },
  { position: '-top-1 right-1/3', size: 'w-10 h-3.5', color: 'bg-green-200/80', angle: 'rotate-[6deg]' },
  // Top edge — centered
  {
    position: '-top-2 left-1/2 -translate-x-1/2',
    size: 'w-12 h-3',
    color: 'bg-yellow-200/80',
    angle: '-rotate-[3deg]'
  },
  null,
  // Bottom edge
  { position: '-bottom-1.5 left-6', size: 'w-8 h-3', color: 'bg-purple-200/80', angle: 'rotate-[8deg]' },
  { position: '-bottom-1.5 right-6', size: 'w-8 h-3', color: 'bg-orange-200/80', angle: '-rotate-[10deg]' },
  null,
  // Side edges — small tape sticking off the sides
  { position: 'top-3 -left-2', size: 'w-6 h-3', color: 'bg-blue-200/80', angle: 'rotate-[35deg]' },
  { position: 'top-4 -right-2', size: 'w-6 h-3', color: 'bg-green-200/80', angle: '-rotate-[35deg]' },
  null,
  // Bottom corners — tape pointing outward
  { position: 'bottom-3 -left-2', size: 'w-6 h-3', color: 'bg-pink-200/80', angle: '-rotate-[28deg]' },
  { position: 'bottom-4 -right-2', size: 'w-6 h-3', color: 'bg-yellow-200/80', angle: 'rotate-[28deg]' },
  null
]
