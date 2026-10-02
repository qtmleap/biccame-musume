import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { inventory } from './inventory'

const root = process.argv[2] ?? '.storybook/.artifacts/build'
const built = JSON.parse(readFileSync(`${root}/index.json`, 'utf8')) as {
  entries: Record<string, { id: string; type: string }>
}
const coverage = JSON.parse(readFileSync('.storybook/catalogue/coverage.json', 'utf8')) as {
  entries: { file: string; name: string; kind: string; storyIds: string[]; reason: string }[]
}
assert.deepEqual(
  coverage.entries.map(({ file, name, kind }) => ({ file, name, kind })),
  inventory().flatMap(({ file, exports }) => exports.map(({ name, kind }) => ({ file, name, kind })))
)
const ids = new Set(
  Object.values(built.entries)
    .filter((entry) => entry.type === 'story')
    .map((entry) => entry.id)
)
for (const entry of coverage.entries) {
  if (entry.kind === 'component' || entry.kind === 'route')
    assert(entry.storyIds.length, `missing render mapping: ${entry.file}#${entry.name}`)
  for (const id of entry.storyIds) assert(ids.has(id), `built story missing: ${entry.file}#${entry.name} -> ${id}`)
}
writeFileSync('.storybook/catalogue/story-index.json', JSON.stringify(built, null, 2) + '\n')
console.log(`Verified ${coverage.entries.length} source exports against ${ids.size} built stories`)
