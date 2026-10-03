#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
unset CLOUDFLARE_ENV
export CLOUDFLARE_VITE_FORCE_LOCAL=true E2E=1
bunx wrangler d1 migrations apply DB --local --config e2e/local/wrangler.toml --persist-to .cache/a15/state
bunx wrangler d1 execute DB --local --config e2e/local/wrangler.toml --persist-to .cache/a15/state --file e2e/local/seed.sql
# Pinned Auth-only CLI, scratch cache; no login/import/export or shared dependency installation.
export npm_config_cache="$PWD/.cache/a15/npm"
printf -v playwright_command '%q ' bunx playwright test "$@"
exec npm exec --yes --package firebase-tools@15.32.1 -- firebase emulators:exec --only auth --project demo-ui-ux --config e2e/local/firebase.json "$playwright_command"
