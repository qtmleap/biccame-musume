import dayjs from 'dayjs'

// 表示はすべて JST。dayjs の timezone プラグインは app/main.tsx で拡張済み。
const JST = 'Asia/Tokyo'

export const formatDateTime = (iso: string): string => dayjs(iso).tz(JST).format('YYYY/MM/DD HH:mm')

export const formatDate = (iso: string | undefined): string => (iso ? dayjs(iso).tz(JST).format('YYYY/MM/DD') : '—')

export const formatNumber = (value: number): string => value.toLocaleString('ja-JP')

export const percent = (part: number, whole: number): string =>
  whole === 0 ? '—' : `${((part / whole) * 100).toFixed(1)}%`
