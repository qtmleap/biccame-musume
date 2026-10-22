import type { AvatarImages } from '@api/lib/og-avatars'
import type { TextMetrics } from '@api/lib/og-text-metrics'
import type { SocialEventImage } from '@biccame/shared/social'
import {
  ACCENTS,
  type Accent,
  Avatar,
  C,
  Frame,
  Label,
  type SocialImageKind,
  storeChunks,
  Text,
  toneOf
} from './social-post-image-common'

const EVENT_W = 1200
const EVENT_H = 630
const PANEL_W = 380
const TEXT_LEFT = PANEL_W + 48
const TEXT_W = EVENT_W - TEXT_LEFT - 64
const SINGLE_D = 300
const INFO_SIZE = 40
/** 項目名の幅。値は項目名・間隔の右から始まる。 */
const INFO_LABEL_W = 72
const INFO_GAP = 14

type Purpose = 'created' | 'updated'
const purposeOf = (kind: SocialImageKind): Purpose => {
  if (kind === 'created' || kind === 'updated') return kind
  throw new Error(`Social event image requires created or updated: ${kind}`)
}
const purposeAccent = (purpose: Purpose): Accent => (purpose === 'created' ? ACCENTS.red : ACCENTS.blue)
const PURPOSE_LABELS: Record<Purpose, string> = { created: '新着イベント', updated: 'イベント更新' }

/** 題名は 56→52→48px で1行に収まる最大。収まらなければ 42px で最大3行。 */
export const eventTitleLayout = (
  title: string,
  width: number,
  metrics: TextMetrics
): { size: number; lines: number } => {
  const size = [56, 52, 48].find((candidate) => metrics.width(title, candidate) <= width - 8)
  return size === undefined ? { size: 42, lines: 3 } : { size, lines: 1 }
}

/** 追加・更新の店舗。3店舗までは全部、4店舗以上は先頭2店舗と残りの数。 */
export const eventStoreCount = (stores: readonly string[]): number => (stores.length > 3 ? 2 : stores.length)

const InfoLabel = ({ label }: { label: string }) => (
  <div
    style={{
      display: 'flex',
      width: INFO_LABEL_W,
      flexShrink: 0,
      paddingTop: 10,
      fontSize: 26,
      fontWeight: 700,
      color: C.sub
    }}
  >
    {label}
  </div>
)

/** 項目名を左に小さく、値を大きく置く。X で縮小されても値が読めるよう、値は 40px。 */
const InfoRow = ({
  label,
  value,
  lines,
  color,
  width
}: {
  label: string
  value: string
  lines: number
  color: string
  width: number
}) => (
  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: INFO_GAP, width }}>
    <InfoLabel label={label} />
    <Text text={value} size={INFO_SIZE} lines={lines} width={width - INFO_LABEL_W - INFO_GAP} color={color} />
  </div>
)

/** 店舗は1店舗ずつ折り返さない塊にして、店舗の区切りで改行する。 */
const StoreRow = ({ stores, color, width }: { stores: readonly string[]; color: string; width: number }) => (
  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: INFO_GAP, width }}>
    <InfoLabel label='店舗' />
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        width: width - INFO_LABEL_W - INFO_GAP
      }}
    >
      {storeChunks(stores, eventStoreCount(stores), color).map((chunk) => (
        <div
          key={chunk.text}
          style={{
            display: 'flex',
            fontSize: INFO_SIZE,
            fontWeight: 700,
            lineHeight: 1.25,
            color: chunk.color,
            whiteSpace: 'nowrap',
            marginRight: chunk.after
          }}
        >
          {chunk.text}
        </div>
      ))}
    </div>
  </div>
)

const EventText = ({
  purpose,
  image,
  width,
  metrics
}: {
  purpose: Purpose
  image: SocialEventImage
  width: number
  metrics: TextMetrics
}) => {
  const { event } = image
  const accent = purposeAccent(purpose)
  const title = eventTitleLayout(event.title, width, metrics)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width }}>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16, width }}>
        <Label text={PURPOSE_LABELS[purpose]} size={30} color={accent.text} metrics={metrics} />
      </div>
      <Text text={event.title} size={title.size} lines={title.lines} width={width} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width, marginTop: 8 }}>
        <StoreRow stores={event.stores} color={accent.place} width={width} />
        {event.target === null ? null : (
          <InfoRow label='対象' value={event.target} lines={1} color={accent.place} width={width} />
        )}
        <InfoRow label='期間' value={event.period} lines={1} color={C.text} width={width} />
        {event.conditions.length > 0 ? (
          <InfoRow label='条件' value={event.conditions.join('・')} lines={2} color={C.text} width={width} />
        ) : null}
      </div>
    </div>
  )
}

