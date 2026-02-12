import { Link, useRouter } from '@tanstack/react-router'

import dayjs from 'dayjs'
import { ArrowLeft, Calendar, Clock, ExternalLink, MapPin, Phone, Store, Train } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense } from 'react'
import { CharacterFollowButton } from '@/components/characters/character-follow-button'
import { CharacterOngoingEvents } from '@/components/characters/character-ongoing-events'
import { CharacterVoteButton } from '@/components/characters/character-vote-button'
import { NearbyCharactersList } from '@/components/characters/nearby-characters-list'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { CHARACTER_DETAIL_LABELS } from '@/locales/app.content'
import type { StoreData, StoreKey } from '@/schemas/store.dto'
import { formatDate } from '@/utils/calendar'
import { getDisplayName } from '@/utils/character'

type CharacterDetailContentProps = {
  character: StoreData
}

type CharacterProfileSectionProps = {
  character: StoreData
}

type StoreInfoSectionProps = {
  character: StoreData
}

type InfoItemProps = {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}

/**
 * 店舗情報項目の共通コンポーネント
 */
const InfoItem = ({ icon: Icon, label, children }: InfoItemProps) => {
  return (
    <div className='flex items-start gap-3'>
      <Icon className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
      <div className='min-w-0 flex-1'>
        <p className='text-sm text-gray-500'>{label}</p>
        {children}
      </div>
    </div>
  )
}

/**
 * 店舗名コンポーネント
 */
const StoreName = ({ name, storeId }: { name?: string; storeId?: number }) => {
  if (!name) return null

  return (
    <InfoItem icon={Store} label={CHARACTER_DETAIL_LABELS.storeName}>
      {storeId ? (
        <a
          href={`https://www.biccamera.com/bc/i/shop/shoplist/shop${storeId.toString().padStart(3, '0')}.jsp`}
          target='_blank'
          rel='noopener noreferrer'
          className='text-sm text-pink-600 hover:underline'
        >
          {name}
        </a>
      ) : (
        <p className='text-sm text-gray-900'>{name}</p>
      )}
    </InfoItem>
  )
}

/**
 * 住所コンポーネント
 */
const StoreAddress = ({ address, postalCode }: { address?: string; postalCode?: string | null }) => {
  if (!address) return null

  return (
    <InfoItem icon={MapPin} label={CHARACTER_DETAIL_LABELS.address}>
      {postalCode && <p className='text-sm text-gray-900'>〒{postalCode}</p>}
      <p className='text-sm text-gray-900'>{address}</p>
    </InfoItem>
  )
}

/**
 * 電話番号コンポーネント
 */
const StorePhone = ({ phone }: { phone?: string }) => {
  if (!phone) return null

  return (
    <InfoItem icon={Phone} label={CHARACTER_DETAIL_LABELS.phone}>
      <a href={`tel:${phone}`} className='text-sm text-pink-600 hover:underline'>
        {phone}
      </a>
    </InfoItem>
  )
}

/**
 * 営業時間コンポーネント
 */
const StoreHours = ({
  hours,
  openAllYear
}: {
  hours?: Array<{ type: string; open_time: string; close_time: string }>
  openAllYear?: boolean
}) => {
  if (!hours || hours.length === 0) return null

  return (
    <InfoItem icon={Clock} label={CHARACTER_DETAIL_LABELS.hours}>
      <div className='space-y-1'>
        {hours.map((hour) => (
          <div key={`${hour.type}-${hour.open_time}-${hour.close_time}`} className='text-sm text-gray-900'>
            {hour.type === 'weekday' && '平日: '}
            {hour.type === 'weekend' && '土日祝: '}
            {hour.type === 'holiday' && '日曜・祝日: '}
            {hour.type === 'all' && ''}
            {hour.open_time}～{hour.close_time}
          </div>
        ))}
        {openAllYear && <div className='text-sm text-gray-500'>年中無休</div>}
      </div>
    </InfoItem>
  )
}

/**
 * アクセス情報コンポーネント
 */
const StoreAccess = ({ access }: { access: Array<{ station: string; description?: string; lines?: string[] }> }) => {
  if (!access || access.length === 0) return null

  return (
    <InfoItem icon={Train} label={CHARACTER_DETAIL_LABELS.access}>
      <div className='space-y-2'>
        {access.map((item) => (
          <div key={item.station}>
            <p className='text-sm text-gray-900 font-medium'>{item.station}</p>
            {item.description && <p className='text-sm text-gray-600'>{item.description}</p>}
            {item.lines && item.lines.length > 0 && <p className='text-sm text-gray-500'>{item.lines.join(' / ')}</p>}
          </div>
        ))}
      </div>
    </InfoItem>
  )
}

/**
 * 店舗開店日コンポーネント
 */
const StoreBirthday = ({ birthday }: { birthday?: string }) => {
  if (!birthday) return null

  return (
    <InfoItem icon={Calendar} label={CHARACTER_DETAIL_LABELS.openDate}>
      <p className='text-sm text-gray-900'>{formatDate(birthday)}</p>
    </InfoItem>
  )
}

