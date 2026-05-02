import type { Variants } from 'motion/react'

export const EASE_OUT = [0.0, 0.0, 0.2, 1.0] as const

export const DURATION = {
  fast: 0.2,
  normal: 0.5,
  slow: 0.8
} as const

export const FADE_IN: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 }
}

export const FADE_IN_UP: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 }
}

export const FADE_IN_DOWN: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
}

export const SCALE_IN: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.8 }
}
