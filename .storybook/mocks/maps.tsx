import { type CSSProperties, createContext, type ReactNode, useContext, useState } from 'react'

const readPosition = (value: unknown): { lat: number; lng: number } => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('lat' in value) ||
    !('lng' in value) ||
    typeof value.lat !== 'number' ||
    typeof value.lng !== 'number'
  )
    throw new Error('Invalid synthetic map position')
  return { lat: value.lat, lng: value.lng }
}
const MapContext = createContext({ panTo: (_position: unknown) => {}, setZoom: (_zoom: number) => {} })
export const APIProvider = ({ children }: { children: ReactNode; apiKey: string }) => <>{children}</>
const MapCanvas = ({
  children,
  defaultCenter,
  defaultZoom
}: {
  children: ReactNode
  defaultCenter: { lat: number; lng: number }
  defaultZoom: number
  [key: string]: unknown
}) => {
  const [center, setCenter] = useState(defaultCenter)
  const [zoom, setZoom] = useState(defaultZoom)
  return (
    <MapContext.Provider value={{ panTo: (p) => setCenter(readPosition(p)), setZoom }}>
      <section
        data-testid='maps-adapter'
        className='min-h-[480px] w-full bg-muted relative p-6'
        aria-label='Storybook地図境界アダプター'
      >
        <p className='text-sm'>
          地図サービスへの通信はありません。中心 {center.lat.toFixed(3)}, {center.lng.toFixed(3)} / ズーム {zoom}
        </p>
        <div className='flex flex-wrap gap-4 mt-6'>{children}</div>
      </section>
    </MapContext.Provider>
  )
}
export const AdvancedMarker = ({
  children,
  position,
  onClick
}: {
  children: ReactNode
  position: { lat: number; lng: number }
  onClick: () => void
}) => (
  <button
    type='button'
    className='rounded-full bg-card p-3 border border-card-border'
    onClick={onClick}
    aria-label={`店舗マーカー ${position.lat.toFixed(3)}`}
  >
    {children}
  </button>
)
export const Pin = ({
  background,
  borderColor,
  glyphColor
}: {
  background: string
  borderColor: string
  glyphColor: string
}) => (
  <span
    aria-hidden
    style={
      {
        background,
        border: `2px solid ${borderColor}`,
        color: glyphColor,
        display: 'inline-block',
        borderRadius: '50%',
        padding: 8
      } satisfies CSSProperties
    }
  >
    ●
  </span>
)
export const useMap = () => useContext(MapContext)

export { MapCanvas as Map }
