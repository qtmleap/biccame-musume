#!/bin/zsh

sudo chown -R $(whoami):$(whoami) \
  node_modules \
  workers/app/node_modules 2>/dev/null || true

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

  # Generate the app client from the shared root schema.
  if [ -f prisma/schema.prisma ]; then
    bun run generate
  fi
fi

# Playwright MCP 用ブラウザ。Linux Arm64 には Google Chrome が存在せず、
# MCP サーバーは /opt/google/chrome/chrome を探すため Chromium を symlink で見せる
bunx playwright install --with-deps chromium
chromium_bin=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | tail -1)
if [ -n "$chromium_bin" ]; then
  sudo mkdir -p /opt/google/chrome
  sudo ln -sf "$chromium_bin" /opt/google/chrome/chrome
fi
