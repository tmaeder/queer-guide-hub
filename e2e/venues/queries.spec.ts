import { test, expect } from '@playwright/test';

// Venues audit Phase 4 (P0): verify N+1 batching — the invariant is that the
// Supabase request count on first load is a FIXED overhead that does NOT scale
// with the number of venue cards. `/venues` now defaults to the VENUES_V2
// surface (rails on), so the fixed set is larger than the original v1 budget:
// dataset count, ranked grid RPC, events-for-map, unified-tags / amenity /
// target-group vocab, guides stream, two rail RPCs, leaderboard (+profiles
// hydrate) — ~12–15 fixed calls. A per-card N+1 would blow well past the
// ceiling (page size ≥ 12), so ≤ 20 still catches the regression this guards.

const SUPABASE_PATTERN = /supabase.*\/rest\/v1\//;
const MAX_REQUESTS = 20;

test.describe('Venues — query batching', () => {
  test('first page load issues a fixed (non-N+1) number of Supabase REST calls', async ({ page }) => {
    const supabaseRequests: string[] = [];

    page.on('request', (req) => {
      if (SUPABASE_PATTERN.test(req.url())) {
        const url = new URL(req.url());
        supabaseRequests.push(url.pathname);
      }
    });

    await page.goto('/venues');
    await page.waitForLoadState('networkidle');

    expect(
      supabaseRequests.length,
      `Expected ≤ ${MAX_REQUESTS} Supabase requests (fixed overhead, no N+1), got ${supabaseRequests.length}:\n${supabaseRequests.join('\n')}`,
    ).toBeLessThanOrEqual(MAX_REQUESTS);
  });
});
