# Production Storybook catalogue

`Pages/Production` mounts the actual production route tree, including params, search validation, guards and nested layouts. `Components/*` renders feature exports with schema fixtures and real form/provider/Gantt contexts. `UI/Primitives` composes the 27 compound UI families. Existing `Review/*` examples and proposals remain available.

- `bun run storybook`: interactive server on the existing project port 6006.
- `bun run storybook:inventory`: regenerate export → story mappings after adding a production component or story.
- `bun run check:storybook`: dedicated TypeScript and independent source inventory checks.
- `bun run build-storybook`: isolated build and built-index coverage verification.
- `bun run test:storybook`: build, coverage, all-story light/dark smoke, interaction and responsive capture checks on owned port 16006. The verification server stops when Playwright completes.

Inventory is in `coverage.json`; support utilities/hooks and type-only exports are explicitly classified. Barrel exports point to the defining component story. `verify-built.ts` checks the independent production source inventory against the built index and updates `story-index.json`.

Fixtures are synthetic, dated 2026-10-02. Fresh Jotai/QueryClient/client state is used per story. API, Firebase, Cloudflare identity, directions, Maps and PWA cache operations are replaced at their boundaries; unknown/external API calls fail. Authentication, Google Maps imagery, OAuth, AI and backend persistence are not live integrations in this catalogue. Production source is unchanged.

The preview imports the exact nine local font CSS faces from production (three families × 400/500/700). Tests verify registration, loading and computed typography, actual theme/background/foreground, and meaningful content inside each production page/component. Responsive viewport captures cover Characters and Calendar at 320/375/430/768/1024/1280/1440 in both themes; evidence includes ordered character IDs, fixed birthday sort, pre/post ancestor opacity, font/color proof and spec/index/HEAD identity. Capture uses the existing Chromium viewport so it does not disturb responsive layout or restart full-page Motion animations. Content below the 900px viewport is covered by runtime checks.

Builds/caches/evidence stay under ignored `.storybook/.artifacts` and `.storybook/.cache`. Verification never uses or stops an existing 6006 server. Dependencies are the already-installed Storybook 10.6.1 packages and MockDate; no dependency installation is required by this change.
