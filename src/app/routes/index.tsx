import { createFileRoute } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { UpcomingEventList } from '@/components/events/upcoming-event-list'
import { BirthdayBackground } from '@/components/home/birthday-background'
import { BirthdayBanner } from '@/components/home/birthday-banner'
import { BirthdayDialog } from '@/components/home/birthday-dialog'
import { BirthdayFloatingCard } from '@/components/home/birthday-floating-card'
import { BirthdayFullscreenOverlay } from '@/components/home/birthday-fullscreen-overlay'
import { BirthdayHeroSection } from '@/components/home/birthday-hero-section'
import { HomeHeader } from '@/components/home/home-header'
import { LineStickerList } from '@/components/home/line-sticker-list'
import { useCharacters } from '@/hooks/useCharacters'
import { getBirthdayCharacters } from '@/utils/character'

/**
 * 誕生日表示パターンの種類
 */
type BirthdayDisplayType = 'dialog' | 'fullscreen' | 'banner' | 'hero' | 'floating' | 'background' | 'none'

/**
 * 誕生日表示コンポーネントの切り替え（開発環境用）
 */
const BirthdayDisplaySwitcher = ({
  current,
  onChange
}: {
  current: BirthdayDisplayType
  onChange: (type: BirthdayDisplayType) => void
}) => {
  if (!import.meta.env.DEV) return null

  const options: { value: BirthdayDisplayType; label: string }[] = [
    { value: 'dialog', label: 'ダイアログ' },
    { value: 'fullscreen', label: 'フルスクリーン' },
    { value: 'banner', label: 'バナー' },
    { value: 'hero', label: 'ヒーロー' },
    { value: 'floating', label: 'フローティング' },
    { value: 'background', label: '背景' },
    { value: 'none', label: 'なし' }
  ]

  return (
    <div className='fixed top-20 left-4 z-100 rounded-lg bg-white/90 p-3 shadow-lg backdrop-blur-sm'>
      <p className='mb-2 text-xs font-medium text-gray-600'>誕生日表示パターン</p>
      <div className='flex flex-col gap-1'>
        {options.map((option) => (
          <button
            key={option.value}
            type='button'
            onClick={() => onChange(option.value)}
            className={`rounded px-3 py-1 text-left text-xs transition-colors ${
              current === option.value ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * 誕生日表示コンポーネント
 */
const BirthdayDisplay = ({
  type,
  characters
}: {
  type: BirthdayDisplayType
  characters: ReturnType<typeof getBirthdayCharacters>
}) => {
  switch (type) {
    case 'dialog':
      return <BirthdayDialog characters={characters} />
    case 'fullscreen':
      return <BirthdayFullscreenOverlay characters={characters} />
    case 'banner':
      return <BirthdayBanner characters={characters} />
    case 'hero':
      return <BirthdayHeroSection characters={characters} />
    case 'floating':
      return <BirthdayFloatingCard characters={characters} />
    case 'background':
      return <BirthdayBackground characters={characters} />
    default:
      return null
  }
}

/**
 * トップページコンテンツ
 */
const HomeContent = () => {
  const { data: characters } = useCharacters()
  const birthdayCharacters = getBirthdayCharacters(characters)
  const [displayType, setDisplayType] = useState<BirthdayDisplayType>('dialog')

  return (
    <div>
      <BirthdayDisplaySwitcher current={displayType} onChange={setDisplayType} />
      <HomeHeader />
      {/* ヒーローセクションはコンテンツ内に表示 */}
      {displayType === 'hero' && <BirthdayHeroSection characters={birthdayCharacters} />}
      <UpcomingEventList characters={characters} />
      <LineStickerList />
      {/* 他のパターンはオーバーレイ表示 */}
      {displayType !== 'hero' && <BirthdayDisplay type={displayType} characters={birthdayCharacters} />}
    </div>
  )
}

/**
 * ルートコンポーネント
 */
const RouteComponent = () => (
  <Suspense fallback={<LoadingFallback />}>
    <HomeContent />
  </Suspense>
)

export const Route = createFileRoute('/')({
  component: RouteComponent
})
