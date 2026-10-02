import { describe, expect, test } from 'bun:test'
import type { StoreData } from '@/schemas/store.dto'
import { clusterStores, getStoreBounds } from '@/utils/map-layout'

const store = (id: string, latitude: number, longitude: number): StoreData => ({
  id,
  character: { name: id, description: id, images: ['fixture'], image_url: '' },
  prefecture: null,
  region: undefined,
  coordinates: { latitude, longitude }
})
describe('store map geometry', () => {
  test('nearby stores cluster and distant cities stay separate', () => {
    const groups = clusterStores(
      [
        store('a', 35.68, 139.76),
        store('b', 35.6801, 139.7601),
        store('osaka', 34.7, 135.5),
        store('sapporo', 43.06, 141.35)
      ],
      5
    )
    expect(groups.map((g) => g.stores.map((s) => s.id))).toEqual([['a', 'b'], ['osaka'], ['sapporo']])
  })
  test('high zoom exposes individual stores including coincident positions without displacement', () => {
    const stores = [store('a', 35, 139), store('b', 35, 139)]
    expect(clusterStores(stores, 15).map((g) => g.stores.length)).toEqual([2])
    expect(clusterStores(stores, 16).map((g) => ({ ids: g.stores.map((s) => s.id), position: g.position }))).toEqual([
      { ids: ['a'], position: { lat: 35, lng: 139 } },
      { ids: ['b'], position: { lat: 35, lng: 139 } }
    ])
  })
  test('rejects invalid coordinates while extreme valid positions project finitely', () => {
    const stores = [
      store('south', -90, 180),
      store('north', 90, -180),
      store('zero', 0, 0),
      store('nan', NaN, 0),
      store('inf', 0, Infinity),
      store('bad', 91, 0)
    ]
    expect(clusterStores(stores, 5).flatMap((g) => g.stores.map((s) => s.id))).toEqual(['south', 'north', 'zero'])
    expect(
      clusterStores(stores, 5).every((g) => Number.isFinite(g.position.lat) && Number.isFinite(g.position.lng))
    ).toBe(true)
    expect(getStoreBounds(stores)).toEqual({ south: -90, north: 90, west: -180, east: 180 })
  })
  test('all and selected region bounds include only that geographic selection', () => {
    const tokyo = [store('a', 35.68, 139.76), store('b', 35.69, 139.77)]
    expect(getStoreBounds(tokyo)).toEqual({ south: 35.68, north: 35.69, west: 139.76, east: 139.77 })
    expect(getStoreBounds([...tokyo, store('osaka', 34.7, 135.5)])).toEqual({
      south: 34.7,
      north: 35.69,
      west: 135.5,
      east: 139.77
    })
    expect(getStoreBounds([store('missing', NaN, 0)])).toBeNull()
  })
})
