/** @jsxImportSource satori/jsx */
import type { JSXNode } from 'satori/jsx'
import type { StoreKey } from '@/schemas/store.dto'
import { type EventRow, formatLongDay, type Phase, splitTitle, takeRows } from './format'

/**
 * X・Discordへ投稿する画像の部品。satoriのJSXで組み、PNGへの変換は呼び出し側が行う。
 * 立ち絵は環境ごとに読み込み方が違うため、data URL を portraits で受け取る。
 */
export type Portraits = Partial<Record<StoreKey, string>>

const COLOR = {
  red: '#dc2626',
  deep: '#b91c1c',
  ink: '#1a1a1a',
  sub: '#57534e',
  muted: '#9f7a7e',
  line: '#f4cdd0',
  paper: '#ffffff',
  blush: '#fff1f2'
} as const
const BACKGROUND = 'linear-gradient(135deg, #fff5f5 0%, #ffe4e4 50%, #ffd0d0 100%)'

const Footer = ({ hashtag }: { hashtag: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, fontWeight: 700 }}>
    <div style={{ color: COLOR.ink }}>ビッカメ娘 推し活応援プロジェクト</div>
    <div style={{ color: COLOR.red, letterSpacing: '0.05em' }}>{hashtag}</div>
  </div>
)

const Frame = ({
  width,
  height,
  minHeight,
  hashtag,
  padding = '64px 72px 48px',
  children
}: {
  width: number
  height?: number
  minHeight?: number
  hashtag: string
  padding?: string
  children: JSXNode
}) => (
  <div
    style={{
      width,
      ...(height ? { height } : {}),
      ...(minHeight ? { minHeight } : {}),
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 40,
      background: BACKGROUND,
      fontFamily: 'Zen Maru Gothic',
      position: 'relative',
      padding
    }}
  >
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, background: COLOR.red }} />
    {children}
    <Footer hashtag={hashtag} />
  </div>
)

/** 丸窓に立ち絵の上半身を収める。透過SD画像は全身なので拡大して頭側を見せる */
const Portrait = ({ src, size }: { src: string | undefined; size: number }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      background: COLOR.paper,
      border: `3px solid ${COLOR.line}`,
      display: 'flex',
      justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0
    }}
  >
    {src ? <img src={src} alt='' width={size * 1.35} height={size * 1.35} style={{ marginTop: size * 0.02 }} /> : null}
  </div>
)

const PortraitStack = ({ keys, portraits, size }: { keys: StoreKey[]; portraits: Portraits; size: number }) => (
  <div style={{ display: 'flex', width: size + (keys.length - 1) * size * 0.45, flexShrink: 0 }}>
    {keys.map((key, index) => (
      <div style={{ display: 'flex', marginLeft: index === 0 ? 0 : -size * 0.55 }}>
        <Portrait src={portraits[key]} size={size} />
      </div>
    ))}
  </div>
)

const Pill = ({ children, filled, size }: { children: string; filled: boolean; size: number }) => (
  <div
    style={{
      fontSize: size,
      fontWeight: 700,
      padding: `${size * 0.16}px ${size * 0.62}px`,
      borderRadius: 999,
      border: `3px solid ${COLOR.red}`,
      background: filled ? COLOR.red : COLOR.paper,
      color: filled ? COLOR.paper : COLOR.deep
    }}
  >
    {children}
  </div>
)

const Caption = ({ children, size }: { children: string; size: number }) => (
  <div style={{ fontSize: size, fontWeight: 700, color: COLOR.deep }}>{children}</div>
)

