import { existsSync, lstatSync, readlinkSync, symlinkSync } from 'node:fs'
import { relative, resolve } from 'node:path'

export const localEnvironmentFiles = (environment?: string): string[] => [
  '.dev.vars',
  '.env',
  '.env.local',
  ...(environment ? [`.dev.vars.${environment}`, `.env.${environment}`, `.env.${environment}.local`] : [])
]

// ローカル開発専用。内容は読まず、元ファイルへの相対リンクだけを作る。
export const linkLocalEnvironmentFiles = (root: string, app: string, environment?: string): void => {
  for (const name of localEnvironmentFiles(environment)) {
    const source = resolve(root, name)
    if (!existsSync(source)) continue
    const target = resolve(app, name)
    const existing = lstatSync(target, { throwIfNoEntry: false })
    if (existing) {
      if (existing.isSymbolicLink() && resolve(app, readlinkSync(target)) === source) continue
      throw new Error(`App local environment file already exists: ${name}; no file was overwritten`)
    }
    symlinkSync(relative(app, source), target)
  }
}
