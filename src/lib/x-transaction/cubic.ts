/**
 * Cubic Bezier solver (port of Python ClientTransaction's Cubic class).
 * `curves` is a flat 4-element array `[x1, y1, x2, y2]` matching the CSS
 * `cubic-bezier(x1, y1, x2, y2)` parameters.
 */
export class Cubic {
  constructor(private readonly curves: number[]) {}

  getValue(time: number): number {
    const c = this.curves

    if (time <= 0) {
      const startGradient = c[0] > 0 ? c[1] / c[0] : c[1] === 0 && c[2] > 0 ? c[3] / c[2] : 0
      return startGradient * time
    }

    if (time >= 1) {
      const endGradient = c[2] < 1 ? (c[3] - 1) / (c[2] - 1) : c[2] === 1 && c[0] < 1 ? (c[1] - 1) / (c[0] - 1) : 0
      return 1 + endGradient * (time - 1)
    }

    const search = (start: number, end: number, mid: number): number => {
      if (start >= end) return Cubic.calculate(c[1], c[3], mid)
      const newMid = (start + end) / 2
      const xEst = Cubic.calculate(c[0], c[2], newMid)
      if (Math.abs(time - xEst) < 0.00001) return Cubic.calculate(c[1], c[3], newMid)
      return xEst < time ? search(newMid, end, newMid) : search(start, newMid, newMid)
    }
    return search(0, 1, 0)
  }

  private static calculate(a: number, b: number, m: number): number {
    return 3 * a * (1 - m) * (1 - m) * m + 3 * b * (1 - m) * m * m + m * m * m
  }
}
