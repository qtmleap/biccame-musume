import { Calendar, Clock, MapPin, Phone, Store, Train } from 'lucide-react'
import { CHARACTER_DETAIL_LABELS } from '@/locales/app.content'
import { formatDate } from '@/utils/calendar'

type InfoItemProps = {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}

export const InfoItem = ({ icon: Icon, label, children }: InfoItemProps) => {
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

export const StoreName = ({ name, storeId }: { name?: string; storeId?: number }) => {
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

export const StoreAddress = ({ address, postalCode }: { address?: string; postalCode?: string | null }) => {
  if (!address) return null
  return (
    <InfoItem icon={MapPin} label={CHARACTER_DETAIL_LABELS.address}>
      {postalCode && <p className='text-sm text-gray-900'>〒{postalCode}</p>}
      <p className='text-sm text-gray-900'>{address}</p>
    </InfoItem>
  )
}

export const StorePhone = ({ phone }: { phone?: string }) => {
  if (!phone) return null
  return (
    <InfoItem icon={Phone} label={CHARACTER_DETAIL_LABELS.phone}>
      <a href={`tel:${phone}`} className='text-sm text-pink-600 hover:underline'>
        {phone}
      </a>
    </InfoItem>
  )
}

export const StoreHours = ({
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

export const StoreAccess = ({
  access
}: {
  access: Array<{ station: string; description?: string; lines?: string[] }>
}) => {
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

export const StoreBirthday = ({ birthday }: { birthday?: string }) => {
  if (!birthday) return null
  return (
    <InfoItem icon={Calendar} label={CHARACTER_DETAIL_LABELS.openDate}>
      <p className='text-sm text-gray-900'>{formatDate(birthday)}</p>
    </InfoItem>
  )
}
