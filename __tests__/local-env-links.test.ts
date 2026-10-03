import { expect, test } from 'bun:test'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { relative, resolve } from 'node:path'
import { linkLocalEnvironmentFiles, localEnvironmentFiles } from '../workers/app/local-env'

const fixture = () => {
  const root = mkdtempSync(resolve(tmpdir(), 'biccame-local-env-links-'))
  const app = resolve(root, 'workers/app')
  mkdirSync(app, { recursive: true })
  return { root, app }
}

test('local environment links use existing root files without copying contents and are idempotent', () => {
  const { root, app } = fixture()
  try {
    const files = localEnvironmentFiles('staging')
    for (const name of files) writeFileSync(resolve(root, name), 'fixture-only')
    linkLocalEnvironmentFiles(root, app, 'staging')
    const inodes = files.map((name) => {
      const target = resolve(app, name)
      expect(lstatSync(target).isSymbolicLink()).toBe(true)
      expect(readlinkSync(target)).toBe(relative(app, resolve(root, name)))
      return lstatSync(target).ino
    })
    linkLocalEnvironmentFiles(root, app, 'staging')
    expect(files.map((name) => lstatSync(resolve(app, name)).ino)).toEqual(inodes)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('local environment links do not create missing files or overwrite existing app files', () => {
  const { root, app } = fixture()
  try {
    const name = localEnvironmentFiles()[0]
    if (!name) throw new Error('Missing local environment filename')
    linkLocalEnvironmentFiles(root, app)
    expect(existsSync(resolve(app, name))).toBe(false)
    writeFileSync(resolve(root, name), 'root-fixture')
    writeFileSync(resolve(app, name), 'app-fixture')
    expect(() => linkLocalEnvironmentFiles(root, app)).toThrow('no file was overwritten')
    expect(readFileSync(resolve(app, name), 'utf8')).toBe('app-fixture')
    expect(lstatSync(resolve(app, name)).isSymbolicLink()).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('local environment links refuse to overwrite a dangling symlink', () => {
  const { root, app } = fixture()
  try {
    const name = localEnvironmentFiles()[0]
    if (!name) throw new Error('Missing local environment filename')
    writeFileSync(resolve(root, name), 'root-fixture')
    symlinkSync('missing-fixture', resolve(app, name))
    expect(() => linkLocalEnvironmentFiles(root, app)).toThrow('no file was overwritten')
    expect(readlinkSync(resolve(app, name))).toBe('missing-fixture')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
