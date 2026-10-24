import type { ClefAnswer } from './clef'

export const thresholds = { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 }
export const choice = (selected: string, probabilities: Record<string, number>): ClefAnswer => ({
  type: 'choice',
  choice: selected,
  probabilities
})
// 新東たんの実回答に近い値。キーの並びはわざと乱してあり、行の順は describeAnswers が決める。
export const shintouAnswers: Record<string, ClefAnswer> = {
  condition: choice('purchase', { purchase: 0.9813, none: 0.01, first_come: 0.005 }),
  single_event: { type: 'noul', noul: 0.9149 },
  quantity: choice('q60', { q60: 0.9809, none: 0.01 }),
  end_date: choice('none', { none: 0.541, d20261025: 0.4 }),
  store: choice('none', { none: 0.6084, shintou: 0.3916 }),
  category: choice('acsta', { acsta: 0.4544, ackey: 0.4279, other: 0.09, none: 0.02 }),
  start_date: choice('d20261019', { d20261019: 0.9943, none: 0.004 }),
  status: choice('announce', { announce: 0.7499, start: 0.15, none: 0.05, ongoing: 0.03 }),
  is_event: { type: 'noul', noul: 0.7224 }
}
