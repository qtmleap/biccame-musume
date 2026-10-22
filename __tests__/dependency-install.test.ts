import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const installer = readFileSync(new URL('../scripts/dependencies.sh', import.meta.url), 'utf8')

const runFixture = (token: string, ghSucceeds = true, conflict = false, installFails = false) => {
  const root = mkdtempSync(join(tmpdir(), 'dependency-install-test-'))
  try {
    for (const directory of ['scripts', 'bin', 'packages', 'workers']) {
      mkdirSync(join(root, directory))
    }
    writeFileSync(join(root, 'scripts/dependencies.sh'), installer)
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n')
    writeFileSync(join(root, 'bun.lock'), '{}\n')
    writeFileSync(join(root, 'bunfig.toml'), 'telemetry = false\n')
    writeFileSync(
      join(root, '.npmrc'),
      `@qtmleap:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=\${GITHUB_TOKEN}\n`
    )
    writeFileSync(
      join(root, 'bin/gh'),
      ghSucceeds ? '#!/bin/bash\nprintf "%s" "fixture-credential"\n' : '#!/bin/bash\nexit 1\n',
      { mode: 0o755 }
    )
    writeFileSync(
      join(root, 'bin/bun'),
      `#!/bin/bash
set -euo pipefail
[[ "$GITHUB_TOKEN" == "fixture-credential" ]]
[[ "$1" == "--no-env-file" && "$2" == "install" ]]
[[ " $* " == *" --ignore-scripts "* && " $* " == *" --linker hoisted "* ]]
[[ "$*" != *"fixture-credential"* ]]
[[ -L "$PWD/packages" && -L "$PWD/workers" && -L "$PWD/node_modules" ]]
[[ "$(readlink "$PWD/packages")" == "$DEPENDENCY_TEST_ROOT/packages" ]]
printf '%s' "$PWD" > "$DEPENDENCY_TEST_ROOT/probe"
if [[ "$DEPENDENCY_TEST_FAIL" == "true" ]]; then
  exit 42
fi
if [[ "$DEPENDENCY_TEST_CONFLICT" == "true" ]]; then
  printf '%s' '{"name":"concurrent-change"}' > "$DEPENDENCY_TEST_ROOT/package.json"
fi
`,
      { mode: 0o755 }
    )
    const result = Bun.spawnSync(['/bin/bash', join(root, 'scripts/dependencies.sh'), 'install'], {
      env: {
        ...process.env,
        PATH: `${join(root, 'bin')}:${process.env.PATH}`,
        GITHUB_TOKEN: token,
        DEPENDENCY_TEST_ROOT: root,
        DEPENDENCY_TEST_CONFLICT: String(conflict),
        DEPENDENCY_TEST_FAIL: String(installFails)
      }
    })
    const probe = join(root, 'probe')
    const stagingCleaned = existsSync(probe) ? !existsSync(readFileSync(probe, 'utf8')) : true
    return {
      exitCode: result.exitCode,
      stderr: result.stderr.toString(),
      stdout: result.stdout.toString(),
      stagingCleaned,
      manifest: readFileSync(join(root, 'package.json'), 'utf8')
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('dependency installation', () => {
  test('uses an exported credential without requiring gh authentication', () => {
    const result = runFixture('fixture-credential', false)
    expect(result.exitCode).toBe(0)
    expect(result.stagingCleaned).toBe(true)
    expect(result.stdout).not.toContain('fixture-credential')
    expect(result.stderr).not.toContain('fixture-credential')
  })

  test('uses gh credentials internally when GITHUB_TOKEN is missing', () => {
    const result = runFixture('')
    expect(result.exitCode).toBe(0)
    expect(result.stagingCleaned).toBe(true)
    expect(result.stdout).not.toContain('fixture-credential')
    expect(result.stderr).not.toContain('fixture-credential')
  })

  test('stops before installation when credentials are unavailable', () => {
    const result = runFixture('', false)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('GitHub credential unavailable')
  })

  test('removes its staging directory when the installer fails', () => {
    const result = runFixture('fixture-credential', true, false, true)
    expect(result.exitCode).toBe(42)
    expect(result.stagingCleaned).toBe(true)
    expect(result.manifest).toBe('{"name":"fixture"}\n')
  })

  test('preserves concurrent manifest edits and removes its staging directory', () => {
    const result = runFixture('fixture-credential', true, true)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('manifests changed during installation')
    expect(result.manifest).toBe('{"name":"concurrent-change"}')
    expect(result.stagingCleaned).toBe(true)
  })
})
