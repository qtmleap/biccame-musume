#!/bin/zsh

sudo chown -R $(whoami):$(whoami) \
  node_modules \
  workers/api/node_modules \
  workers/app/node_modules \
  workers/db/node_modules \
  packages/shared/node_modules 2>/dev/null || true

# Silence direnv output.
# In direnv 2.36+, DIRENV_LOG_FORMAT env var is ignored unless direnv.toml exists.
# See: https://github.com/direnv/direnv/issues/1418
mkdir -p ~/.config/direnv
cat > ~/.config/direnv/direnv.toml <<'EOF'
[global]
log_format = ""
hide_env_diff = true
EOF

if [ -f package.json ]; then
  if [ -f bun.lock ]; then
    bun install --frozen-lockfile --ignore-scripts
  else
    bun install --ignore-scripts
  fi

  # Generate Prisma client if the DB worker exists. Runs before the first
  # `bun typecheck` so imports of `@app/db` resolve to real generated types.
  if [ -f workers/db/prisma/schema.prisma ]; then
    bun run --cwd workers/db generate
  fi
fi
