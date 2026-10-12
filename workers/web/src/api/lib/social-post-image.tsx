import type { AvatarImages } from '@api/lib/og-avatars'
import type { OgImageHeight } from '@api/lib/og-event-image'
import { MEASURE_TOLERANCE, type TextMetrics } from '@api/lib/og-text-metrics'
import { isSpecialCharacter } from '@biccame/shared/domain/event-character'
import { SPECIAL_CHARACTER_NAMES } from '@biccame/shared/domain/special-character-names'
import type { EventCharacter, SpecialCharacter } from '@biccame/shared/schemas/event.dto'
import type {
  SocialEmptyImage,
  SocialEventImage,
  SocialImage,
  SocialRow,
  SocialSide,
  SocialSnapshot,
  SocialSummaryImage
} from '@biccame/shared/social'
import type { CSSProperties, ReactNode } from 'react'

/**
 * 投稿画像1枚ぶんの satori 要素。
 * スナップショットの内容だけで描き、データベースは触らない。文字幅の判定は metrics（フォントの実測）で行う。
 */

export type SocialImageKind = SocialSnapshot['kind']

/** 追加・更新は 1200x630、毎朝・毎週（0件側を含む）は 1200x675。 */
export const socialImageHeight = (image: SocialImage): OgImageHeight => (image.type === 'event' ? 630 : 675)

/** 画像に描く娘（Avatar の読み込み対象）。 */
export const socialImageCharacters = (image: SocialImage): EventCharacter[] => {
  switch (image.type) {
    case 'event':
      return image.event.avatars
    case 'summary':
      return image.rows.map((row) => row.avatar)
    case 'empty':
      return []
  }
}

/* ------------------------------------------------------------------ */
/* 配色・寸法                                                           */
/* ------------------------------------------------------------------ */

const FONT_FAMILY = 'Zen Maru Gothic'
const C = {
  bg: 'linear-gradient(135deg, #fff5f5 0%, #ffe4e4 50%, #ffd0d0 100%)',
  text: '#392f36',
  sub: '#64525c',
  line: '#edced5',
  mark: '#ffd3da'
}

/** 種別ごとの差し色。色だけに頼らず、見出しの文言でも見分ける。 */
type Accent = { bar: string; text: string; place: string; soft: string }
const ACCENTS = {
  red: { bar: '#dc2626', text: '#b91c1c', place: '#a52b45', soft: '#ffdbe1' },
  teal: { bar: '#0f766e', text: '#0f766e', place: '#115e59', soft: '#cdeee9' },
  blue: { bar: '#2563eb', text: '#1d4ed8', place: '#1e40af', soft: '#dbe7ff' }
} as const satisfies Record<string, Accent>

/** 丸（Avatar・特殊値・素材欠損の印）の配色。 */
type Tone = { bg: string; text: string; sub: string }
const toneOf = (accent: Accent): Tone => ({ bg: accent.soft, text: accent.text, sub: accent.place })

const lineHeightOf = (size: number): number => Math.round(size * 1.25)

/** 文字幅の見積もりに足す余白。lineClamp が末尾を省略記号で欠かさないよう、実測より少し広い箱に置く。 */
const BOX_SLACK = 12

/* ------------------------------------------------------------------ */
/* 共通パーツ                                                           */
/* ------------------------------------------------------------------ */

/** lineClamp は display:block のときだけ効く。幅が確定している親の中で使う。 */
const Text = ({
  text,
  size,
  lines,
  width,
  color = C.text
}: {
  text: string
  size: number
  lines: number
  width: number
  color?: string
}) => (
  <div style={{ display: 'block', fontSize: size, fontWeight: 700, color, lineHeight: 1.25, lineClamp: lines, width }}>
    {text}
  </div>
)

