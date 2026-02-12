import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { UpcomingEventList } from '@/components/events/upcoming-event-list'
import { BirthdayBackground } from '@/components/home/birthday-background'
import { BirthdayBanner } from '@/components/home/birthday-banner'
import { BirthdayDialog } from '@/components/home/birthday-dialog'
import { BirthdayFloatingCard } from '@/components/home/birthday-floating-card'
import { BirthdayFullscreenOverlay } from '@/components/home/birthday-fullscreen-overlay'
import { BirthdayHeroSection } from '@/components/home/birthday-hero-section'
import { EventList } from '@/components/home/event-list'
import { HomeHeader } from '@/components/home/home-header'
import { LineStickerList } from '@/components/home/line-sticker-list'
import { Button } from '@/components/ui/button'
import { useCharacters } from '@/hooks/use-characters'
import { HOME_LABELS } from '@/locales/app.content'
import { getBirthdayCharacters, groupCharactersByBirthday } from '@/utils/character'

/**
 * 誕生日表示パターンの種類
 */
type BirthdayDisplayType = 'dialog' | 'fullscreen' | 'banner' | 'hero' | 'floating' | 'background' | 'none'

/**
 * オフラインキャッシュをリセットするボタン
 */
const ClearCacheButton = () => {
  const queryClient = useQueryClient()

  const handleClearCache = () => {
    // Tanstack Queryのキャッシュをクリア
    queryClient.clear()
    // LocalStorageからオフラインキャッシュを削除
    localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE')
    toast.success('オフラインキャッシュをリセットしたよ！')
    // ページをリロードして変更を反映
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  if (!import.meta.env.DEV) return null

  return (
    <Button
      type='button'
      onClick={handleClearCache}
      variant='outline'
      size='sm'
      className='fixed bottom-4 right-4 z-100 gap-2 shadow-lg'
    >
      <Trash2 className='h-4 w-4' />
      キャッシュリセット
    </Button>
  )
}

/**
 * 誕生日表示コンポーネントの切り替え（開発環境用）
 */
const BirthdayDisplaySwitcher = ({
  current,
  onChange,
  characters,
  selectedCharacterId,
  onCharacterChange
}: {
  current: BirthdayDisplayType
  onChange: (type: BirthdayDisplayType) => void
  characters: ReturnType<typeof useCharacters>['data']
  selectedCharacterId: string
  onCharacterChange: (id: string) => void
}) => {
  const [showPatternOptions, setShowPatternOptions] = useState(false)
  const birthdayGroups = groupCharactersByBirthday(characters)

  const options: { value: BirthdayDisplayType; label: string }[] = [
    { value: 'dialog', label: HOME_LABELS.patternDialog },
    { value: 'fullscreen', label: HOME_LABELS.patternFullscreen },
    { value: 'banner', label: HOME_LABELS.patternBanner },
    { value: 'hero', label: HOME_LABELS.patternHero },
    { value: 'floating', label: HOME_LABELS.patternFloating },
    { value: 'background', label: HOME_LABELS.patternBackground },
    { value: 'none', label: HOME_LABELS.patternNone }
  ]

  if (!import.meta.env.DEV) return null

  return (
    <div className='fixed top-20 left-4 z-100 rounded-lg bg-white/90 p-3 shadow-lg backdrop-blur-sm'>
      <div className='mb-2'>
        <p className='mb-2 text-xs font-medium text-gray-600'>誕生日キャラクター</p>
        <select
          value={selectedCharacterId}
          onChange={(e) => onCharacterChange(e.target.value)}
          className='w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500'
        >
          {birthdayGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.birthday})
            </option>
          ))}
        </select>
      </div>
      <button
        type='button'
        onClick={() => setShowPatternOptions(!showPatternOptions)}
        className='text-xs text-gray-500 hover:text-gray-700 underline'
      >
        {showPatternOptions ? HOME_LABELS.hidePattern : HOME_LABELS.displayPattern}
      </button>
      {showPatternOptions && (
        <div className='mt-2 pt-2 border-t border-gray-200'>
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
      )}
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
  const [displayType, setDisplayType] = useState<BirthdayDisplayType>('hero')
  const [selectedCharacterId, setSelectedCharacterId] = useState('kyoto')
  const birthdayCharacters = getBirthdayCharacters(characters, selectedCharacterId)

  return (
    <div className='flex flex-col gap-3'>
      <BirthdayDisplaySwitcher
        current={displayType}
        onChange={setDisplayType}
        characters={characters}
        selectedCharacterId={selectedCharacterId}
        onCharacterChange={setSelectedCharacterId}
      />
      <ClearCacheButton />
      <HomeHeader />
      {/* ヒーローセクションはコンテンツ内に表示 */}
      {displayType === 'hero' && <BirthdayHeroSection characters={birthdayCharacters} />}
      <UpcomingEventList characters={characters} />
      <EventList />
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
