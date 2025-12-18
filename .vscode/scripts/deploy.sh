#!/usr/bin/env bash
set -e

# fzfでブランチを選択
BRANCH=$(echo -e 'master\ndevelop' | fzf --prompt='Select branch: ' --height=40% --reverse)

if [ -z "$BRANCH" ]; then
  echo "No branch selected. Exiting."
  exit 1
fi

echo "Selected branch: $BRANCH"
echo "Running deployment workflow for $BRANCH..."

# actでデプロイメントワークフローを実行
act pull_request \
  -W .github/workflows/deployment.yaml \
  --secret-file .secrets \
  -e ".github/pull_request.closed.${BRANCH}.json"
