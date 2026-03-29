# CLAUDE.md

## PR レビュー対応

オープンなPRがある場合、作業開始前に以下を確認する：

```sh
gh pr list
gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pulls/<PR番号>/comments
```

Copilotなどのレビューコメントがあれば、内容をユーザーに提示して対応するかどうか確認してから修正する。
