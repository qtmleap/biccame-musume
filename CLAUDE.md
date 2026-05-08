# CLAUDE.md

## ブランチ運用

`develop` / `master` には直接コミットしない。新しい作業を始めるときは、対応する feature ブランチを必ず切る。

```sh
git switch -c <type>/<short-name>
```

- 命名: commitlint の type に合わせる (`feat/`, `fix/`, `refactor/`, `chore/` など)
- 作業完了したら push して PR を develop 向けに送る
- master への反映は develop からの PR 経由のみ
- `develop` / `master` ブランチ上にいる状態でコード変更を始めようとしたら、まず `git switch -c` でブランチを切ること

## PR レビュー対応

オープンなPRがある場合、作業開始前に以下を確認する：

```sh
gh pr list
gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pulls/<PR番号>/comments
```

Copilotなどのレビューコメントがあれば、内容をユーザーに提示して対応するかどうか確認してから修正する。
