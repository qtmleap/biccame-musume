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

/** rotation 値を CSS transform スタイルに変換（0 のときは undefined を返す） */
export const stickerTransformStyle = (deg: number): { transform?: string } => {
  if (deg === 0) return {}
  return { transform: `rotate(${deg}deg)` }
}

/** ステッカーカードの spring ホバー / タップトランジション */
export const STICKER_HOVER_TRANSITION = { type: 'spring' as const, stiffness: 320, damping: 18 }
