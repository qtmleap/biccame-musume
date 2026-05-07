import { MapPinCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { useUserActivity } from '@/hooks/use-user-activity'
import { DURATION, FADE_IN } from '@/lib/motion'
import type { StoreData } from '@/schemas/store.dto'
import { StoreAccess, StoreAddress, StoreBirthday, StoreHours, StoreName, StorePhone } from './store-info-items'

type StoreInfoSectionProps = {
  character: StoreData
}

export const StoreInfoSection = ({ character }: StoreInfoSectionProps) => {
  const { isVisited } = useUserActivity()
  const visited = isVisited(character.id)

  if (!character.store) {
    return null
  }

  return (
    <motion.div
      key={`store-${character.id}`}
      variants={FADE_IN}
      initial='initial'
      animate='animate'
      transition={{ duration: DURATION.normal, delay: 0.4 }}
      className='space-y-3'
    >
      <div className='flex items-center gap-2'>
        <h2 className='text-xl font-bold text-foreground'>店舗情報</h2>
        {visited && (
          <Badge className='bg-brand/10 text-brand hover:bg-brand/10 border-transparent gap-1'>
            <MapPinCheck className='h-3 w-3' />
            訪問済み
          </Badge>
        )}
      </div>
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