/** 1行に収まる短い文字。幅は実測から決める。 */
const Label = ({
  text,
  size,
  color = C.text,
  metrics
}: {
  text: string
  size: number
  color?: string
  metrics: TextMetrics
}) => <Text text={text} size={size} lines={1} width={Math.ceil(metrics.width(text, size)) + BOX_SLACK} color={color} />

const Frame = ({ width, height, children }: { width: number; height: number; children: ReactNode }) => (
  <div
    style={{
      display: 'flex',
      position: 'relative',
      width,
      height,
      background: C.bg,
      fontFamily: FONT_FAMILY,
      color: C.text,
      overflow: 'hidden'
    }}
  >
    {children}
  </div>
)

const ringWidthOf = (d: number): number => Math.max(3, Math.round(d / 40))

/** 素材が読めなかったときの保険の丸（ロゴ代わり）。小さいときは「ビ」だけにする。特殊値には使わない。 */
const Mark = ({ d, tone }: { d: number; tone: Tone }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: d,
      height: d,
      borderRadius: d / 2,
      background: tone.bg,
      border: `${ringWidthOf(d)}px solid #ffffff`,
      color: tone.text,
      fontWeight: 700
    }}
  >
    {d >= 200 ? (
      <div style={{ display: 'flex', fontSize: Math.round(d * 0.15) }}>ビッカメ娘</div>
    ) : (
      <div style={{ display: 'flex', fontSize: Math.round(d * 0.46) }}>ビ</div>
    )}
    {d >= 200 ? (
      <div style={{ display: 'flex', fontSize: Math.round(d * 0.07), color: tone.sub }}>推し活応援</div>
    ) : null}
  </div>
)

/**
 * 特殊値（secret / other）の丸。画像は使わず、secret は「？」1文字、other は「その他」を大きく置く。
 * 薄い面とアクセントの濃い色の文字で、縮小しても読めるよう太く、丸の幅いっぱいに使う。
 */
const SpecialAvatar = ({ special, d, tone }: { special: SpecialCharacter; d: number; tone: Tone }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: d,
      height: d,
      borderRadius: d / 2,
      background: tone.bg,
      border: `${ringWidthOf(d)}px solid #ffffff`,
      color: tone.text,
      fontWeight: 700,
      fontSize: Math.round(d * (special === 'secret' ? 0.64 : 0.26)),
      lineHeight: 1
    }}
  >
    {special === 'secret' ? '？' : SPECIAL_CHARACTER_NAMES[special]}
  </div>
)

/** 丸 Avatar。特殊値は SpecialAvatar、素材が無い娘は Mark で埋める。style は配置（絶対位置など）。 */
const Avatar = ({
  character,
  d,
  tone,
  avatars,
  style
}: {
  character: EventCharacter
  d: number
  tone: Tone
  avatars: AvatarImages
  style?: CSSProperties
}) => {
  if (isSpecialCharacter(character)) {
    return (
      <div style={{ display: 'flex', ...style }}>
        <SpecialAvatar special={character} d={d} tone={tone} />
      </div>
    )
  }
  const src = avatars.get(character)
  if (src === undefined) {
    return (
      <div style={{ display: 'flex', ...style }}>
        <Mark d={d} tone={tone} />
      </div>
    )
  }
  return <img src={src} alt='' width={d} height={d} style={{ width: d, height: d, ...style }} />
}

/* ------------------------------------------------------------------ */
/* 店舗の並べ方（追加・更新と毎朝・毎週で共通）                              */
/* ------------------------------------------------------------------ */

/** 折り返さない1塊。after は右の余白（px）。 */
type Chunk = { text: string; color: string; after: number }

/** 店舗名の後ろの「ほか」との間隔。 */
const MORE_GAP = 10

/** 店舗を count 店舗まで並べ、残りは「ほかN店舗」にする。店舗の途中では折り返さないよう1店舗ずつの塊にする。 */
export const storeChunks = (stores: readonly string[], count: number, color: string): Chunk[] => {
  const shown = stores.slice(0, count)
  const rest = stores.length - shown.length
  const named = shown.map((name, index) => ({
    text: index < shown.length - 1 ? `${name}・` : name,
    color,
    after: rest > 0 && index === shown.length - 1 ? MORE_GAP : 0
  }))
  return rest > 0 ? [...named, { text: `ほか${rest}店舗`, color, after: 0 }] : named
}

