#!/usr/bin/env bash
# Auto-bump package.json version based on commitlint type of the latest commit.
#
# Triggered as a Claude Code PostToolUse hook on Bash tool calls.
# Decides bump from the just-created commit:
#   feat                 -> minor
#   fix | perf           -> patch
#   "!" or BREAKING …    -> major
#   anything else        -> skip
#
# To opt out for a specific commit, include "[skip-bump]" anywhere in the
# commit body.

set -uo pipefail

input=$(cat)

tool_name=$(echo "$input" | jq -r '.tool_name // empty')
[ "$tool_name" = "Bash" ] || exit 0

command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Match "git commit" but not "--amend" or interactive subcommands.
if ! echo "$command" | grep -qE '(^|[^a-zA-Z])git[[:space:]]+commit'; then
  exit 0
fi
if echo "$command" | grep -qE '\-\-amend'; then
  exit 0
fi

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$repo_root" || exit 0

[ -f package.json ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

last_msg=$(git log -1 --pretty=%B 2>/dev/null) || exit 0
last_subject=$(echo "$last_msg" | head -n 1)

# Avoid recursion: skip if the just-created commit is itself a release bump.
if echo "$last_subject" | grep -qE '^chore\(release\):'; then
  exit 0
fi

# Opt-out token in commit body.
if echo "$last_msg" | grep -qF '[skip-bump]'; then
  exit 0
fi

type=$(echo "$last_subject" | sed -nE 's/^([a-z]+)(\([^)]+\))?(!)?:.*/\1/p')
[ -z "$type" ] && exit 0

breaking="no"
if echo "$last_subject" | grep -qE '^[a-z]+(\([^)]+\))?!:'; then
  breaking="yes"
fi
if echo "$last_msg" | grep -qE '^BREAKING[ -]CHANGE:'; then
  breaking="yes"
fi

bump=""
if [ "$breaking" = "yes" ]; then
  bump="major"
elif [ "$type" = "feat" ]; then
  bump="minor"
elif [ "$type" = "fix" ] || [ "$type" = "perf" ]; then
  bump="patch"
fi
[ -z "$bump" ] && exit 0

current=$(jq -r '.version // empty' package.json 2>/dev/null) || exit 0
[ -z "$current" ] && exit 0

base_version=$(echo "$current" | sed -E 's/-.*$//')
IFS='.' read -r major minor patch <<EOF
$base_version
EOF
[ -z "${major:-}" ] || [ -z "${minor:-}" ] || [ -z "${patch:-}" ] && exit 0

case "$bump" in
  major) major=$((major+1)); minor=0; patch=0 ;;
  minor) minor=$((minor+1)); patch=0 ;;
  patch) patch=$((patch+1)) ;;
esac
new_version="${major}.${minor}.${patch}"

tmp=$(mktemp)
jq --arg v "$new_version" '.version = $v' package.json > "$tmp" && mv "$tmp" package.json

git add package.json
git commit -m "chore(release): bump version to v${new_version}" >/dev/null 2>&1 || true

# Inform the parent (visible in transcript via stderr).
echo "[auto-version-bump] ${current} -> ${new_version} (${bump})" >&2

exit 0