# Work Plan: UI以外のコードをリファクタする Agent と Skill を作成
Date: 2026-05-01

## Goal
UI 以外（API / DB / schemas / utils / workers / tests）のコードを構造的にリファクタするための agent と user-invocable skill を作成する。`ui-refactor` の非UI版を提供する。

## Tasks

### Leader (本エージェント)
- [ ] `.claude/agents/refactor.md` を作成
- [ ] `.claude/skills/code-refactor/SKILL.md` を作成
- [ ] 既存 `ui-refactor` スキルとスコープが衝突しないか最終確認

## Execution Order
1. Sequential: agent → skill の順（skill が agent を委譲先として参照するため）

## Deliverables
- `.claude/agents/refactor.md`: 非UIコードリファクタ専門エージェント定義
- `.claude/skills/code-refactor/SKILL.md`: `/code-refactor` ユーザー起動スキル

## Design Decisions
- スキル名は `/code-refactor`（`/refactor` だと曖昧で組み込み skill と紛れる）
- 組み込み `simplify` skill との棲み分け: `simplify` は直近の変更差分レビュー、本スキルは指定モジュール全体の構造改善
- 実行後は自動で qa agent を呼んで型/lint/commit まで完了
- 対象外: `src/components/ui/**`、`src/components/**` の presentational JSX、`src/app/routes/**` の JSX 部分
- 対象: `src/app/server/**`(Hono routes)、`schemas/**`、`prisma/**`、`src/lib/**`、`src/hooks/**` の非presentational、`workers/**`、`tests/**`

## Audit Criteria (skill 内に記載)
- 重複 / 再利用余地
- 責務分離（route の肥大、service 層化）
- 型安全（`any`/`unknown` 残存、Zod 未適用）
- DB クエリ（N+1、Prisma 最適化）
- デッドコード（未使用 export / import）
- 規約準拠（DTO 命名、ファイル配置）

## Risks / Notes
- agent が UI コードを誤って触らないよう、制約セクションで明示
- Prisma マイグレーションは絶対に直接 SQL を書かない（memory で確認済み）
