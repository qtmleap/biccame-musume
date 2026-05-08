export const interpolate = (from: number[], to: number[], f: number): number[] => {
  if (from.length !== to.length) {
    throw new Error(`Mismatched interpolation arguments [${from}] / [${to}]`)
  }
  return from.map((v, i) => v * (1 - f) + to[i] * f)
}