/** 開催店舗（と、店舗と異なる場合の対象の娘）を札で並べる */
const Place = ({ row, size }: { row: EventRow; size: number }) => {
  const [first, ...others] = row.stores
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: `${size * 0.35}px ${size * 0.4}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.3 }}>
        <Caption size={size * 0.68}>開催店舗</Caption>
        <Pill filled size={size}>
          {first}
        </Pill>
      </div>
      {others.map((store) => (
        <Pill filled size={size}>
          {store}
        </Pill>
      ))}
      {row.otherStoreCount > 0 ? <Caption size={size * 0.7}>{`ほか ${row.otherStoreCount} 店舗`}</Caption> : null}
      {row.character ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.3 }}>
          <Caption size={size * 0.68}>対象</Caption>
          <Pill filled={false} size={size}>
            {row.character}
          </Pill>
        </div>
      ) : null}
    </div>
  )
}

const Chips = ({ items, size }: { items: string[]; size: number }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: size * 0.4 }}>
    {items.map((item) => (
      <div
        style={{
          fontSize: size,
          fontWeight: 500,
          color: COLOR.sub,
          background: COLOR.paper,
          border: `2px solid ${COLOR.line}`,
          borderRadius: 10,
          padding: `${size * 0.12}px ${size * 0.5}px`
        }}
      >
        {item}
      </div>
    ))}
  </div>
)

const titleStyle = (size: number) => ({ fontSize: size, fontWeight: 700, color: COLOR.ink, lineHeight: 1.18 })

/** 1行に収める題名。収まらなければ末尾を省く */
const Title = ({ children, size }: { children: string; size: number }) => (
  // satori は display: block のときだけ lineClamp を効かせる
  <div style={{ display: 'block', lineClamp: 1, ...titleStyle(size) }}>{children}</div>
)

/** 大きな題名。日本語の切れ目で最大2行に分ける */
const Headline = ({ children, size, perLine }: { children: string; size: number; perLine: number }) => (
  <div style={{ display: 'flex', flexDirection: 'column', ...titleStyle(size) }}>
    {splitTitle(children, perLine).map((line) => (
      <div style={{ display: 'block', lineClamp: 1 }}>{line}</div>
    ))}
  </div>
)

/** リンクカード（OG）。Xではタイムラインで縮小されるため、題名・店舗・立ち絵に絞る */
export const EventOgImage = ({ row, portraits }: { row: EventRow; portraits: Portraits }) => (
  <Frame width={1200} height={630} hashtag='#ビッカメ娘 イベント' padding='64px 64px 44px 72px'>
    <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 28 }}>
        <Place row={row} size={34} />
        <Headline size={66} perLine={11}>
          {row.title}
        </Headline>
        <div style={{ fontSize: 30, fontWeight: 500, color: COLOR.sub }}>{row.note}</div>
      </div>
      <PortraitStack keys={row.portraits.slice(0, 1)} portraits={portraits} size={300} />
    </div>
  </Frame>
)

/** イベント登録時の告知画像。配布条件まで載せる */
export const EventAddedImage = ({ row, portraits }: { row: EventRow; portraits: Portraits }) => (
  <Frame width={1200} height={675} hashtag='#ビッカメ娘 イベント'>
    <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Pill filled size={28}>
            新着イベント
          </Pill>
          {row.category ? <div style={{ fontSize: 28, fontWeight: 700, color: COLOR.deep }}>{row.category}</div> : null}
        </div>
        <Headline size={62} perLine={11}>
          {row.title}
        </Headline>
        <div style={{ fontSize: 34, fontWeight: 700, color: COLOR.ink }}>{row.note}</div>
        <Place row={row} size={30} />
        <Chips items={row.conditions} size={26} />
      </div>
      <PortraitStack keys={row.portraits.slice(0, 1)} portraits={portraits} size={280} />
    </div>
  </Frame>
)

const ROW_SIZES = {
  // 日次: 配布条件まで載せる
  large: { portrait: 104, title: 38, sub: 26, note: 24, gap: 24 },
  // 週次: 期間は2行目の右端に寄せて2行に収める
  medium: { portrait: 80, title: 34, sub: 24, note: 24, gap: 18 }
} as const
type RowSize = keyof typeof ROW_SIZES

const RowLine = ({ row, portraits, size }: { row: EventRow; portraits: Portraits; size: RowSize }) => {
  const scale = ROW_SIZES[size]
  const stores = `${row.stores.join('・')}${row.otherStoreCount > 0 ? ` ほか${row.otherStoreCount}店舗` : ''}`
  const note = <div style={{ fontSize: scale.note, fontWeight: 700, color: COLOR.ink, flexShrink: 0 }}>{row.note}</div>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
      <PortraitStack keys={row.portraits} portraits={portraits} size={scale.portrait} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 6 }}>
        <Title size={scale.title}>{row.title}</Title>
        <div style={{ display: 'flex', gap: 14, fontSize: scale.sub, fontWeight: 500, color: COLOR.sub }}>
          {row.category ? (
            <div style={{ color: COLOR.deep, fontWeight: 700, flexShrink: 0 }}>{row.category}</div>
          ) : null}
          <div style={{ display: 'block', lineClamp: 1, flex: 1 }}>{stores}</div>
          {row.character ? <div style={{ color: COLOR.deep, flexShrink: 0 }}>{`対象 ${row.character}`}</div> : null}
          {size === 'medium' ? note : null}
        </div>
        {size === 'large' ? (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {note}
            <Chips items={row.conditions} size={20} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

const SectionHeading = ({ label, count }: { label: string; count: number }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 16,
      borderBottom: `3px solid ${COLOR.red}`,
      paddingBottom: 10
    }}
  >
    <div style={{ fontSize: 40, fontWeight: 700, color: COLOR.red }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 500, color: COLOR.muted }}>{`${count} 件`}</div>
  </div>
)

const MoreLine = ({ count }: { count: number }) =>
  count > 0 ? (
    <div style={{ fontSize: 26, fontWeight: 700, color: COLOR.muted }}>{`ほか ${count} 件はサイトで`}</div>
  ) : null

const Heading = ({ eyebrow, title }: { eyebrow: string; title: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div style={{ fontSize: 28, fontWeight: 700, color: COLOR.red, letterSpacing: '0.05em' }}>{eyebrow}</div>
    <div style={{ fontSize: 58, fontWeight: 700, color: COLOR.ink }}>{title}</div>
  </div>
)

// X は単体画像を 16:9〜3:4 の範囲なら切らずに表示する。幅1200pxで高さ675〜1600pxに収める
const MIN_HEIGHT = 675
export const MAX_POST_IMAGE_HEIGHT = 1600
const DAILY_ROWS = 6
const WEEKLY_ROWS = 7
const WEEKLY_ROWS_PER_DAY = 3

const DAILY_LABEL: Record<Phase, string> = { starting: '今日から', ongoing: '開催中', ending: '今日まで' }
const WEEKLY_LABEL: Record<Phase, string> = { starting: '今週はじまる', ongoing: '開催中', ending: '今週おわる' }

/** 毎朝9時の日次告知。はじまる・開催中・おわるの3枚に分け、各スレッドの先頭に添える */
export const DailyImage = ({
  date,
  kind,
  rows,
  portraits
}: {
  date: Date
  kind: Phase
  rows: EventRow[]
  portraits: Portraits
}) => (
  <Frame width={1200} minHeight={MIN_HEIGHT} hashtag='#ビッカメ娘 今日のイベント'>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <Heading eyebrow='今日のイベント' title={formatLongDay(date)} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <SectionHeading label={DAILY_LABEL[kind]} count={rows.length} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: ROW_SIZES.large.gap }}>
          {rows.slice(0, DAILY_ROWS).map((row) => (
            <RowLine row={row} portraits={portraits} size='large' />
          ))}
          <MoreLine count={rows.length - DAILY_ROWS} />
        </div>
      </div>
    </div>
  </Frame>
)

/** label が null の区切りは日付見出しを出さない（開催中の一覧） */
export type WeekDay = { label: string | null; holiday: boolean; rows: EventRow[] }

/** 金曜に投稿する、向こう1週間の予定。はじまる・開催中・おわるの3枚に分ける */
export const WeeklyImage = ({
  range,
  kind,
  days,
  portraits
}: {
  range: string
  kind: Phase
  days: WeekDay[]
  portraits: Portraits
}) => {
  const plan = takeRows(
    days.map((day) => day.rows),
    // 開催中は日付で分けないので、1区切りで上限まで並べる
    kind === 'ongoing' ? WEEKLY_ROWS : WEEKLY_ROWS_PER_DAY,
    WEEKLY_ROWS
  )
  const total = days.reduce((sum, day) => sum + day.rows.length, 0)
  return (
    <Frame width={1200} minHeight={MIN_HEIGHT} hashtag='#ビッカメ娘 今週のイベント'>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <Heading eyebrow='今週のイベント' title={range} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <SectionHeading label={WEEKLY_LABEL[kind]} count={total} />
          {days.map((day, index) =>
            plan.shown[index].length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {day.label ? (
                  <div style={{ fontSize: 26, fontWeight: 700, color: day.holiday ? COLOR.red : COLOR.ink }}>
                    {day.label}
                  </div>
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', gap: ROW_SIZES.medium.gap }}>
                  {plan.shown[index].map((row) => (
                    <RowLine row={row} portraits={portraits} size='medium' />
                  ))}
                </div>
              </div>
            ) : null
          )}
          <MoreLine count={plan.hidden} />
        </div>
      </div>
    </Frame>
  )
}
