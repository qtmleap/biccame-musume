import offensiveRaw from '@/data/_ng_offensive.txt?raw'
import sexualRaw from '@/data/_ng_sexual.txt?raw'

const parseList = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

const NG_WORDS: readonly string[] = [...parseList(sexualRaw), ...parseList(offensiveRaw)]

/**
 * 本文に NG ワードが含まれているかを返す。大文字小文字を区別しない部分一致。
 * Llama Guard を呼ぶ前段の安価なチェックとして使う。
 */
export const containsNgWord = (text: string): boolean => {
  const normalized = text.toLowerCase()
  return NG_WORDS.some((word) => normalized.includes(word.toLowerCase()))
}
