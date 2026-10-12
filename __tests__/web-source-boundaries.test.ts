import { expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import ts from 'typescript'
import { buildClosedStoreKeys } from '../scripts/generate-bot-stores'

const root = resolve(import.meta.dirname, '..')
const web = resolve(root, 'workers/web/src')
const shared = resolve(root, 'packages/shared/src')
const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(file)
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [file] : []
  })
const dependencies = (file: string): string[] => {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const imports: string[] = []
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text)
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return imports
}
const resolveDependency = (file: string, dependency: string): string => {
  if (dependency.startsWith('@/')) return resolve(web, 'app', dependency.slice(2))
  if (dependency.startsWith('@api/')) return resolve(web, 'api', dependency.slice(5))
  return dependency.startsWith('.') ? resolve(dirname(file), dependency) : dependency
}

test('web source root contains only the UI, backend and Worker entrypoint', () => {
  expect(readdirSync(web).sort()).toEqual(['api', 'app', 'index.ts'])
  for (const legacySource of [
    'src',
    'package.json',
    'vite.config.ts',
    'wrangler.toml',
    'wrangler.json',
    'wrangler.jsonc'
  ]) {
    expect(existsSync(resolve(root, 'workers/app', legacySource)), legacySource).toBe(false)
  }
  expect(existsSync(resolve(web, 'server'))).toBe(false)
  const configuration = JSON.parse(readFileSync(resolve(root, 'tsconfig.json'), 'utf8'))
  expect(configuration.compilerOptions.paths).toEqual({
    '@/*': ['./workers/web/src/app/*'],
    '@api/*': ['./workers/web/src/api/*']
  })
})

test('shared contracts and calculations do not import web or platform implementations', () => {
  for (const file of sourceFiles(shared)) {
    const label = relative(root, file)
    for (const dependency of dependencies(file)) {
      expect(dependency, label).not.toMatch(
        /^(?:@\/|@api\/|react(?:\/|$)|jotai(?:\/|$)|intlayer(?:\/|$)|firebase(?:\/|$)|@prisma\/|virtual:)/
      )
      expect(resolveDependency(file, dependency), label).not.toStartWith(web)
    }
    expect(readFileSync(file, 'utf8'), label).not.toMatch(/import\.meta\.env|process\.env/)
  }
})

test('backend and UI depend on shared contracts instead of each other', () => {
  for (const [directory, forbidden] of [
    [resolve(web, 'api'), resolve(web, 'app')],
    [resolve(web, 'app'), resolve(web, 'api')]
  ]) {
    for (const file of sourceFiles(directory)) {
      for (const dependency of dependencies(file)) {
        expect(resolveDependency(file, dependency), relative(root, file)).not.toStartWith(forbidden)
      }
    }
  }
})

test('closed store data preserves the canonical character-store availability rule', () => {
  expect(
    buildClosedStoreKeys([
      { id: 'closed', character: { is_biccame_musume: true } },
      { id: 'null-store', character: { is_biccame_musume: true }, store: null },
      { id: 'open', character: { is_biccame_musume: true }, store: { name: 'Open' } },
      { id: 'mascot', character: { is_biccame_musume: false } }
    ])
  ).toEqual(['closed', 'null-store'])
  expect(() => buildClosedStoreKeys([{ id: '', character: { is_biccame_musume: true } }])).toThrow()
  const canonical = JSON.parse(readFileSync(resolve(root, 'workers/web/public/characters.json'), 'utf8'))
  const generated = JSON.parse(readFileSync(resolve(shared, 'generated/closed-store-keys.json'), 'utf8'))
  expect(generated).toEqual(buildClosedStoreKeys(canonical))
})
