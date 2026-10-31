import type { AvatarImages } from '@api/lib/og-avatars'
import type { TextMetrics } from '@api/lib/og-text-metrics'
import { isSpecialCharacter } from '@biccame/shared/domain/event-character'
import { SPECIAL_CHARACTER_NAMES } from '@biccame/shared/domain/special-character-names'
import type { EventCharacter, SpecialCharacter } from '@biccame/shared/schemas/event.dto'
import type { SocialSnapshot } from '@biccame/shared/social'
import type { CSSProperties, ReactNode } from 'react'

export type SocialImageKind = SocialSnapshot['kind']

/** 毎朝・毎週の1行に描く娘の人数の上限。描画（SummaryRow）と Avatar の読み込み（socialImageCharacters）で同じ値を使う。 */
export const ROW_AVATAR_LIMIT = 3

const FONT_FAMILY = 'Zen Maru Gothic'
export const C = {
  bg: 'linear-gradient(135deg, #fff5f5 0%, #ffe4e4 50%, #ffd0d0 100%)',
  text: '#392f36',
  sub: '#64525c',
  line: '#edced5',
  mark: '#ffd3da'
}

/** 種別ごとの差し色。色だけに頼らず、見出しの文言でも見分ける。 */
export type Accent = { bar: string; text: string; place: string; soft: string }
export const ACCENTS = {
  red: { bar: '#dc2626', text: '#b91c1c', place: '#a52b45', soft: '#ffdbe1' },
  teal: { bar: '#0f766e', text: '#0f766e', place: '#115e59', soft: '#cdeee9' },
  blue: { bar: '#2563eb', text: '#1d4ed8', place: '#1e40af', soft: '#dbe7ff' }
} as const satisfies Record<string, Accent>

/** 丸（Avatar・特殊値・素材欠損の印）の配色。 */
export type Tone = { bg: string; text: string; sub: string }
export const toneOf = (accent: Accent): Tone => ({ bg: accent.soft, text: accent.text, sub: accent.place })

export const lineHeightOf = (size: number): number => Math.round(size * 1.25)

/** 文字幅の見積もりに足す余白。lineClamp が末尾を省略記号で欠かさないよう、実測より少し広い箱に置く。 */
const BOX_SLACK = 12

/* ------------------------------------------------------------------ */
/* 共通パーツ                                                           */
/* ------------------------------------------------------------------ */

/** lineClamp は display:block のときだけ効く。幅が確定している親の中で使う。 */
export const Text = ({
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
export const Label = ({
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

export const Frame = ({ width, height, children }: { width: number; height: number; children: ReactNode }) => (
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
export const Avatar = ({
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
export type Chunk = { text: string; color: string; after: number }

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
