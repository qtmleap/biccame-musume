type Point = { lat: number; lng: number }

/**
 * 2点間のユークリッド距離を計算
 */
const calcDistance = (p1: Point, p2: Point): number => {
  const dx = p2.lat - p1.lat
  const dy = p2.lng - p1.lng
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * 距離行列を生成
 */
const buildDistanceMatrix = (points: Point[]): number[][] => {
  const n = points.length
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : calcDistance(points[i], points[j])))
  )
}

/**
 * 未訪問ノードから最も近いノードを見つける
 */
const findNearest = (distMatrix: number[][], current: number, visited: Set<number>): number => {
  const distances = distMatrix[current]
  return distances.reduce((nearest, dist, i) => (!visited.has(i) && dist < nearest.dist ? { idx: i, dist } : nearest), {
    idx: -1,
    dist: Infinity
  }).idx
}

/**
 * Nearest Neighbor法で初期解を生成（再帰版）
 */
const nearestNeighbor = (distMatrix: number[][], start = 0): number[] => {
  const n = distMatrix.length

  const buildRoute = (route: number[], visited: Set<number>): number[] => {
    if (route.length === n) return route
    const last = route[route.length - 1]
    const nearest = findNearest(distMatrix, last, visited)
    return buildRoute([...route, nearest], new Set([...visited, nearest]))
  }

  return buildRoute([start], new Set([start]))
}

/**
 * ルートの総距離を計算
 */
const calcTotalDistance = (route: number[], distMatrix: number[][]): number =>
  route.slice(0, -1).reduce((total, curr, i) => total + distMatrix[curr][route[i + 1]], 0)

/**
 * 2-optで1回の改善を試みる
 */
const tryTwoOptSwap = (route: number[], distMatrix: number[][]): { route: number[]; improved: boolean } => {
  const n = route.length

  for (const i of Array.from({ length: n - 2 }, (_, k) => k)) {
    for (const j of Array.from({ length: n - i - 2 }, (_, k) => k + i + 2)) {
      const d1 = distMatrix[route[i]][route[i + 1]]
      const d2 = distMatrix[route[j]][route[(j + 1) % n]]
      const d3 = distMatrix[route[i]][route[j]]
      const d4 = distMatrix[route[i + 1]][route[(j + 1) % n]]

      if (d3 + d4 < d1 + d2) {
        // i+1 から j までを逆順にする
        const newRoute = [...route.slice(0, i + 1), ...route.slice(i + 1, j + 1).reverse(), ...route.slice(j + 1)]
        return { route: newRoute, improved: true }
      }
    }
  }

  return { route, improved: false }
}

/**
 * 2-opt法でルートを改善（再帰版）
 */
const twoOpt = (route: number[], distMatrix: number[][]): number[] => {
  const result = tryTwoOptSwap(route, distMatrix)
  return result.improved ? twoOpt(result.route, distMatrix) : result.route
}

/**
 * TSPを解く（Nearest Neighbor + 2-opt）
 * @param points - 座標を持つオブジェクトの配列
 * @param startIndex - 開始地点のインデックス（省略時は0）
 * @returns 最適化されたルートと総距離
 */
export const solveTsp = <T extends Point>(points: T[], startIndex = 0): { route: T[]; totalDistance: number } => {
  if (points.length <= 1) {
    return { route: points, totalDistance: 0 }
  }

  const distMatrix = buildDistanceMatrix(points)
  const initialRoute = nearestNeighbor(distMatrix, startIndex)
  const optimizedRoute = twoOpt(initialRoute, distMatrix)
  const totalDistance = calcTotalDistance(optimizedRoute, distMatrix)

  return {
    route: optimizedRoute.map((i) => points[i]),
    totalDistance
  }
}