/* ------------------------------------------------------------------ */
/* 追加・更新（1200x630・1枚）                                           */
/* ------------------------------------------------------------------ */

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

const EventImageBody = ({
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
  const slots = eventAvatarSlots(image.event.avatars.length)
  // 奥から手前の順（先頭の娘が最後）に絶対配置する。DOM の順が描画の順。
  const layers = image.event.avatars.map((character, index) => ({ character, slot: slots[index] }))
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

/* ------------------------------------------------------------------ */
/* 毎朝・毎週（1200x675・4行までの1列リスト）                              */
/* ------------------------------------------------------------------ */

const WIDE_W = 1200
const WIDE_H = 675
const PX = 28
const PTOP = 26
const PBOTTOM = 24
const PW = WIDE_W - PX * 2

/** 文字サイズ。件数に連動して縮めない（入らない分は「ほか N件」にする）。 */
const SIZE = { info: 34, heading: 40, date: 44, count: 36, more: 36, empty: 44, title: 42, titleSmall: 38 } as const

const HEADER_H = lineHeightOf(SIZE.date) + 8 + 4
const BODY_GAP = 12
const BODY_H = WIDE_H - PTOP - PBOTTOM - HEADER_H - BODY_GAP
const MORE_H = lineHeightOf(SIZE.more) + 8

const ROW_AVATAR_D = 104
const ROW_GAP = 16
const ROW_PAD = 8
/** 店舗・対象・期間の間隔。 */
const GROUP_GAP = 28

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

/** 毎週の左端の日付列の幅。「12/28(水)」など、最も幅の広い日付に合わせた固定幅を実測で求める。 */
export const dateColumnWidth = (metrics: TextMetrics): number =>
  Math.ceil(Math.max(...WEEKDAYS.map((weekday) => metrics.width(`12/28(${weekday})`, SIZE.heading)))) + 12

type Scope = 'daily' | 'weekly'
const scopeOf = (kind: SocialImageKind): Scope => {
  if (kind === 'daily' || kind === 'weekly') return kind
  throw new Error(`Social summary image requires daily or weekly: ${kind}`)
}

const sideAccent = (side: SocialSide): Accent => (side === 'starting' ? ACCENTS.red : ACCENTS.teal)
const sideTone = (side: SocialSide): Tone =>
  side === 'starting' ? { bg: C.mark, text: ACCENTS.red.text, sub: ACCENTS.red.place } : toneOf(ACCENTS.teal)

const SIDE_TEXT = {
  daily: {
    starting: { label: '今日からはじまるイベント', empty: '今日からはじまるイベントはありません' },
    ending: { label: '今日までのイベント', empty: '今日までのイベントはありません' }
  },
  weekly: {
    starting: { label: '今週はじまるイベント', empty: '今週はじまるイベントはありません' },
    ending: { label: '今週おわるイベント', empty: '今週おわるイベントはありません' }
  }
} as const

/** 1行の題名。42px で1行に収まればそれ、収まらなければ 38px、それでも収まらなければ省略記号（2行にしない）。 */
export const summaryTitleLayout = (
  title: string,
  width: number,
  metrics: TextMetrics
): { size: number; ellipsis: boolean } => {
  const fits = (size: number): boolean => metrics.width(title, size) <= width - MEASURE_TOLERANCE
  if (fits(SIZE.title)) return { size: SIZE.title, ellipsis: false }
  return { size: SIZE.titleSmall, ellipsis: !fits(SIZE.titleSmall) }
}

/** 7店舗以上は、まず先頭5店舗に絞ってから幅に収まる店舗数を探す。 */
const STORE_COUNT_LIMIT = 5
const initialStoreCount = (stores: readonly string[]): number =>
  stores.length > STORE_COUNT_LIMIT + 1 ? STORE_COUNT_LIMIT : stores.length

/** 店舗・対象・期間を1行に並べた塊。最後の塊の右余白は 0。 */
const rowChunks = (row: SocialRow, storeCount: number, withTarget: boolean, accent: Accent): Chunk[] => {
  const groups: Chunk[][] = [
    storeChunks(row.stores, storeCount, accent.place),
    ...(withTarget && row.target !== null ? [[{ text: `対象: ${row.target}`, color: accent.place, after: 0 }]] : []),
    ...(row.period === null ? [] : [[{ text: row.period, color: C.text, after: 0 }]])
  ]
  return groups.flatMap((group, groupIndex) =>
    group.map((chunk, index) =>
      index === group.length - 1 && groupIndex < groups.length - 1 ? { ...chunk, after: GROUP_GAP } : chunk
    )
  )
}

const chunksWidth = (chunks: readonly Chunk[], metrics: TextMetrics): number =>
  chunks.reduce((sum, chunk) => sum + Math.ceil(metrics.width(chunk.text, SIZE.info)) + chunk.after, 0)

export type SummaryRowLayout = {
  title: { size: number; ellipsis: boolean }
  /** 1行目に並べる店舗数（店舗数以上なら全部）。 */
  storeCount: number
  /** 「対象: ○○」を出すか。入らなければ省く。 */
  showTarget: boolean
  chunks: Chunk[]
}

/**
 * 1行（Avatar の右側の文字領域 textWidth）の組み方。文字は縮めず、入らない分だけ内容を減らす。
 * 店舗を店舗数→1店舗まで減らして（残りは「ほか N店舗」）1行に収め、それでも入らなければ「対象」を外す。
 */
export const planSummaryRow = (
  row: SocialRow,
  side: SocialSide,
  textWidth: number,
  metrics: TextMetrics
): SummaryRowLayout => {
  const accent = sideAccent(side)
  const first = initialStoreCount(row.stores)
  const hasTarget = row.target !== null
  const candidates = [
    ...Array.from({ length: first }, (_, index) => ({ storeCount: first - index, showTarget: hasTarget })),
    ...(hasTarget ? [{ storeCount: 1, showTarget: false }] : [])
  ]
  const plans = candidates.map((candidate) => ({
    ...candidate,
    chunks: rowChunks(row, candidate.storeCount, candidate.showTarget, accent)
  }))
  const [last] = plans.slice(-1)
  const fitted = plans.find((plan) => chunksWidth(plan.chunks, metrics) <= textWidth - MEASURE_TOLERANCE)
  return { title: summaryTitleLayout(row.title, textWidth, metrics), ...(fitted === undefined ? last : fitted) }
}

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
      <div style={{ display: 'flex', width: ROW_AVATAR_D, height: ROW_AVATAR_D, flexShrink: 0 }}>
        <Avatar character={row.avatar} d={ROW_AVATAR_D} tone={sideTone(side)} avatars={avatars} />
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

const SummaryImageBody = ({
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

/* ------------------------------------------------------------------ */
/* 入口                                                                 */
/* ------------------------------------------------------------------ */

export type SocialPostImageProps = {
  /** 投稿の種類。追加・更新の色と、毎朝・毎週の文言を決める（画像からは読み取れない）。 */
  kind: SocialImageKind
  image: SocialImage
  metrics: TextMetrics
  avatars: AvatarImages
}

export const SocialPostImage = ({ kind, image, metrics, avatars }: SocialPostImageProps) =>
  image.type === 'event' ? (
    <EventImageBody kind={kind} image={image} metrics={metrics} avatars={avatars} />
  ) : (
    <SummaryImageBody kind={kind} image={image} metrics={metrics} avatars={avatars} />
  )
