/**
 * E2E: Badge flow — login → visit store → badge appears in /badges
 *
 * TODO: This test is intentionally skipped until the following prerequisites
 * are in place:
 *
 * 1. Firebase emulator seed account with a pre-populated UserStore
 *    (status='visited') so that at least one visit badge is already earned.
 *    Seed accounts live in .devcontainer/auth — see memory entry
 *    `project_firebase_auth_seed.md`.
 *
 * 2. A dev-server running with the badge evaluator hook wired into
 *    PUT /api/users/me/stores/:storeKey, so that marking a store as visited
 *    triggers badge award synchronously.
 *
 * 3. The /badges route rendering real data from TanStack Query
 *    (use-badges.ts + use-badge-leaderboard.ts) rather than the mock.
 *
 * What the test should do once unblocked:
 *   a. Navigate to the app and sign in with the Firebase emulator seed account.
 *   b. Call PUT /api/users/me/stores/akiba with { status: 'visited' }
 *      (either via the UI location page or directly via fetch from page context).
 *   c. Navigate to /badges.
 *   d. Assert that the "AKIBA店訪問" badge card is visible and shows the
 *      earned state (e.g., a filled icon or "獲得済み" label).
 *
 * NOTE: /control_panel (admin) is explicitly out of scope per
 *   memory `project_e2e_admin_out_of_scope.md`.
 */

import { test } from '@playwright/test'

test.skip('badges flow: visit store → badge appears in /badges', () => {
  // Implementation pending (see TODO above).
})
