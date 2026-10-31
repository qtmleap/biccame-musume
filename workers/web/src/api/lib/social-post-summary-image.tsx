import type { AvatarImages } from '@api/lib/og-avatars'
import type { TextMetrics } from '@api/lib/og-text-metrics'
import type { SocialEmptyImage, SocialRow, SocialSide, SocialSummaryImage } from '@biccame/shared/social'
import {
  type Accent,
  Avatar,
  C,
  Frame,
  Label,
  lineHeightOf,
  ROW_AVATAR_LIMIT,
  type SocialImageKind,
  Text
} from './social-post-image-common'
import {
  BODY_GAP,
  BODY_H,
  dateColumnWidth,
  MORE_H,
  PTOP,
  PW,
  PX,
  planSummaryRow,
  ROW_AVATAR_D,
  ROW_GAP,
  ROW_PAD,
  type Scope,
  SIDE_TEXT,
  SIZE,
  type SummaryRowLayout,
  scopeOf,
  sideAccent,
  sideTone,
  WIDE_H,
  WIDE_W
} from './social-post-summary-layout'

const ListHeader = ({
  scope,
  image,
  total,
  metrics
}: {
  scope: Scope
  image: SocialSummaryImage | SocialEmptyImage
  total: number
  metrics: TextMetrics
}) => {
  const accent = sideAccent(image.side)
  const page = image.type === 'summary' && image.pageCount > 1 ? `${image.page}/${image.pageCount}` : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: PW }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 28,
          width: PW,
          height: lineHeightOf(SIZE.date)
        }}
      >
        <Label text={SIDE_TEXT[scope][image.side].label} size={SIZE.heading} color={accent.text} metrics={metrics} />
        <Label text={image.headline} size={SIZE.date} metrics={metrics} />
        <div style={{ display: 'flex', flexGrow: 1 }} />
        {page === null ? null : <Label text={page} size={SIZE.count} color={accent.text} metrics={metrics} />}
        <Label text={`${total}件`} size={SIZE.count} color={C.sub} metrics={metrics} />
      </div>
      <div style={{ display: 'flex', width: PW, height: 4, marginTop: 8, background: accent.bar }} />
    </div>
  )
}

/** 1行。毎週は左端に日付（M/D(曜) の文字だけ）を置く。date が null の行は日付を省き、列の幅だけ空ける。 */
const SummaryRow = ({
  row,
  side,
  scope,
  layout,
  dateWidth,
  textWidth,
  metrics,
  avatars
}: {
  row: SocialRow
  side: SocialSide
  scope: Scope
  layout: SummaryRowLayout
  dateWidth: number
  textWidth: number
  metrics: TextMetrics
  avatars: AvatarImages
}) => {
  const accent = sideAccent(side)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: ROW_GAP,
        width: PW,
        padding: `${ROW_PAD}px 0`,
        borderBottom: `2px solid ${C.line}`
      }}
    >
      {scope === 'weekly' ? (
        <div style={{ display: 'flex', alignSelf: 'flex-start', width: dateWidth, flexShrink: 0, paddingTop: 4 }}>
          {row.date === null ? null : (
            <Label text={row.date} size={SIZE.heading} color={accent.text} metrics={metrics} />
          )}
        </div>
      ) : null}
      <div style={{ display: 'flex', position: 'relative', width: ROW_AVATAR_D, height: ROW_AVATAR_D, flexShrink: 0 }}>
        {row.avatars
          .slice(0, ROW_AVATAR_LIMIT)
          .toReversed()
          .map((character, index, visible) => (
            <div key={character} style={{ display: 'flex', position: 'absolute', left: index * 18, top: index * 8 }}>
              <Avatar
                character={character}
                d={visible.length === 1 ? ROW_AVATAR_D : ROW_AVATAR_D - 36}
                tone={sideTone(side)}
                avatars={avatars}
              />
            </div>
          ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: textWidth }}>
        <Text text={row.title} size={layout.title.size} lines={1} width={textWidth} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'nowrap',
            alignItems: 'center',
            width: textWidth,
            overflow: 'hidden'
          }}
        >
          {layout.chunks.map((chunk) => (
            <div
              key={chunk.text}
              style={{
                display: 'flex',
                fontSize: SIZE.info,
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
    </div>
  )
}

const MoreRow = ({ count, accent, metrics }: { count: number; accent: Accent; metrics: TextMetrics }) => (
  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 20, width: PW, height: MORE_H }}>
    <div style={{ display: 'flex', flexGrow: 1, height: 3, background: accent.bar, opacity: 0.35 }} />
    <Label text={`ほか ${count}件`} size={SIZE.more} color={accent.text} metrics={metrics} />
    <div style={{ display: 'flex', flexGrow: 1, height: 3, background: accent.bar, opacity: 0.35 }} />
  </div>
)

export const SummaryImageBody = ({
  kind,
  image,
  metrics,
  avatars
}: {
  kind: SocialImageKind
  image: SocialSummaryImage | SocialEmptyImage
  metrics: TextMetrics
  avatars: AvatarImages
}) => {
  const scope = scopeOf(kind)
  const accent = sideAccent(image.side)
  const dateWidth = dateColumnWidth(metrics)
  const baseWidth = PW - ROW_AVATAR_D - ROW_GAP
  const textWidth = scope === 'weekly' ? baseWidth - dateWidth - ROW_GAP : baseWidth
  return (
    <Frame width={WIDE_W} height={WIDE_H}>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: PX, top: PTOP, width: PW }}>
        <ListHeader scope={scope} image={image} total={image.type === 'summary' ? image.total : 0} metrics={metrics} />
        <div style={{ display: 'flex', flexDirection: 'column', width: PW, marginTop: BODY_GAP }}>
          {image.type === 'empty' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: PW, height: BODY_H }}>
              <Label
                text={SIDE_TEXT[scope][image.side].empty}
                size={SIZE.empty}
                color={accent.text}
                metrics={metrics}
              />
            </div>
          ) : (
            [
              ...image.rows.map((row) => (
                <SummaryRow
                  key={row.eventIds[0]}
                  row={row}
                  side={image.side}
                  scope={scope}
                  layout={planSummaryRow(row, image.side, textWidth, metrics)}
                  dateWidth={dateWidth}
                  textWidth={textWidth}
                  metrics={metrics}
                  avatars={avatars}
                />
              )),
              ...(image.more === undefined
                ? []
                : [<MoreRow key='more' count={image.more} accent={accent} metrics={metrics} />])
            ]
          )}
        </div>
      </div>
    </Frame>
  )
}
