#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
unset CLOUDFLARE_ENV
export CLOUDFLARE_VITE_FORCE_LOCAL=true E2E=1
mkdir -p .cache/a15
export A15_VOTE_STATE
A15_VOTE_STATE=$(mktemp -d .cache/a15/vote-state.XXXXXXXX)
trap 'rm -rf -- "$A15_VOTE_STATE"' EXIT
bunx wrangler d1 migrations apply DB --local --config e2e/vote-local/wrangler.toml --persist-to "$A15_VOTE_STATE"
bunx wrangler d1 execute DB --local --config e2e/vote-local/wrangler.toml --persist-to "$A15_VOTE_STATE" --file e2e/local/seed.sql
bunx playwright test --config e2e/vote-local/playwright.config.ts "$@"
