import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useCharacters } from '@/hooks/useCharacters'

/**
 * 日付をフォーマットする関数
 */
const formatDate = (dateString: string): string => {
  return dayjs(dateString).format('YYYY年M月D日')
}

/**
 * ローディングフォールバック
 */
const LoadingFallback = () => (
  <div className='min-h-screen flex items-center justify-center'>
    <div className='text-center'>
      <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4' />
      <p className='text-muted-foreground'>読み込み中...</p>
    </div>
  </div>
)

/**
 * キャラクター詳細コンテンツ
 */
const CharacterDetailContent = ({ id }: { id: string }) => {
  const { data: characters } = useCharacters()

  const character = useMemo(() => {
    return characters.find((c) => c.key === id)
  }, [characters, id])

  if (!character) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <p className='text-destructive mb-4'>キャラクターが見つかりませんでした</p>
          <Link to='/characters'>
            <Button variant='outline'>
              <ArrowLeft className='h-4 w-4 mr-2' />
              一覧に戻る
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen'>
      <div className='container mx-auto px-4 py-6 max-w-3xl'>
        {/* 戻るボタン */}
        <div className='mb-4'>
          <Link to='/characters'>
            <Button variant='ghost' size='sm' className='text-pink-600 hover:text-pink-700 -ml-2'>
              <ArrowLeft className='h-4 w-4 mr-1' />
              戻る
            </Button>
          </Link>
        </div>

        {/* ヒーローセクション */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className='flex gap-4 sm:gap-6 mb-6'
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
            className='shrink-0'
          >
            <Avatar className='h-24 w-24 sm:h-32 sm:w-32 md:h-40 md:w-40 shadow-lg border-2 border-pink-300'>
              <AvatarImage
                src={character.image_urls?.[1] || character.image_urls?.[0]}
                alt={character.character_name}
                className='object-cover'
              />
              <AvatarFallback className='text-2xl sm:text-3xl md:text-4xl bg-pink-100 text-pink-700'>
                {character.character_name[0]}
              </AvatarFallback>
            </Avatar>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
            className='flex flex-col justify-end min-w-0'
          >
            <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 truncate'>{character.character_name}</h1>
            <p className='text-lg text-pink-600 font-medium truncate'>{character.store_name}</p>
            <p className='text-sm text-gray-500 mt-1'>
              {character.address?.split(/都|道|府|県/)[0]}
              {character.address?.match(/都|道|府|県/)?.[0]}
              {character.character_birthday && ` · ${dayjs(character.character_birthday).format('M月D日')}生まれ`}
            </p>
          </motion.div>
        </motion.div>

        {/* アクションボタン */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3, ease: 'easeOut' }}
          className='flex justify-center gap-2 mb-8'
        >
          {character.twitter_url && (
            <a
              href={`https://twitter.com/intent/follow?screen_name=${character.twitter_url.split('/').pop()}`}
              target='_blank'
              rel='noopener noreferrer'
            >
              <Button size='sm' className='bg-pink-600 hover:bg-pink-700 text-white'>
                フォローする
              </Button>
            </a>
          )}
          <a href={character.detail_url} target='_blank' rel='noopener noreferrer'>
            <Button size='sm' variant='outline'>
              公式ページ
            </Button>
          </a>
          {character.latitude && character.longitude && (
            <Link to='/location' search={{ id: character.key }}>
              <Button size='sm' variant='outline'>
                マップ
              </Button>
            </Link>
          )}
        </motion.div>

        {/* 説明文 */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4, ease: 'easeOut' }}
          className='mb-8'
        >
          <h2 className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>プロフィール</h2>
          <p className='text-gray-800 leading-relaxed'>{character.description}</p>
        </motion.div>

        {/* 情報リスト */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5, ease: 'easeOut' }}
          className='border-t border-gray-200'
        >
          {character.character_birthday && (
            <div className='flex items-center justify-between py-3 border-b border-gray-100'>
              <span className='text-gray-500'>誕生日</span>
              <span className='text-gray-900'>{formatDate(character.character_birthday)}</span>
            </div>
          )}
          {character.store_birthday && (
            <div className='flex items-center justify-between py-3 border-b border-gray-100'>
              <span className='text-gray-500'>店舗開店日</span>
              <span className='text-gray-900'>{formatDate(character.store_birthday)}</span>
            </div>
          )}
          {character.address && (
            <div className='flex items-start justify-between py-3 border-b border-gray-100'>
              <span className='text-gray-500 shrink-0'>住所</span>
              <div className='text-gray-900 text-right ml-4'>
                {character.zipcode && <div>〒{character.zipcode}</div>}
                <div>{character.address}</div>
              </div>
            </div>
          )}
          {character.store_link && (
            <a
              href={character.store_link}
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center justify-between py-3 border-b border-gray-100'
            >
              <span className='text-gray-500'>店舗情報</span>
              <span className='text-pink-600'>ビックカメラ.com</span>
            </a>
          )}
        </motion.div>
      </div>
    </div>
  )
}

/**
 * ルートコンポーネント
 */
const RouteComponent = () => {
  const { id } = Route.useParams()
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CharacterDetailContent id={id} />
    </Suspense>
  )
}

export const Route = createFileRoute('/characters/$id')({
  component: RouteComponent
})
