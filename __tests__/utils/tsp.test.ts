import { expect, test } from 'bun:test'
import * as tsp from '@/utils/tsp'

test('great_circle_distance_uses_longitude_scale', () => {
  const result = tsp.solveTsp([
    { lat: 35, lng: 135 },
    { lat: 35, lng: 136 }
  ])
  expect(result.totalDistance).toBeCloseTo(91.085, 2)
  expect(tsp.calcGreatCircleKm({ lat: 35, lng: 135 }, { lat: 35, lng: 136 })).toBeCloseTo(91.085, 2)
})
test('distance_is_km_and_open_path_without_return_leg', () => {
  expect(
    tsp.solveTsp([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 }
    ]).totalDistance
  ).toBeCloseTo(222.39, 2)
  expect(tsp.solveTsp([]).totalDistance).toBe(0)
  expect(tsp.solveTsp([{ lat: 35, lng: 135 }]).totalDistance).toBe(0)
})
