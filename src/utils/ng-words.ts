import jaconv from 'jaconv'
import customRaw from '@/data/_ng_custom.txt?raw'
import offensiveRaw from '@/data/_ng_offensive.txt?raw'
import sexualRaw from '@/data/_ng_sexual.txt?raw'

const parseList = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

/**
 * カタカナに正規化したうえで小文字化することで、ひらがな/カタカナの表記揺れと
 * 半角・全角・大文字小文字を吸収する。漢字 (e.g. 馬鹿) は変換対象外なので
 * リスト側に直接含める必要がある。
 */
const normalize = (input: string): string => jaconv.toKatakana(jaconv.toZenAscii(input)).toLowerCase()

const NG_WORDS_NORMALIZED: readonly string[] = [
  ...parseList(sexualRaw),
  ...parseList(offensiveRaw),
  ...parseList(customRaw)
].map(normalize)

/**
 * 本文に NG ワードが含まれているかを返す。
 * Llama Guard を呼ぶ前段の安価なチェックとして使う。
 */
export const containsNgWord = (text: string): boolean => {
  const normalized = normalize(text)
  return NG_WORDS_NORMALIZED.some((word) => normalized.includes(word))
}
