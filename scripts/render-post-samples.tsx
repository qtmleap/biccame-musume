/** @jsxImportSource satori/jsx */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import sharp from 'sharp'
import { z } from 'zod'
import {
  type EventRow,
  eventRow,
  formatDay,
  groupRows,
  type ImageEvent,
  isSaturday,
  isSunday,
  jstDayKey,
  type Phase,
  sinceLabel,
  splitByPhase,
  untilLabel
} from '../workers/app/src/images/format'
import {
  DailyImage,
  EventAddedImage,
  EventOgImage,
  MAX_POST_IMAGE_HEIGHT,
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

const events = await loadEvents()
const pick = (prefix: string) => {
  const event = events.find((item) => item.uuid.startsWith(prefix))
  if (!event) throw new Error(`Event ${prefix} is not public`)
  return event
}

const phaseRows = (phases: Record<Phase, ImageEvent[]>, reference: Date): Record<Phase, EventRow[]> => ({
  starting: groupRows(phases.starting, (event) => untilLabel(event, reference)),
  ongoing: groupRows(phases.ongoing, (event) => untilLabel(event, reference)),
  ending: groupRows(phases.ending, (event) => sinceLabel(event, reference))
})

// 1. 日次: 開始・終了のどちらも複数ある日
const dailyDate = at('2026-02-14T00:00:00+09:00')
const daily = phaseRows(splitByPhase(events, jstDayKey(dailyDate), jstDayKey(dailyDate)), dailyDate)

// 2. OG と 3. 追加時: 調布店で配布される、せいせきたんの缶バッジ（店舗と対象の娘が異なる例）
const featured = eventRow(pick('16e89d75'))

// 4. 週次: 金曜から7日間
const weekStart = at('2026-06-26T00:00:00+09:00')
const weekDates = Array.from({ length: 7 }, (_, offset) => new Date(weekStart.getTime() + offset * 86_400_000))
const weekEnd = weekDates[6]
const week = splitByPhase(events, jstDayKey(weekStart), jstDayKey(weekEnd))
const byDay = (list: ImageEvent[], dateOf: (event: ImageEvent) => Date | undefined, note: (event: ImageEvent) => string): WeekDay[] =>
  weekDates.map((date) => ({
    label: formatDay(date),
    holiday: isSaturday(date) || isSunday(date) || isHoliday(date),
    rows: groupRows(
      list.filter((event) => {
        const day = dateOf(event)
        return day !== undefined && jstDayKey(day) === jstDayKey(date)
      }),
      note
    )
  }))
const weekly: Record<Phase, WeekDay[]> = {
  starting: byDay(week.starting, (event) => event.startDate, (event) => untilLabel(event, weekStart)),
  ongoing: [{ label: null, holiday: false, rows: groupRows(week.ongoing, (event) => untilLabel(event, weekStart)) }],
  ending: byDay(week.ending, (event) => event.endDate, (event) => sinceLabel(event, weekStart))
}
const weekRange = `${formatDay(weekStart)}〜${formatDay(weekEnd)}`

const phases: Phase[] = ['starting', 'ongoing', 'ending']

// 高さの上限を確かめる最悪ケース: 長い題名・店舗名・対象の娘・多数の店舗を、全日・全区分に詰める
const longest = groupRows(
  [
    {
      ...pick('16e89d75'),
      title: 'スマホ用カードケース+擬人化10周年記念アクキー・デカ立川たんアクキー',
      stores: ['nagoyagate', 'abeno', 'ikenishi', 'kumamoto']
    }
  ],
  () => '店舗により異なる'
)[0]
const crowded = Array.from({ length: 12 }, () => longest)
const worstCases = [
  <DailyImage date={dailyDate} kind='ongoing' rows={crowded} portraits={{}} />,
  <WeeklyImage
    range={weekRange}
    kind='starting'
    days={weekDates.map((date) => ({ label: formatDay(date), holiday: true, rows: crowded }))}
    portraits={{}}
  />,
  // 日付見出しが最も多くなる、毎日1件ずつのケース
  <WeeklyImage
    range={weekRange}
    kind='ending'
    days={weekDates.map((date) => ({ label: formatDay(date), holiday: false, rows: [longest] }))}
    portraits={{}}
  />
]
const allRows = [
  featured,
  ...phases.flatMap((phase) => [...daily[phase], ...weekly[phase].flatMap((day) => day.rows)])
]
const portraits = await loadPortraits(allRows.flatMap((row) => row.portraits))
const fonts = [
  { name: 'Zen Maru Gothic', data: await readFile(font(500)), weight: 500 as const, style: 'normal' as const },
  { name: 'Zen Maru Gothic', data: await readFile(font(700)), weight: 700 as const, style: 'normal' as const }
]

const samples = [
  ...phases.map(
    (phase, index) =>
      [
        `1${'abc'[index]}-daily-${phase}`,
        <DailyImage date={dailyDate} kind={phase} rows={daily[phase]} portraits={portraits} />
      ] as const
  ),
  ['2-og', <EventOgImage row={featured} portraits={portraits} />] as const,
  ['3-added', <EventAddedImage row={featured} portraits={portraits} />] as const,
  ...phases.map(
    (phase, index) =>
      [
        `4${'abc'[index]}-weekly-${phase}`,
        <WeeklyImage range={weekRange} kind={phase} days={weekly[phase]} portraits={portraits} />
      ] as const
  )
]

// 高さを指定しない画像は内容に合わせて伸ばす。X で切られない 3:4 を超えたら止める
const render = async (element: Parameters<typeof satori>[0]) => {
  const png = new Resvg(await satori(element, { width: 1200, fonts }), { fitTo: { mode: 'width', value: 1200 } }).render()
  if (png.height > MAX_POST_IMAGE_HEIGHT) throw new Error(`Image is ${png.height}px tall (max ${MAX_POST_IMAGE_HEIGHT})`)
  return png
}

for (const element of worstCases) console.log(`worst case fits: ${(await render(element)).height}px`)
await mkdir(outDir, { recursive: true })
for (const [name, element] of samples) {
  const png = await render(element)
  await writeFile(resolve(outDir, `${name}.png`), png.asPng())
  console.log(`${name}.png ${png.width}x${png.height}`)
}
