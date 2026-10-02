import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
export const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : /\.(tsx?|jsx?)$/.test(entry.name)
        ? [join(dir, entry.name)]
        : []
  )
export const inventory = () =>
  [...sourceFiles('src/components'), ...sourceFiles('src/app/routes')].map((file) => {
    const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const localKinds = new Map<string, string>()
    const exports = new Set<string>()
    for (const statement of ast.statements) {
      const isExported =
        ts.canHaveModifiers(statement) &&
        ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      if (ts.isVariableStatement(statement))
        for (const d of statement.declarationList.declarations)
          if (ts.isIdentifier(d.name)) {
            localKinds.set(d.name.text, 'value')
            if (isExported) exports.add(d.name.text)
          }
      if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isInterfaceDeclaration(statement) ||
          ts.isTypeAliasDeclaration(statement)) &&
        statement.name
      ) {
        localKinds.set(
          statement.name.text,
          ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) ? 'type' : 'value'
        )
        if (isExported) exports.add(statement.name.text)
      }
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause))
        for (const e of statement.exportClause.elements) {
          localKinds.set(
            e.name.text,
            e.isTypeOnly || statement.isTypeOnly
              ? 'type'
              : (localKinds.get(e.propertyName?.text ?? e.name.text) ?? 'value')
          )
          exports.add(e.name.text)
        }
    }
    return {
      file,
      exports: [...exports].map((name) => ({
        name,
        kind:
          file.startsWith('src/app/routes/') && name === 'Route'
            ? 'route'
            : localKinds.get(name) === 'type'
              ? 'type'
              : /^[A-Z][a-z]/.test(name)
                ? 'component'
                : 'support'
      }))
    }
  })
