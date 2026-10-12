// satori が内部で使うフォントパーサー。型定義が無いため、文字幅の実測（og-text-metrics.ts）で使う分だけ宣言する。
declare module '@shuding/opentype.js' {
  type OpentypeFont = {
    unitsPerEm: number
    /** 文字列を並べたときの送り幅（fontSize px 換算）。kerning を有効にすると GPOS のカーニングも足す。 */
    getAdvanceWidth: (text: string, fontSize?: number, options?: { kerning?: boolean }) => number
  }
  const opentype: {
    parse: (buffer: ArrayBuffer, options?: { lowMemory?: boolean }) => OpentypeFont
  }
  export default opentype
}