type Slot = { left: number; top: number; d: number }
type ClusterBox = { x0: number; w: number; h: number; frontD: number; backD: number; m: number; mv: number }

/**
 * 複数店舗（対象未指定）の丸の置き場所。先頭の店舗の娘が手前（右寄りの中央）、2人目・3人目は奥の左寄りの上・下（縦のジグザグ）。
 * 手前の丸は奥の丸の肩や横にだけかかり、頭（丸の上側）にはかからない。戻り値は先頭の娘から順。
 */
export const clusterSlots = (count: number, c: ClusterBox): Slot[] => {
  const frontLeft = c.x0 + c.w - c.m - c.frontD
  const backLeft = c.x0 + c.m
  if (count >= 3) {
    return [
      { left: frontLeft, top: Math.round((c.h - c.frontD) / 2), d: c.frontD },
      { left: backLeft, top: c.mv, d: c.backD },
      { left: backLeft, top: c.h - c.mv - c.backD, d: c.backD }
    ]
  }
  // 2人: 奥の丸を上、手前の丸を右下に。中心どうしの縦の距離を決めて、2人全体を縦の中央に置く。
  const dy = Math.round((c.frontD + c.backD) / 2) - 50
  const span = c.backD / 2 + dy + c.frontD / 2
  const backTop = Math.round((c.h - span) / 2)
  return [
    { left: frontLeft, top: Math.round(backTop + c.backD / 2 + dy - c.frontD / 2), d: c.frontD },
    { left: backLeft, top: backTop, d: c.backD }
  ]
}

/** 縦帯の中の丸の置き場所。1人は縦帯の中央、複数は clusterSlots。 */
export const eventAvatarSlots = (count: number): Slot[] =>
  count >= 2
    ? clusterSlots(count, { x0: 0, w: PANEL_W, h: EVENT_H, frontD: 250, backD: 215, m: 16, mv: 20 })
    : [{ left: Math.round((PANEL_W - SINGLE_D) / 2), top: Math.round((EVENT_H - SINGLE_D) / 2), d: SINGLE_D }]

export const EventImageBody = ({
  kind,
  image,
  metrics,
  avatars
}: {
  kind: SocialImageKind
  image: SocialEventImage
  metrics: TextMetrics
  avatars: AvatarImages
}) => {
  const purpose = purposeOf(kind)
  const accent = purposeAccent(purpose)
  const visibleAvatars = image.event.avatars.slice(0, 3)
  const slots = eventAvatarSlots(visibleAvatars.length)
  // 立ち絵は最大3人。対象名と保存済み配列は全員分を保つ。
  const layers = visibleAvatars.map((character, index) => ({ character, slot: slots[index] }))
  return (
    <Frame width={EVENT_W} height={EVENT_H}>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 0,
          top: 0,
          width: PANEL_W,
          height: EVENT_H,
          background: accent.soft
        }}
      />
      {layers.toReversed().map(({ character, slot }) => (
        <Avatar
          key={`${slot.left}-${slot.top}`}
          character={character}
          d={slot.d}
          tone={toneOf(accent)}
          avatars={avatars}
          style={{ position: 'absolute', left: slot.left, top: slot.top }}
        />
      ))}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'absolute',
          left: TEXT_LEFT,
          top: 44,
          width: TEXT_W,
          height: EVENT_H - 44 - 30
        }}
      >
        <EventText purpose={purpose} image={image} width={TEXT_W} metrics={metrics} />
        <div style={{ display: 'flex', justifyContent: 'space-between', width: TEXT_W, fontSize: 22, fontWeight: 700 }}>
          <div>ビッカメ娘 推し活応援プロジェクト</div>
          <div style={{ color: accent.text }}>#ビッカメ娘</div>
        </div>
      </div>
    </Frame>
  )
}
