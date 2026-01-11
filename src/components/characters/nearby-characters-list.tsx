import { Link } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useCharacters } from '@/hooks/useCharacters'
import type { StoreData } from '@/schemas/store.dto'
import { getDisplayName } from '@/utils/character'

type NearbyCharactersListProps = {
  currentCharacter: StoreData
}

/**
 * 近くのビッカメ娘リスト
 */
export const NearbyCharactersList = ({ currentCharacter }: NearbyCharactersListProps) => {
  const { data: characters } = useCharacters()

  // 2点間の距離を計算（Haversine formula）
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371 // 地球の半径（km）
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // 現在のキャラクターの座標を取得
  const currentCoords = currentCharacter.coordinates
  if (!currentCoords?.latitude || !currentCoords?.longitude) {
    return null
  }

  // 距離でソートして近い順に10件取得（現在のキャラクターを除く）
  const nearbyCharacters = characters
    .filter((char) => {
      if (char.id === currentCharacter.id) return false
      if (!char.coordinates?.latitude || !char.coordinates?.longitude) return false
      return true
    })
    .map((char) => ({
      ...char,
      distance: calculateDistance(
        currentCoords.latitude,
        currentCoords.longitude,
        char.coordinates?.latitude || 0,
        char.coordinates?.longitude || 0
      )
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10)

  if (nearbyCharacters.length === 0) {
    return null
  }

  return (
    <div className='bg-pink-50 rounded-lg'>
      <h2 className='text-lg font-bold text-gray-900 mb-4'>近くのビッカメ娘</h2>
      <div className='flex flex-col gap-4'>
        {nearbyCharacters.map((char) => (
          <div key={char.id} className='flex items-start gap-3'>
            <Link to='/characters/$id' params={{ id: char.id }}>
              <Avatar className='h-14 w-14 border-2 border-gray-200'>
                <AvatarImage
                  src={char.character?.image_url}
                  alt={char.character?.name || ''}
                  className='object-cover scale-125'
                />
                <AvatarFallback className='text-sm bg-pink-100 text-pink-700'>
                  {char.character?.name?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
            </Link>
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-1'>
                <Link
                  to='/characters/$id'
                  params={{ id: char.id }}
                  className='font-bold text-base text-gray-900 hover:underline truncate'
                >
                  {getDisplayName(char.character?.name || '')}
                </Link>
              </div>
              <div className='flex items-center gap-1'>
                <MapPin className='h-4 w-4 text-gray-400' />
                <span className='text-sm text-gray-500'>{char.distance.toFixed(1)}km</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
