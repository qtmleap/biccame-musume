/**
 * JS-style Math.round (always rounds .5 up; Python rounds to even).
 * The upstream Python lib reimplements this for parity with Twitter's JS code.
 */
export const jsRound = (num: number): number => {
  const x = Math.floor(num)
  const rounded = num - x >= 0.5 ? Math.ceil(num) : x
  return Math.sign(num) === 0 ? rounded : Math.sign(num) * Math.abs(rounded)
}

export const isOdd = (n: number): number => (n % 2 ? -1 : 0)

export const base64Encode = (bytes: Uint8Array): string => {
  const chunks = Array.from(bytes, (b) => String.fromCharCode(b))
  return btoa(chunks.join(''))
}

/**
 * Port of the Python `float_to_hex` helper. Produces hex strings whose
 * fractional part uses single-digit hex characters (matching Twitter's JS).
 */
export const floatToHex = (input: number): string => {
  const integerPart = (() => {
    const buildInt = (x: number, acc: string[]): string[] => {
      if (x <= 0) return acc
      const next = Math.floor(x / 16)
      const remainder = Math.floor(x - next * 16)
      const ch = remainder > 9 ? String.fromCharCode(remainder + 55) : String(remainder)
      return buildInt(next, [ch, ...acc])
    }
    return buildInt(Math.floor(input), []).join('')
  })()

  const fraction = input - Math.floor(input)
  if (fraction === 0) return integerPart

  const fracPart = (() => {
    const buildFrac = (rem: number, depth: number, acc: string[]): string[] => {
      if (rem <= 0 || depth >= 32) return acc
      const scaled = rem * 16
      const intPart = Math.floor(scaled)
      const ch = intPart > 9 ? String.fromCharCode(intPart + 55) : String(intPart)
      return buildFrac(scaled - intPart, depth + 1, [...acc, ch])
    }
    return buildFrac(fraction, 0, []).join('')
  })()

  return `${integerPart}.${fracPart}`
}

export const sha256 = async (input: string): Promise<Uint8Array> => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return new Uint8Array(buf)
}
