#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

case "${1:-}" in
  install) ;;
  *)
    printf '%s\n' 'Usage: bash scripts/dependencies.sh install [Bun options]' >&2
    exit 2
    ;;
esac

# .env の自動読込を避け、認証情報は子プロセスの環境変数だけに渡す。
if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    printf '%s\n' 'Set GITHUB_TOKEN with read:packages or sign in with gh auth login.' >&2
    exit 1
  fi
  if ! GITHUB_TOKEN="$(gh auth token --hostname github.com 2>/dev/null)"; then
    printf '%s\n' 'GitHub credential unavailable. Set GITHUB_TOKEN with read:packages or sign in with gh auth login.' >&2
    exit 1
  fi
fi

if [[ -z "${GITHUB_TOKEN}" ]]; then
  printf '%s\n' 'GitHub credential is empty. Set GITHUB_TOKEN with read:packages.' >&2
  exit 1
fi
export GITHUB_TOKEN

# Bun 1.4.3 の install は --no-env-file を無視するため、設定だけの一時ルートで実行する。
root="$PWD"
staging="$(mktemp -d "${TMPDIR:-/tmp}/biccame-dependencies.XXXXXXXX")"
trap 'rm -rf "$staging"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$root/node_modules" "$staging/originals"
ln -s "$root/node_modules" "$staging/node_modules"
ln -s "$root/packages" "$staging/packages"
ln -s "$root/workers" "$staging/workers"
# 認証値の直書きや別 host への転送を許さず、環境変数参照だけを一時設定に置く。
cat > "$staging/.npmrc" <<'NPMRC'
@qtmleap:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
NPMRC
if ! cmp -s "$root/.npmrc" "$staging/.npmrc"; then
  printf '%s\n' 'Unexpected registry configuration. Expected GitHub Packages with a GITHUB_TOKEN reference.' >&2
  exit 1
fi
cp "$root/bunfig.toml" "$staging/bunfig.toml"

manifests=(package.json)
for manifest in "${manifests[@]}"; do
  cp "$root/$manifest" "$staging/$manifest"
  mkdir -p "$staging/originals/$(dirname "$manifest")"
  cp "$root/$manifest" "$staging/originals/$manifest"
done
if [[ -f "$root/bun.lock" ]]; then
  cp "$root/bun.lock" "$staging/bun.lock"
  cp "$root/bun.lock" "$staging/originals/bun.lock"
fi

# install の正規 linker で既存配置も更新する。ライフサイクルによる暗黙の設定読込は避ける。
(cd "$staging" && bun --no-env-file "$@" --ignore-scripts --linker hoisted)

# 他セッションが同時に変更した manifest/lock は上書きしない。
outputs=("${manifests[@]}" bun.lock)
for output in "${outputs[@]}"; do
  if [[ -f "$staging/originals/$output" ]] && ! cmp -s "$root/$output" "$staging/originals/$output"; then
    printf '%s\n' 'Dependency manifests changed during installation. Rerun the command.' >&2
    exit 1
  fi
done
for output in "${outputs[@]}"; do
  if [[ -f "$staging/$output" ]] && ! cmp -s "$root/$output" "$staging/$output"; then
    cp "$staging/$output" "$root/$output"
  fi
done
