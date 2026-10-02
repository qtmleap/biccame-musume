// Test-only Google Maps boundary: records arguments from the real route without loading Google.
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react'

type Position = google.maps.LatLngLiteral
type Geometry = {
  bounds: google.maps.LatLngBoundsLiteral | null
  padding: google.maps.Padding
  offset: { x: number; y: number }
  fits: number
}
type State = { center: Position | null; zoom: number | null; pans: number; zooms: number }
const Context = createContext<{
  state: State
  geometry: Geometry
  initialize: (center: Position, zoom: number) => void
  map: {
    panTo: (center: Position) => void
    setZoom: (zoom: number) => void
    moveCamera: (camera: { center: Position; zoom: number }) => void
    panBy: (x: number, y: number) => void
    fitBounds: (bounds: google.maps.LatLngBoundsLiteral, padding: google.maps.Padding) => void
  }
} | null>(null)
export const APIProvider = ({ children }: { apiKey: string; children: ReactNode }) => {
  const [state, setState] = useState<State>({ center: null, zoom: null, pans: 0, zooms: 0 })
  const [geometry, setGeometry] = useState<Geometry>({
    bounds: null,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
    offset: { x: 0, y: 0 },
    fits: 0
  })
  const map = useMemo(
    () => ({
      panTo: (center: Position) => setState((s) => ({ ...s, center, pans: s.pans + 1 })),
      setZoom: (zoom: number) => setState((s) => ({ ...s, zoom, zooms: s.zooms + 1 })),
      moveCamera: ({ center, zoom }: { center: Position; zoom: number }) => {
        setState((s) => ({ ...s, center, zoom, pans: s.pans + 1, zooms: s.zooms + 1 }))
        setGeometry((g) => ({ ...g, offset: { x: 0, y: 0 } }))
      },
      panBy: (x: number, y: number) => setGeometry((g) => ({ ...g, offset: { x: g.offset.x + x, y: g.offset.y + y } })),
      fitBounds: (bounds: google.maps.LatLngBoundsLiteral, padding: google.maps.Padding) => {
        const element = document.querySelector('[data-testid=map]')
        const size = element?.getBoundingClientRect()
        const width = size ? size.width : 800
        const height = size ? size.height : 800
        const left = padding.left === undefined ? 0 : padding.left
        const right = padding.right === undefined ? 0 : padding.right
        const top = padding.top === undefined ? 0 : padding.top
        const bottom = padding.bottom === undefined ? 0 : padding.bottom
        const spanX = Math.max(0.000001, (bounds.east - bounds.west) / 360)
        const north = project({ lat: bounds.north, lng: 0 }).y
        const south = project({ lat: bounds.south, lng: 0 }).y
        const spanY = Math.max(0.000001, south - north)
        const zoom = Math.min(
          18,
          Math.max(
            0,
            Math.floor(
              Math.log2(Math.min((width - left - right) / (256 * spanX), (height - top - bottom) / (256 * spanY)))
            )
          )
        )
        setState((s) => ({
          ...s,
          center: { lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 },
          zoom
        }))
        setGeometry((g) => ({
          bounds,
          padding,
          offset: { x: (right - left) / 2, y: (bottom - top) / 2 },
          fits: g.fits + 1
        }))
      }
    }),
    []
  )
  const initialize = useMemo(
    () => (center: Position, zoom: number) => setState((s) => (s.center ? s : { ...s, center, zoom })),
    []
  )
  return (
    <Context.Provider value={{ state, geometry, map, initialize }}>
      {children}
      <output hidden data-testid='map-geometry'>
        {JSON.stringify(geometry)}
      </output>
      <output hidden data-testid='map-state'>
        {JSON.stringify(state)}
      </output>
    </Context.Provider>
  )
}
export const useMap = () => useContext(Context)?.map ?? null
const TestMap = ({
  children,
  defaultCenter,
  defaultZoom,
  onCenterChanged,
  onZoomChanged
}: {
  children?: ReactNode
  defaultCenter: Position
  defaultZoom: number
  onZoomChanged?: (event: { detail: { zoom: number } }) => void
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
  const zoomCallback = useRef(onZoomChanged)
  zoomCallback.current = onZoomChanged
  const zoom = context?.state.zoom
  useEffect(() => {
    if (zoom !== null && zoom !== undefined) zoomCallback.current?.({ detail: { zoom } })
  }, [zoom])
  const callback = useRef(onCenterChanged)
  callback.current = onCenterChanged
  useEffect(() => {
    context?.initialize(defaultCenter, defaultZoom)
  }, [context?.initialize, defaultCenter, defaultZoom])
  const center = context?.state.center
  useEffect(() => {
    if (center) callback.current?.({ detail: { center } })
  }, [center])
  return (
    <div data-testid='map' style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'var(--muted)' }}>
      {children}
    </div>
  )
}
export const AdvancedMarker = ({
  position,
  onClick,
  children,
  title
}: {
  title?: string
  position: Position
  onClick?: () => void
  children?: ReactNode
}) => {
  const context = useContext(Context)
  const center = context?.state.center
  const zoom = context?.state.zoom
  const scale = 256 * 2 ** (zoom === null || zoom === undefined ? 5 : zoom)
  const point = project(position)
  const origin = project(center ? center : { lat: 35.6812, lng: 139.7671 })
  const offset = context?.geometry.offset
  return (
    <button
      type='button'
      title={title}
      aria-label={title}
      data-testid='marker'
      data-position={JSON.stringify(position)}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `calc(50% + ${(point.x - origin.x) * scale - (offset ? offset.x : 0)}px)`,
        top: `calc(50% + ${(point.y - origin.y) * scale - (offset ? offset.y : 0)}px)`,
        transform: 'translate(-50%, -100%)'
      }}
    >
      {children}
    </button>
  )
}
const project = ({ lat, lng }: Position) => {
  const sin = Math.sin((Math.min(85.05112878, Math.max(-85.05112878, lat)) * Math.PI) / 180)
  return { x: (lng + 180) / 360, y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI) }
}

// Compact visual approximation only; real Google PinElement rendering is outside this boundary harness.
export const Pin = ({
  background,
  borderColor,
  glyphColor
}: {
  background?: string
  borderColor?: string
  glyphColor?: string
}) => (
  <svg aria-hidden='true' width='28' height='36' viewBox='0 0 28 36'>
    <path d='M14 35 C12 30 1 21 1 14 A13 13 0 1 1 27 14 C27 21 16 30 14 35Z' fill={background} stroke={borderColor} />
    <circle cx='14' cy='14' r='5' fill={glyphColor} />
  </svg>
)

export { TestMap as Map }
