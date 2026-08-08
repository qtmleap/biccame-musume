# CLAUDE.md

## ブランチ運用

### ルール

- **禁止:** `develop` / `master` に直接コミットしない。
- **必須:** 新しい作業を始めるときは、必ず対応する feature ブランチを切る。
- 現在 `develop` / `master` ブランチ上にいる状態でコード変更を始めようとした場合は、変更前にまず `git switch -c` でブランチを切ること。

### ブランチの作り方

```sh
git switch -c <type>/<short-name>
```

- `<type>` は commitlint の type に合わせる（`feat/`, `fix/`, `refactor/`, `chore/` など）。

### マージフロー

1. 作業が完了したら push し、`develop` 向けの PR を送る。
2. `master` への反映は `develop` からの PR 経由のみ。

## PR レビュー対応

オープンな PR がある場合、作業開始前に以下を実行して確認する。

```sh
gh pr list
gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pulls/<PR番号>/comments
```

- Copilot などのレビューコメントがあれば、その内容をユーザーに提示し、対応するかどうかを確認してから修正に入る。
