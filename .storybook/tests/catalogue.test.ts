import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import coverage from '../catalogue/coverage.json'
import { inventory, sourceFiles } from '../catalogue/inventory'

test('every production route/component export has a catalogued meaningful story; support exports are classified', () => {
  const expected = inventory().flatMap(({ file, exports }) => exports.map(({ name, kind }) => ({ file, name, kind })))
  expect(coverage.entries.map(({ file, name, kind }) => ({ file, name, kind }))).toEqual(expected)
  for (const entry of coverage.entries) {
    if (entry.kind === 'component' || entry.kind === 'route')
      expect(entry.storyIds.length, `${entry.file}#${entry.name}`).toBeGreaterThan(0)
    else expect(entry.reason.length, `${entry.file}#${entry.name}`).toBeGreaterThan(0)
  }
})

test('source traversal preserves every real source file in stable order across opposite creation orders', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'storybook-inventory-order-'))
  try {
    const files = [...sourceFiles('src/components'), ...sourceFiles('src/app/routes')]
    const forward = join(temporary, 'forward')
    const reverse = join(temporary, 'reverse')
    for (const [root, ordered] of [
      [forward, files],
      [reverse, [...files].reverse()]
    ] as const)
      for (const file of ordered) {
        const target = join(root, file)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, readFileSync(file))
      }
    const copiedFiles = (root: string) =>
      [...sourceFiles(join(root, 'src/components')), ...sourceFiles(join(root, 'src/app/routes'))].map((file) =>
        relative(root, file)
      )
    const first = copiedFiles(forward)
    const second = copiedFiles(reverse)
    expect([...first].sort()).toEqual([...files].sort())
    expect([...second].sort()).toEqual([...files].sort())
    for (const file of files) {
      expect(readFileSync(join(forward, file))).toEqual(readFileSync(file))
      expect(readFileSync(join(reverse, file))).toEqual(readFileSync(file))
    }
    expect(first).toEqual(second)
    expect(first).toEqual(files)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
