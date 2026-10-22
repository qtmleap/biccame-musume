import type { BenchmarkProvenance } from './benchmark-provenance'
import type { BenchmarkCase } from './benchmark-schema'

// 旧manifestにない選定記録は不明のままにし、現在のコーパスで補完しない。
export const frozenBenchmarkSelection = (cases: BenchmarkCase[], seed: string, provenance?: BenchmarkProvenance) => ({
  cases,
  seed,
  available: provenance === undefined ? null : provenance.availableIndependentHoldout,
  excluded: provenance === undefined ? null : provenance.excluded,
  distribution: {
    positive: cases.filter((sample) => sample.expected.isEvent).length,
    negative: cases.filter((sample) => !sample.expected.isEvent).length
  }
})
