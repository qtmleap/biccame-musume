/** @jsxImportSource satori/jsx */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import sharp from 'sharp'
import { z } from 'zod'
import {
  eventRow,
  formatDay,
  groupRows,
  type ImageEvent,
  isSaturday,
  isSunday,
  jstDayKey
} from '../workers/app/src/images/format'
import {
  DailyImage,
  EventAddedImage,
  EventOgImage,
  type Portraits,
  type WeekDay,
  WeeklyImage
} from '../workers/app/src/images/post-images'
import { getCanonicalPose } from '../workers/app/src/lib/stampcamera-map'
import { EventSchema } from '../workers/app/src/schemas/event.dto'
import type { StoreKey } from '../workers/app/src/schemas/store.dto'
import { getHolidayName } from '../workers/app/src/utils/holidays'

// 本番の公開イベントから4種類の投稿画像を作り、.cache/post-samples/ に PNG で書き出す。
// X・Discordには投稿しない。--events <json> で手元のイベント一覧を使える。
const root = resolve(import.meta.dir, '..')
const publicDir = resolve(root, 'workers/app/public')
const outDir = resolve(root, '.cache/post-samples')
const font = (weight: number) =>
  resolve(root, `node_modules/@fontsource/zen-maru-gothic/files/zen-maru-gothic-japanese-${weight}-normal.woff`)

const loadEvents = async (): Promise<ImageEvent[]> => {
  const index = process.argv.indexOf('--events')
  const raw =
    index > 0
      ? JSON.parse(await readFile(process.argv[index + 1], 'utf8'))
      : await (await fetch('https://biccame-musume.com/api/events', { signal: AbortSignal.timeout(15000) })).json()
  const parsed = EventSchema.array().safeParse(raw)
  if (!parsed.success) throw new Error(`Invalid events: ${parsed.error.message}`)
  return parsed.data
}

// 透過SD画像（スタンプ）を優先し、無ければ公式プロフィール画像を使う。satori は WebP を読めないため PNG にする
const portraitPath = (key: StoreKey, images: string[]): string => {
  const pose = getCanonicalPose(key)
  if (pose) {
    const stamp = resolve(publicDir, `images/stamps/${pose.packageId}-${String(pose.stickerId).padStart(3, '0')}.webp`)
    if (existsSync(stamp)) return stamp
  }
  const image = images.findLast((url) => url.endsWith('4.png')) ?? images[images.length - 1]
  return resolve(publicDir, 'images/characters', image.replace(/\.[^./]+$/, '.webp'))
}

const characterSchema = z.array(z.object({ id: z.string(), character: z.object({ images: z.array(z.string()) }) }))
const loadPortraits = async (keys: StoreKey[]): Promise<Portraits> => {
  const characters = characterSchema.parse(JSON.parse(await readFile(resolve(publicDir, 'characters.json'), 'utf8')))
  const entries = await Promise.all(
    [...new Set(keys)].map(async (key) => {
      const character = characters.find((item) => item.id === key)
      const path = character && portraitPath(key, character.character.images)
      if (!path || !existsSync(path)) return [key, undefined] as const
      const png = await sharp(await readFile(path)).resize(480, 480, { fit: 'inside' }).png().toBuffer()
      return [key, `data:image/png;base64,${Buffer.from(png).toString('base64')}`] as const
    })
  )
  return Object.fromEntries(entries)
}

const at = (iso: string) => new Date(iso)
const isHoliday = (date: Date) => {
  const [year, month, day] = jstDayKey(date).split('-').map(Number)
  return getHolidayName(year, month, day) !== null
}
const startsOn = (event: ImageEvent, day: string) => jstDayKey(event.startDate) === day
const endsOn = (event: ImageEvent, day: string) => event.endDate !== undefined && jstDayKey(event.endDate) === day

const events = await loadEvents()
const pick = (prefix: string) => {
  const event = events.find((item) => item.uuid.startsWith(prefix))
  if (!event) throw new Error(`Event ${prefix} is not public`)
  return event
}

// 1. 日次: 開始・終了のどちらも複数ある日
const dailyDate = at('2026-02-14T00:00:00+09:00')
const dailyKey = jstDayKey(dailyDate)
const dailyStarting = groupRows(
  events.filter((event) => startsOn(event, dailyKey)),
  (event) => (event.endDate ? `${formatDay(event.endDate)}まで` : '終了日未定')
)
const dailyEnding = groupRows(
  events.filter((event) => endsOn(event, dailyKey)),
  (event) => `${formatDay(event.startDate)}から`
)

// 2. OG と 3. 追加時: 調布店で配布される、せいせきたんの缶バッジ（店舗と対象の娘が異なる例）
const featured = eventRow(pick('16e89d75'))

// 4. 週次: 金曜から7日間
const weekStart = at('2026-06-26T00:00:00+09:00')
const weekDays: WeekDay[] = Array.from({ length: 7 }, (_, offset) => {
  const date = new Date(weekStart.getTime() + offset * 86_400_000)
  const key = jstDayKey(date)
  return {
    label: formatDay(date),
    holiday: isSaturday(date) || isSunday(date) || isHoliday(date),
    starting: groupRows(
      events.filter((event) => startsOn(event, key)),
      (event) => (event.endDate ? `${formatDay(event.endDate)}まで` : '終了日未定')
    ),
    ending: groupRows(
      events.filter((event) => endsOn(event, key)),
      (event) => `${formatDay(event.startDate)}から`
    )
  }
})
const weekEnd = new Date(weekStart.getTime() + 6 * 86_400_000)

const allRows = [featured, ...dailyStarting, ...dailyEnding, ...weekDays.flatMap((day) => [...day.starting, ...day.ending])]
const portraits = await loadPortraits(allRows.flatMap((row) => row.portraits))
const fonts = [
  { name: 'Zen Maru Gothic', data: await readFile(font(500)), weight: 500 as const, style: 'normal' as const },
  { name: 'Zen Maru Gothic', data: await readFile(font(700)), weight: 700 as const, style: 'normal' as const }
]

const samples = [
  ['1-daily', <DailyImage date={dailyDate} starting={dailyStarting} ending={dailyEnding} portraits={portraits} />],
  ['2-og', <EventOgImage row={featured} portraits={portraits} />],
  ['3-added', <EventAddedImage row={featured} portraits={portraits} />],
  [
    '4-weekly',
    <WeeklyImage range={`${formatDay(weekStart)}〜${formatDay(weekEnd)}`} days={weekDays} portraits={portraits} />
  ]
] as const

await mkdir(outDir, { recursive: true })
for (const [name, element] of samples) {
  // 高さを指定しない画像は内容に合わせて伸ばす
  const svg = await satori(element, { width: 1200, fonts })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render()
  await writeFile(resolve(outDir, `${name}.png`), png.asPng())
  console.log(`${name}.png ${png.width}x${png.height}`)
}
