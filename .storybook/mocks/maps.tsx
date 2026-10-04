import {
  type CSSProperties,
  createContext,
  type MutableRefObject,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'

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
type Position = { lat: number; lng: number }
type Bounds = { north: number; south: number; east: number; west: number }
type CameraEvent = { detail: { center: Position; zoom: number } }
type MapAdapter = {
  panTo: (position: unknown) => void
  setZoom: (zoom: number) => void
  moveCamera: (camera: { center: Position; zoom: number; heading?: number; tilt?: number }) => void
  panBy: (x: number, y: number) => void
  fitBounds: (bounds: Bounds, padding: unknown) => void
}
const MapContext = createContext<{ api: MapAdapter; delegate: MutableRefObject<MapAdapter | null> } | null>(null)
export const APIProvider = ({ children }: { children: ReactNode; apiKey: string }) => {
  const delegate = useRef<MapAdapter | null>(null)
  const [api] = useState<MapAdapter>(() => ({
    panTo: (p) => delegate.current?.panTo(p),
    setZoom: (zoom) => delegate.current?.setZoom(zoom),
    moveCamera: (camera) => delegate.current?.moveCamera(camera),
    panBy: (x, y) => delegate.current?.panBy(x, y),
    fitBounds: (bounds, padding) => delegate.current?.fitBounds(bounds, padding)
  }))
  const [context] = useState(() => ({ api, delegate }))
  return <MapContext.Provider value={context}>{children}</MapContext.Provider>
}
const MapCanvas = ({
  children,
  defaultCenter,
  defaultZoom,
  onCenterChanged,
  onZoomChanged
}: {
  children: ReactNode
  defaultCenter: { lat: number; lng: number }
  defaultZoom: number
  onCenterChanged?: (event: CameraEvent) => void
  onZoomChanged?: (event: CameraEvent) => void
  [key: string]: unknown
}) => {
  const context = useContext(MapContext)
  const [center, setCenter] = useState(defaultCenter)
  const [zoom, setZoom] = useState(defaultZoom)
  const camera = useRef({ center, zoom })
  camera.current = { center, zoom }
  const adapter = useRef<MapAdapter | null>(null)
  if (!adapter.current)
    adapter.current = {
      panTo: (p) => setCenter(readPosition(p)),
      setZoom,
      moveCamera: (next) => {
        camera.current = { center: readPosition(next.center), zoom: next.zoom }
        setCenter(camera.current.center)
        setZoom(next.zoom)
      },
      panBy: (x, y) => {
        const current = camera.current
        const scale = 360 / (256 * 2 ** current.zoom)
        setCenter((p) => ({ lat: p.lat - y * scale, lng: p.lng + x * scale }))
      },
      fitBounds: (bounds) => {
        setCenter({ lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 })
        const span = Math.max(bounds.north - bounds.south, bounds.east - bounds.west, 0.001)
        setZoom(Math.max(0, Math.min(18, Math.floor(Math.log2(360 / span)) - 1)))
      }
    }
  useEffect(() => {
    if (!context) throw new Error('Synthetic Map requires APIProvider')
    context.delegate.current = adapter.current
    return () => {
      context.delegate.current = null
    }
  }, [context])
  const callbacks = useRef({ onCenterChanged, onZoomChanged })
  callbacks.current = { onCenterChanged, onZoomChanged }
  useEffect(() => {
    callbacks.current.onCenterChanged?.({ detail: { center, zoom: camera.current.zoom } })
  }, [center])
  useEffect(() => {
    callbacks.current.onZoomChanged?.({ detail: { center: camera.current.center, zoom } })
  }, [zoom])
  return (
    <>
      <section
        data-testid='maps-adapter'
        className='min-h-[480px] w-full bg-muted relative p-6'
        aria-label='Storybook地図境界アダプター'
      >
        <p className='text-sm'>
          地図サービスへの通信はありません。中心 {center.lat.toFixed(3)}, {center.lng.toFixed(3)} / ズーム {zoom}
        </p>
        <div className='absolute inset-0 flex flex-wrap items-center justify-center gap-4 pointer-events-none'>
          {children}
        </div>
      </section>
    </>
  )
}
export const AdvancedMarker = ({
  children,
  position,
  title,
  onClick
}: {
  children: ReactNode
  position: { lat: number; lng: number }
  title?: string
  onClick: () => void
}) => (
  <button
    type='button'
    className='rounded-full bg-card p-3 border border-card-border pointer-events-auto'
    onClick={onClick}
    aria-label={title ?? `店舗マーカー ${position.lat.toFixed(3)}`}
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
export const useMap = () => useContext(MapContext)?.api ?? null

export { MapCanvas as Map }
