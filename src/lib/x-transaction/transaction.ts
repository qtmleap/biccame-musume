import { ADDITIONAL_RANDOM_NUMBER, DEFAULT_KEYWORD, INDICES_REGEX } from './constants'
import { Cubic } from './cubic'
import { extractLoadingXAnimPaths, extractTwitterSiteVerification } from './html-extract'
import { interpolate } from './interpolate'
import { convertRotationToMatrix } from './rotation'
import { base64Encode, floatToHex, isOdd, jsRound, sha256 } from './utils'

const TWITTER_EPOCH_SEC = 1682924400
const TOTAL_TIME = 4096

type FramePaths = string[]

type AnimationInputs = {
  rowIndex: number
  keyBytesIndices: number[]
  keyBytes: number[]
  framePaths: FramePaths
}

const splitPathSegments = (d: string): number[][] =>
  d
    .slice(9)
    .split('C')
    .map((segment) =>
      segment
        .replace(/[^\d]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter((s) => s.length > 0)
        .map((s) => Number.parseInt(s, 10))
    )

const getKeyBytes = (key: string): number[] => {
  const binary = atob(key)
  return Array.from(binary, (ch) => ch.charCodeAt(0))
}

const getIndices = (ondemandJs: string): { rowIndex: number; keyBytesIndices: number[] } => {
  const matches = [...ondemandJs.matchAll(INDICES_REGEX)].map((m) => Number.parseInt(m[1], 10))
  if (matches.length === 0) throw new Error("Couldn't get KEY_BYTE indices from ondemand.s file")
  return { rowIndex: matches[0], keyBytesIndices: matches.slice(1) }
}

const animate = (frame: number[], targetTime: number): string => {
  const fromColor = [...frame.slice(0, 3), 1].map((v) => Number(v))
  const toColor = [...frame.slice(3, 6), 1].map((v) => Number(v))
  const fromRotation = [0]
  const toRotation = [solve(frame[6], 60, 360, true)]

  const curveValues = frame.slice(7).map((v, i) => solve(v, isOdd(i), 1, false))
  const cubic = new Cubic(curveValues)
  const t = cubic.getValue(targetTime)

  const color = interpolate(fromColor, toColor, t).map((v) => Math.max(0, Math.min(255, v)))
  const rotation = interpolate(fromRotation, toRotation, t)
  const matrix = convertRotationToMatrix(rotation[0])

  const colorHex = color.slice(0, -1).map((v) => Math.round(v).toString(16))
  const matrixHex = matrix.map((v) => {
    const rounded = Math.abs(Math.round(v * 100) / 100)
    const hex = floatToHex(rounded)
    if (hex.startsWith('.')) return `0${hex}`.toLowerCase()
    return hex || '0'
  })

  return [...colorHex, ...matrixHex, '0', '0'].join('').replace(/[.-]/g, '')
}

const solve = (value: number, minVal: number, maxVal: number, rounding: boolean): number => {
  const result = (value * (maxVal - minVal)) / 255 + minVal
  return rounding ? Math.floor(result) : Math.round(result * 100) / 100
}

const computeAnimationKey = ({ rowIndex, keyBytesIndices, keyBytes, framePaths }: AnimationInputs): string => {
  const row = keyBytes[rowIndex] % 16
  const frameTimeRaw = keyBytesIndices.reduce((acc, idx) => acc * (keyBytes[idx] % 16), 1)
  const frameTime = jsRound(frameTimeRaw / 10) * 10

  const svgIndex = keyBytes[5] % 4
  const segments = splitPathSegments(framePaths[svgIndex])
  const frame = segments[row]
  if (!frame) throw new Error(`No frame at row index ${row} (segments=${segments.length})`)

  const targetTime = frameTime / TOTAL_TIME
  return animate(frame, targetTime)
}

export type ClientTransactionInit = {
  /** raw HTML of `https://x.com/` (after migration redirects). */
  homePageHtml: string
  /** raw JS text of the dynamic `ondemand.s.<hash>a.js`. */
  ondemandFileText: string
  randomKeyword?: string
  additionalRandomNumber?: number
}

export class ClientTransaction {
  private readonly keyBytes: number[]
  private readonly animationKey: string
  private readonly randomKeyword: string
  private readonly additionalRandomNumber: number

  private constructor(init: {
    keyBytes: number[]
    animationKey: string
    randomKeyword: string
    additionalRandomNumber: number
  }) {
    this.keyBytes = init.keyBytes
    this.animationKey = init.animationKey
    this.randomKeyword = init.randomKeyword
    this.additionalRandomNumber = init.additionalRandomNumber
  }

  static create(init: ClientTransactionInit): ClientTransaction {
    const key = extractTwitterSiteVerification(init.homePageHtml)
    const keyBytes = getKeyBytes(key)
    const { rowIndex, keyBytesIndices } = getIndices(init.ondemandFileText)
    const framePaths = extractLoadingXAnimPaths(init.homePageHtml)
    const animationKey = computeAnimationKey({ rowIndex, keyBytesIndices, keyBytes, framePaths })
    return new ClientTransaction({
      keyBytes,
      animationKey,
      randomKeyword: init.randomKeyword ?? DEFAULT_KEYWORD,
      additionalRandomNumber: init.additionalRandomNumber ?? ADDITIONAL_RANDOM_NUMBER
    })
  }

  /**
   * Generate the per-request `x-client-transaction-id` header value.
   * Includes a random byte so each call returns a different id.
   */
  async generateTransactionId(method: string, path: string, timeNowMs?: number): Promise<string> {
    const nowMs = timeNowMs ?? Date.now()
    const timeNow = Math.floor((nowMs - TWITTER_EPOCH_SEC * 1000) / 1000)
    const timeNowBytes = [0, 1, 2, 3].map((i) => (timeNow >>> (i * 8)) & 0xff)

    const hashInput = `${method}!${path}!${timeNow}${this.randomKeyword}${this.animationKey}`
    const hashBytes = await sha256(hashInput)

    const randomNum = Math.floor(Math.random() * 256)
    const payload = [
      ...this.keyBytes,
      ...timeNowBytes,
      ...Array.from(hashBytes.slice(0, 16)),
      this.additionalRandomNumber
    ]
    const out = new Uint8Array([randomNum, ...payload.map((b) => b ^ randomNum)])
    return base64Encode(out).replace(/=+$/, '')
  }
}
