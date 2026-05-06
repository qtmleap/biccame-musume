import type { LucideIcon } from 'lucide-react'
import {
  Award,
  Cake,
  Camera,
  Crown,
  Flame,
  Flower,
  Gift,
  Heart,
  Leaf,
  MapPin,
  Medal,
  PartyPopper,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Target,
  Ticket,
  TreePine,
  Trophy,
  Vote,
  Zap
} from 'lucide-react'

/**
 * バッジの希少度
 * - common: 通常獲得
 * - rare: 中難易度
 * - epic: 高難易度
 * - legendary: 伝説（コンプ報酬・特別イベント）
 */
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary'

export type BadgeCategoryKey = 'visit' | 'event' | 'vote' | 'season' | 'anniversary'

export type BadgeCategory = {
  key: BadgeCategoryKey
  label: string
  description: string
  /** カテゴリのアクセント（テーマ変数を bg/text として使用） */
  accent: 'rank-gold' | 'favorite' | 'brand' | 'category-limited-card-solid' | 'rank-bronze'
}

export type Badge = {
  id: string
  categoryKey: BadgeCategoryKey
  name: string
  description: string
  /** 獲得条件のヒント（未獲得時に表示） */
  hint: string
  rarity: BadgeRarity
  icon: LucideIcon
  /** 獲得済みかどうか（モック） */
  earned: boolean
  /** 獲得日（earned=true のときのみ） */
  earnedAt?: string
}

export type LeaderboardEntry = {
  rank: number
  uid: string
  displayName: string
  photoURL?: string
  earnedCount: number
  /** 表示用の称号（最高ランクバッジ等） */
  title?: string
  /** 自分自身か */
  isMe?: boolean
}

export const BADGE_CATEGORIES: BadgeCategory[] = [
  {
    key: 'anniversary',
    label: '11周年限定',
    description: '記念キャンペーン期間中だけのレア称号',
    accent: 'rank-gold'
  },
  {
    key: 'visit',
    label: '店舗訪問',
    description: '全国のビックカメラを巡って集めよう',
    accent: 'category-limited-card-solid'
  },
  {
    key: 'event',
    label: 'イベント参加',
    description: 'リアル・オンラインイベントへの参加で獲得',
    accent: 'brand'
  },
  {
    key: 'vote',
    label: '投票実績',
    description: '推しへの票で積み重なる勲章',
    accent: 'favorite'
  },
  {
    key: 'season',
    label: 'シーズン',
    description: '四季ごとに開催される定例キャンペーン',
    accent: 'rank-bronze'
  }
]

/**
 * モック用バッジ一覧（25 個 / 獲得 11 個 = 44%）
 */
