import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { storyNameFromExport, toId } from 'storybook/internal/csf'
import ts from 'typescript'
import { inventory, sourceFiles } from './inventory'

const stories = sourceFiles('workers/app/src/stories').filter((file) => file.endsWith('.stories.tsx'))
const mapping = new Map<string, string[]>()
for (const file of stories) {
  const source = readFileSync(file, 'utf8')
  const title = /title:\s*['"]([^'"]+)/.exec(source)?.[1]
  if (!title) throw new Error(`Missing stable story title: ${file}`)
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
      continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const refs: string[] = []
      const walk = (node: ts.Node) => {
        if (
          ts.isPropertyAssignment(node) &&
          node.name.getText(ast) === 'sources' &&
          ts.isArrayLiteralExpression(node.initializer)
        )
          for (const item of node.initializer.elements) if (ts.isStringLiteral(item)) refs.push(item.text)
        ts.forEachChild(node, walk)
      }
      walk(declaration.initializer)
      const id = toId(title, storyNameFromExport(declaration.name.text))
      for (const ref of refs) mapping.set(ref, [...(mapping.get(ref) ?? []), id])
    }
  }
}
const entries = inventory().flatMap(({ file, exports }) =>
  exports.map(({ name, kind }) => {
    let ids = mapping.get(`${file}#${name}`) ?? []
    let reason =
      kind === 'type'
        ? 'Type-only contract, not a React renderable.'
        : kind === 'support'
          ? 'Noncomponent utility/hook/constant; exercised by the relevant production consumer.'
          : ''
    if (kind === 'component' && file.endsWith('/index.ts')) {
      const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
      for (const node of ast.statements)
        if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          node.exportClause &&
          ts.isNamedExports(node.exportClause)
        )
          for (const e of node.exportClause.elements)
            if (e.name.text === name) {
              const target = join(dirname(file), node.moduleSpecifier.text) + '.tsx'
              ids = mapping.get(`${target}#${e.propertyName?.text ?? name}`) ?? []
              reason = `Barrel re-export; same actual component as ${target}.`
            }
    }
    return { file, name, kind, storyIds: ids, reason }
  })
)
writeFileSync('.storybook/catalogue/coverage.json', JSON.stringify({ entries }, null, 2) + '\n')
console.log(
  `Catalogued ${entries.length} source exports; missing renderables:`,
  entries.filter((e) => (e.kind === 'component' || e.kind === 'route') && !e.storyIds.length)
)
