import dayjs, { type Dayjs } from 'dayjs'

/**
 * 生SQLやローカルツールで Prisma の DateTime 列へ書く値を、Prisma の D1 アダプタと同じ文字列形式に揃える。
 * @prisma/adapter-d1 の mapArg は `date.toISOString().replace('Z', '+00:00')` を束縛して保存・比較するため、
 * epoch ミリ秒の INTEGER や Z 付きの文字列で書くと、SQLite の型順序 (INTEGER < TEXT) や文字列比較により
 * gte/lt 検索・並び替え・等値比較から外れる。
 */
export const toD1DateTime = (value: string | number | Date | Dayjs): string =>
  dayjs(value).toISOString().replace('Z', '+00:00')
