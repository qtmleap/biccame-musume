import { expect, test } from 'bun:test'
import coverage from '../catalogue/coverage.json'
import { inventory } from '../catalogue/inventory'

test('every production route/component export has a catalogued meaningful story; support exports are classified', () => {
  const expected = inventory().flatMap(({ file, exports }) => exports.map(({ name, kind }) => ({ file, name, kind })))
  expect(coverage.entries.map(({ file, name, kind }) => ({ file, name, kind }))).toEqual(expected)
  for (const entry of coverage.entries) {
    if (entry.kind === 'component' || entry.kind === 'route')
      expect(entry.storyIds.length, `${entry.file}#${entry.name}`).toBeGreaterThan(0)
    else expect(entry.reason.length, `${entry.file}#${entry.name}`).toBeGreaterThan(0)
  }
})
