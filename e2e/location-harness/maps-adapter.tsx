// Test-only Google Maps boundary: records arguments from the real route without loading Google.
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react'

type Position = google.maps.LatLngLiteral
type State = { center: Position | null; zoom: number | null; pans: number; zooms: number }
const Context = createContext<{
  state: State
  initialize: (center: Position, zoom: number) => void
  map: { panTo: (center: Position) => void; setZoom: (zoom: number) => void }
} | null>(null)
export const APIProvider = ({ children }: { apiKey: string; children: ReactNode }) => {
  const [state, setState] = useState<State>({ center: null, zoom: null, pans: 0, zooms: 0 })
  const map = useMemo(
    () => ({
      panTo: (center: Position) => setState((s) => ({ ...s, center, pans: s.pans + 1 })),
      setZoom: (zoom: number) => setState((s) => ({ ...s, zoom, zooms: s.zooms + 1 }))
    }),
    []
  )
  const initialize = useMemo(
    () => (center: Position, zoom: number) => setState((s) => (s.center ? s : { ...s, center, zoom })),
    []
  )
  return (
    <Context.Provider value={{ state, map, initialize }}>
      {children}
      <output data-testid='map-state'>{JSON.stringify(state)}</output>
    </Context.Provider>
  )
}
export const useMap = () => useContext(Context)?.map ?? null
const TestMap = ({
  children,
  defaultCenter,
  defaultZoom,
  onCenterChanged
}: {
  children?: ReactNode
  defaultCenter: Position
  defaultZoom: number
  onCenterChanged?: (event: { detail: { center: Position } }) => void
  mapId?: string
  gestureHandling?: string
  mapTypeControl?: boolean
  streetViewControl?: boolean
  fullscreenControl?: boolean
  minZoom?: number
  maxZoom?: number
}) => {
  const context = useContext(Context)
  const callback = useRef(onCenterChanged)
  callback.current = onCenterChanged
  useEffect(() => {
    context?.initialize(defaultCenter, defaultZoom)
  }, [context?.initialize, defaultCenter, defaultZoom])
  const center = context?.state.center
  useEffect(() => {
    if (center) callback.current?.({ detail: { center } })
  }, [center])
  return <div data-testid='map'>{children}</div>
}
export const AdvancedMarker = ({
  position,
  onClick,
  children
}: {
  position: Position
  onClick?: () => void
  children?: ReactNode
}) => (
  <button type='button' data-testid='marker' data-position={JSON.stringify(position)} onClick={onClick}>
    {children}
  </button>
)
export const Pin = (_props: { background?: string; borderColor?: string; glyphColor?: string }) => (
  <span>店舗マーカー</span>
)

export { TestMap as Map }
