import { useState } from 'react'
import type { useCharacters } from '@/hooks/use-characters'
import { HOME_LABELS } from '@/locales/app.content'
import { groupCharactersByBirthday } from '@/utils/character'

export type BirthdayDisplayType = 'dialog' | 'fullscreen' | 'banner' | 'hero' | 'floating' | 'background' | 'none'

type BirthdayDisplaySwitcherProps = {
  current: BirthdayDisplayType
  onChange: (type: BirthdayDisplayType) => void
  characters: ReturnType<typeof useCharacters>['data']
  selectedCharacterId: string
  onCharacterChange: (id: string) => void
}

export const BirthdayDisplaySwitcher = ({
  current,
  onChange,
  characters,
  selectedCharacterId,
  onCharacterChange
}: BirthdayDisplaySwitcherProps) => {
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