export const MOCK_BADGES: Badge[] = [
  // ===== 11 周年限定 =====
  {
    id: 'anniv-01',
    categoryKey: 'anniversary',
    name: 'アニバーサリー参加',
    description: '11 周年キャンペーンに最初の一歩',
    hint: 'キャンペーンページから参加登録',
    rarity: 'common',
    icon: PartyPopper,
    earned: true,
    earnedAt: '2026-04-01'
  },
  {
    id: 'anniv-02',
    categoryKey: 'anniversary',
    name: '11 連投票',
    description: '11 票を 1 日で投じるとゲット',
    hint: '同日中に 11 票連続で投票',
    rarity: 'rare',
    icon: Zap,
    earned: true,
    earnedAt: '2026-04-12'
  },
  {
    id: 'anniv-03',
    categoryKey: 'anniversary',
    name: 'ラッキー 11',
    description: '11 日に 11 個目のバッジを獲得',
    hint: '4 月 11 日にバッジを 11 個保持',
    rarity: 'epic',
    icon: Sparkles,
    earned: false
  },
  {
    id: 'anniv-04',
    categoryKey: 'anniversary',
    name: 'コンプリート達成',
    description: '全バッジを集めた猛者の証',
    hint: '残り全バッジを獲得すると解放',
    rarity: 'legendary',
    icon: Crown,
    earned: false
  },
  // ===== 店舗訪問 =====
  {
    id: 'visit-01',
    categoryKey: 'visit',
    name: '初訪問',
    description: 'はじめて店舗に足を運んだ',
    hint: '任意の 1 店舗を訪問',
    rarity: 'common',
    icon: MapPin,
    earned: true,
    earnedAt: '2026-03-15'
  },
  {
    id: 'visit-02',
    categoryKey: 'visit',
    name: '関東マスター',
    description: '関東のビックカメラを 3 店舗以上踏破',
    hint: '関東エリアの店舗を 3 つ訪問',
    rarity: 'rare',
    icon: Target,
    earned: true,
    earnedAt: '2026-03-28'
  },
  {
    id: 'visit-03',
    categoryKey: 'visit',
    name: '関西進出',
    description: '関西のビックカメラを 2 店舗踏破',
    hint: '関西エリアの店舗を 2 つ訪問',
    rarity: 'rare',
    icon: Camera,
    earned: false
  },
  {
    id: 'visit-04',
    categoryKey: 'visit',
    name: '日本縦断',
    description: '北海道〜九州まで 5 エリア制覇',
    hint: '北海道・関東・中部・関西・九州を訪問',
    rarity: 'epic',
    icon: Trophy,
    earned: false
  },
  {
    id: 'visit-05',
    categoryKey: 'visit',
    name: '全店巡礼',
    description: 'ビックカメラ全店制覇の伝説',
    hint: '全店舗を訪問するとアンロック',
    rarity: 'legendary',
    icon: Crown,
    earned: false
  },
  // ===== イベント参加 =====
  {
    id: 'event-01',
    categoryKey: 'event',
    name: 'はじめてのイベント',
    description: '初めてイベントに参加した',
    hint: 'イベントを 1 件「参加済み」に',
    rarity: 'common',
    icon: Ticket,
    earned: true,
    earnedAt: '2026-03-20'
  },
  {
    id: 'event-02',
    categoryKey: 'event',
    name: '常連さん',
    description: 'イベントに 5 件参加',
    hint: 'イベントを 5 件参加済みに',
    rarity: 'rare',
    icon: Gift,
    earned: true,
    earnedAt: '2026-04-05'
  },
  {
    id: 'event-03',
    categoryKey: 'event',
    name: 'プレミア参加',
    description: '限定カードイベントに参加',
    hint: 'カテゴリ「限定」のイベントへ参加',
    rarity: 'rare',
    icon: Star,
    earned: false
  },
  {
    id: 'event-04',
    categoryKey: 'event',
    name: 'イベントマスター',
    description: 'イベントに 20 件参加',
    hint: 'イベントを 20 件参加済みに',
    rarity: 'epic',
    icon: Medal,
    earned: false
  },
  {
    id: 'event-05',
    categoryKey: 'event',
    name: 'イベントの主',
    description: 'イベントに 50 件参加',
    hint: 'イベントを 50 件参加済みに',
    rarity: 'legendary',
    icon: Award,
    earned: false
  },
  // ===== 投票実績 =====
  {
    id: 'vote-01',
    categoryKey: 'vote',
    name: '初投票',
    description: 'はじめての一票',
    hint: '任意のキャラに 1 票',
    rarity: 'common',
    icon: Vote,
    earned: true,
    earnedAt: '2026-03-10'
  },
  {
    id: 'vote-02',
    categoryKey: 'vote',
    name: '推し活開始',
    description: '同一キャラに 10 票',
    hint: '同じキャラへ累計 10 票',
    rarity: 'rare',
    icon: Heart,
    earned: true,
    earnedAt: '2026-03-22'
  },
  {
    id: 'vote-03',
    categoryKey: 'vote',
    name: '推し一筋',
    description: '同一キャラに 100 票',
    hint: '同じキャラへ累計 100 票',
    rarity: 'epic',
    icon: Flame,
    earned: false
  },
  {
    id: 'vote-04',
    categoryKey: 'vote',
    name: '推し広め隊',
    description: '異なる 11 キャラに投票',
    hint: '違うキャラに 11 人分投票',
    rarity: 'legendary',
    icon: Sparkles,
    earned: false
  },
  // ===== シーズン =====
  {
    id: 'season-01',
    categoryKey: 'season',
    name: '春',
    description: '春キャンペーン参加',
    hint: '3〜5 月に 1 票以上',
    rarity: 'common',
    icon: Flower,
    earned: true,
    earnedAt: '2026-03-12'
  },
  {
    id: 'season-02',
    categoryKey: 'season',
    name: '夏',
    description: '夏キャンペーン参加',
    hint: '6〜8 月に 1 票以上',
    rarity: 'common',
    icon: Sun,
    earned: false
  },
  {
    id: 'season-03',
    categoryKey: 'season',
    name: '秋',
    description: '秋キャンペーン参加',
    hint: '9〜11 月に 1 票以上',
    rarity: 'common',
    icon: Leaf,
    earned: false
  },
  {
    id: 'season-04',
    categoryKey: 'season',
    name: '冬',
    description: '冬キャンペーン参加',
    hint: '12〜2 月に 1 票以上',
    rarity: 'common',
    icon: Snowflake,
    earned: true,
    earnedAt: '2026-02-08'
  },
  {
    id: 'season-05',
    categoryKey: 'season',
    name: '四季コンプリート',
    description: '春夏秋冬すべて参加',
    hint: '4 シーズンすべてに参加',
    rarity: 'epic',
    icon: TreePine,
    earned: false
  },
  {
    id: 'season-06',
    categoryKey: 'season',
    name: 'バースデー参加',
    description: '推しの誕生日に投票',
    hint: '推しの誕生日に 1 票',
    rarity: 'rare',
    icon: Cake,
    earned: true,
    earnedAt: '2026-04-18'
  }
]