/**
 * キャラクタープロフィールセクション
 */
const CharacterProfileSection = ({ character }: CharacterProfileSectionProps) => {
  return (
    <>
      {/* プロフィールセクション */}
      <div className='mb-4 flex items-end justify-between gap-4'>
        <motion.div
          key={`avatar-${character.id}`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Avatar className='h-21.25 w-21.25 border-2 border-gray-800'>
            <AvatarImage
              src={character.character?.image_url}
              alt={character.character?.name || ''}
              className='object-cover scale-150 translate-y-4'
            />
            <AvatarFallback className='text-4xl bg-pink-100 text-pink-700'>
              {character.character?.name?.[0] || '?'}
            </AvatarFallback>
          </Avatar>
        </motion.div>

        {/* アクションボタン */}
        <div className='flex gap-2'>
          {character.character?.twitter_id && <CharacterFollowButton twitterId={character.character.twitter_id} />}
          {character.character?.is_biccame_musume && (
            <CharacterVoteButton
              characterId={character.id}
              characterName={character.character.name}
              variant='compact'
            />
          )}
        </div>
      </div>

      {/* 名前と説明 */}
      <motion.div
        key={`profile-${character.id}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className='mb-6'
      >
        <h1 className='text-2xl font-bold text-gray-900'>{getDisplayName(character.character?.name || '')}</h1>
        {character.character?.twitter_id && (
          <a
            href={`https://twitter.com/${character.character.twitter_id}`}
            target='_blank'
            rel='noopener noreferrer'
            className='text-sky-600 text-sm hover:text-sky-800'
          >
            @{character.character.twitter_id}
          </a>
        )}
        <p className='text-sm text-gray-800 mt-3 leading-relaxed'>{character.character?.description}</p>

        {/* 公式プロフィールリンク */}
        {character.character?.is_biccame_musume && (
          <a
            href={`https://biccame.jp/profile/${character.id}.html`}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 text-sm text-pink-600 hover:text-pink-800 hover:underline mt-3'
          >
            <ExternalLink className='h-3.5 w-3.5' />
            公式プロフィール
          </a>
        )}

        {/* メタ情報 */}
        <div className='flex flex-wrap gap-4 mt-3 text-sm text-gray-500'>
          {character.prefecture && (
            <div className='flex items-center gap-1'>
              <MapPin className='h-4 w-4' />
              <span>{character.prefecture}</span>
            </div>
          )}
          {character.character?.birthday && <span>{dayjs(character.character.birthday).format('M月D日')}生まれ</span>}
          {character.coordinates && (
            <Link to='/location' search={{ id: character.id }} className='text-pink-600 hover:underline'>
              地図で見る
            </Link>
          )}
        </div>
      </motion.div>
    </>
  )
}

/**
 * 店舗情報セクション
 */
const StoreInfoSection = ({ character }: StoreInfoSectionProps) => {
  if (!character.store) {
    return null
  }

  return (
    <motion.div
      key={`store-${character.id}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className='space-y-3'
    >
      <h2 className='text-xl font-bold text-gray-900'>店舗情報</h2>
      <div className='space-y-3'>
        <StoreName name={character.store.name} storeId={character.store.store_id} />
        <StoreAddress address={character.store.address} postalCode={character.postal_code} />
        <StorePhone phone={character.store.phone} />
        <StoreHours hours={character.store.hours} openAllYear={character.store.open_all_year} />
        <StoreAccess access={character.store.access} />
        <StoreBirthday birthday={character.store.birthday} />
      </div>
    </motion.div>
  )
}

/**
 * キャラクター詳細コンテンツ
 */
export const CharacterDetailContent = ({ character }: CharacterDetailContentProps) => {
  const router = useRouter()

  return (
    <div className='min-h-screen bg-pink-50'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div className='md:grid md:grid-cols-[1fr_auto_320px] md:gap-6'>
          {/* メインコンテンツ */}
          <div className='max-w-2xl'>
            {/* 戻るボタン */}
            <div className='pb-2'>
              <Button
                variant='ghost'
                size='sm'
                className='text-gray-600 hover:text-gray-900 -ml-2'
                onClick={() => router.history.back()}
              >
                <ArrowLeft className='h-4 w-4 mr-1' />
                戻る
              </Button>
            </div>

            <CharacterProfileSection character={character} />
            <Suspense fallback={null}>
              <CharacterOngoingEvents storeKey={character.id as StoreKey} />
            </Suspense>
            <StoreInfoSection character={character} />
          </div>

          {/* Separator */}
          <Separator orientation='vertical' className='hidden md:block' />

          {/* サイドバー（デスクトップのみ） */}
          <div className='hidden md:block pt-4'>
            <div className='sticky top-4'>
              <NearbyCharactersList currentCharacter={character} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
