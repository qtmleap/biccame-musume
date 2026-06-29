#!/bin/sh
# Push VITE_-prefixed entries from .dev.vars into GitHub Actions secrets via `gh secret set`.
# VITE_ vars are baked into the client bundle at build time, so they must live
# in GH Actions secrets (build time) — not Cloudflare Workers secrets (runtime).
# Server-only secrets (JWT_*, TWITTER_*, etc.) belong in Cloudflare; sync those
# with scripts/sync-cf-secrets.sh instead.
#
# Usage: scripts/sync-gh-secrets.sh [--repo <owner/repo>] [--prefix <prefix>] [<file>]
#   <file>   defaults to .dev.vars
#   --prefix defaults to VITE_
#   --repo   passes -R <owner/repo> to gh (otherwise inferred from cwd)
set -eu

repo=""
prefix="VITE_"
file=".dev.vars"
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="${2:?--repo needs a value}"; shift 2 ;;
    --prefix) prefix="${2:?--prefix needs a value}"; shift 2 ;;
    -h | --help) sed -n '2,11p' "$0"; exit 0 ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) file="$1"; shift ;;
  esac
done

[ -f "$file" ] || { echo "secrets file not found: $file" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "gh is required" >&2; exit 1; }

jq_prog="$(cat <<'JQ'
reduce inputs as $line ({};
  ($line | sub("^\\s*export\\s+"; "")) as $l
  | if   ($l | test("^\\s*(#|$)")) then .
    elif ($l | test("=") | not)    then .
    else ($l | capture("^(?<k>[^=]+)=(?<v>.*)$")) as $kv
      | .[($kv.k | gsub("^\\s+|\\s+$"; ""))] =
          ($kv.v
           | if   test("^\".*\"$") then .[1:-1]
             elif test("^'.*'$")   then .[1:-1]
             else . end)
    end)
JQ
)"
json="$(jq -Rn "$jq_prog" "$file")"

# Filter to keys starting with the configured prefix.
filtered="$(printf '%s' "$json" | jq --arg p "$prefix" \
  'with_entries(select(.key | startswith($p)))')"

count="$(printf '%s' "$filtered" | jq 'length')"
if [ "$count" = "0" ]; then
  echo "no keys with prefix '$prefix' found in $file" >&2
  exit 1
fi

echo "[sync-gh-secrets] setting $count secret(s) on GitHub Actions: $(printf '%s' "$filtered" | jq -r 'keys | join(", ")')" >&2

set -- secret set
[ -n "$repo" ] && set -- "$@" -R "$repo"

# Stream each key=value into `gh secret set` via stdin so values never appear
# in argv, the process list, or the shell trace.
printf '%s' "$filtered" | jq -r 'to_entries[] | @base64' | while IFS= read -r row; do
  key="$(printf '%s' "$row" | base64 -d | jq -r '.key')"
  printf '%s' "$row" | base64 -d | jq -r '.value' | gh "$@" "$key"
  echo "  ✓ $key" >&2
done
