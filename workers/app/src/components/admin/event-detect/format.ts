import dayjs from 'dayjs'

// 表示はすべて JST。dayjs の timezone プラグインは app/main.tsx で拡張済み。
const JST = 'Asia/Tokyo'

export const formatDateTime = (iso: string): string => dayjs(iso).tz(JST).format('YYYY/MM/DD HH:mm')

export const formatDate = (iso: string | undefined): string => (iso ? dayjs(iso).tz(JST).format('YYYY/MM/DD') : '—')

/** YYYY-MM-DD の日付（抽出で本文から拾った日）をそのまま表示用にする。タイムゾーン変換はしない */
export const formatDay = (day: string | undefined): string => (day ? day.replaceAll('-', '/') : '—')

export const formatNumber = (value: number): string => value.toLocaleString('ja-JP')
