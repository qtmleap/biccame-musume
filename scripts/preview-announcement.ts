import { EventDetailSchema } from '../workers/app/src/schemas/event.dto'
import {
  buildEventCreatedText,
  buildEventUpdatedText,
  getQuoteTweetId,
  TWEET_WEIGHT_LIMIT,
  weightedLength
} from '../workers/app/src/utils/tweet-text'

// 公開APIの実イベントから、投稿される本文・引用元・リンクカード画像のURLを表示するだけの確認用。
// X/Discord/botには一切接続しない（投稿しない）。
const origin = 'https://biccame-musume.com'
const requested = process.argv.find((argument) => !argument.startsWith('-') && argument !== process.argv[0] && argument !== process.argv[1])

const resolveId = async (): Promise<string> => {
  if (requested) return requested
  const list = await (await fetch(`${origin}/api/events`, { redirect: 'manual', signal: AbortSignal.timeout(15000) })).json()
  const latest = (Array.isArray(list) ? list : [])
    .flatMap((item: unknown) => {
      const parsed = EventDetailSchema.pick({ uuid: true, updatedAt: true }).safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
  if (!latest) throw new Error('No public event found')
  return latest.uuid
}

const id = await resolveId()
const response = await fetch(`${origin}/api/events/${id}`, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
const parsed = EventDetailSchema.safeParse(await response.json())
if (!response.ok || !parsed.success) throw new Error(`Event ${id} could not be read (HTTP ${response.status})`)
const event = parsed.data
const image = await fetch(`${origin}/og/events/${event.uuid}.png`, { redirect: 'manual', signal: AbortSignal.timeout(60000) })
const bytes = new Uint8Array(await image.arrayBuffer())

for (const [label, purpose, text] of [
  ['新規イベント', 'create', buildEventCreatedText(event)],
  ['イベント更新', 'update', buildEventUpdatedText(event)]
] as const) {
  console.log(`--- ${label} (${weightedLength(text)}/${TWEET_WEIGHT_LIMIT}) ---`)
  console.log(text)
  console.log(`引用元ツイートID: ${getQuoteTweetId(event.referenceUrls, purpose) ?? 'なし'}\n`)
}
console.log(`リンクカード画像: ${origin}/og/events/${event.uuid}.png`)
console.log(`画像応答: HTTP ${image.status} ${image.headers.get('content-type')} ${bytes.length} bytes`)
if (process.argv.includes('--save') && image.ok) {
  await Bun.write(new URL('../.cache/announcement-preview.png', import.meta.url), bytes)
  console.log('保存: .cache/announcement-preview.png')
}