/**
 * モックリーダーボード（12 名・自分は 7 位想定）
 */
export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, uid: 'u-001', displayName: 'カメラマニア太郎', earnedCount: 24, title: '全店巡礼' },
  { rank: 2, uid: 'u-002', displayName: 'ビッカメ研究員', earnedCount: 22, title: 'コンプ目前' },
  { rank: 3, uid: 'u-003', displayName: 'ぽいんと収集家', earnedCount: 21, title: 'ガチ勢' },
  { rank: 4, uid: 'u-004', displayName: '推し活ガール', earnedCount: 19 },
  { rank: 5, uid: 'u-005', displayName: '関東マスター', earnedCount: 17 },
  { rank: 6, uid: 'u-006', displayName: '池袋徒歩 5 分', earnedCount: 14 },
  { rank: 7, uid: 'me', displayName: 'あなた', earnedCount: 11, isMe: true },
  { rank: 8, uid: 'u-008', displayName: 'みけねこ提督', earnedCount: 10 },
  { rank: 9, uid: 'u-009', displayName: 'akiba_walker', earnedCount: 9 },
  { rank: 10, uid: 'u-010', displayName: '昭和生まれ', earnedCount: 8 },
  { rank: 11, uid: 'u-011', displayName: 'よっしー', earnedCount: 7 },
  { rank: 12, uid: 'u-012', displayName: 'ぴっかぴか', earnedCount: 6 }
]

/**
 * 称号ロジック：獲得数からティアを決定
 */
export const getTierFromCount = (count: number, total: number): { label: string; tone: BadgeRarity } => {
  const ratio = total > 0 ? count / total : 0
  if (ratio >= 1) return { label: 'コンプリート', tone: 'legendary' }
  if (ratio >= 0.75) return { label: 'プラチナ', tone: 'epic' }
  if (ratio >= 0.5) return { label: 'ゴールド', tone: 'rare' }
  if (ratio >= 0.25) return { label: 'シルバー', tone: 'common' }
  return { label: 'ブロンズ', tone: 'common' }
}
