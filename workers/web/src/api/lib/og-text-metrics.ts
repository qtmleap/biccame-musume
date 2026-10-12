/**
 * OG 画像の文字幅の実測。
 *
 * satori に渡すものと同じフォントのバッファを @shuding/opentype.js で読み、文字列の幅を測る。
 * 題名が1行に収まるか・店舗を何店舗まで1行に入れるか、といった判定のために、描画を2度行って高さを測る方法は使わない。
 * フォントが持たない字は .notdef の送り幅で測る（satori が描くときと同じ）。
 */

import opentype from '@shuding/opentype.js'

export type MetricsFontWeight = 500 | 700

/** 幅の実測に必要な部分だけ。satori の fonts オプションの要素（OgFont）がそのまま渡せる。 */
export type MetricsFont = { data: ArrayBuffer; weight: number }

export type TextMetrics = {
  /** 文字サイズ size px で1行に並べたときの幅（px）。weight を省くと太字（700）。 */
  width: (text: string, size: number, weight?: MetricsFontWeight) => number
}

/** 判定の誤差を吸収する余白（px）。satori は harfbuzz の字送り、こちらは opentype の字送りで測るため、数 px ずれうる。 */
export const MEASURE_TOLERANCE = 4

export const createTextMetrics = (fonts: readonly MetricsFont[]): TextMetrics => {
  // 使う太さだけを、最初に測るときに1回だけ parse する。satori と同じく lowMemory で、全グリフを展開しない。
  const parsed = new Map<number, ReturnType<typeof opentype.parse>>()
  const fontOf = (weight: MetricsFontWeight) => {
    const hit = parsed.get(weight)
    if (hit !== undefined) return hit
    const entry = fonts.find((font) => font.weight === weight)
    if (entry === undefined) throw new Error(`Text metrics font is missing: ${weight}`)
    const font = opentype.parse(entry.data, { lowMemory: true })
    parsed.set(weight, font)
    return font
  }
  return {
    width: (text, size, weight = 700) => fontOf(weight).getAdvanceWidth(text, size, { kerning: true })
  }
}

const cache = new WeakMap<readonly MetricsFont[], TextMetrics>()

/**
 * 同じフォント配列（loadOgFonts の戻り値）に対しては同じ TextMetrics を返す。
 * フォントのバッファは isolate 内で使い回されるため、parse も isolate ごとに1回で済む。
 */
export const textMetricsFor = (fonts: readonly MetricsFont[]): TextMetrics => {
  const hit = cache.get(fonts)
  if (hit !== undefined) return hit
  const created = createTextMetrics(fonts)
  cache.set(fonts, created)
  return created
}
