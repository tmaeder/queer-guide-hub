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

// This budget describes an ANONYMOUS first load, and it has to say so.
//
// The `chromium` project attaches the admin storageState to every spec as soon
// as E2E_ADMIN_EMAIL / _PASSWORD resolve, which they started doing between the
// 2026-08-18 and 08-19 nightlies. From then on this test measured a signed-in
// page: the fixed set above was still there, but ~22 auth-only requests rode in
// on top of it — user_passkey_enrollment, user_community_score, get_inbox_feed
// x2, get_inbox_unread_count, user_roles x3, profiles x4, user_achievements x3,
// user_gamification, achievements, reservations, trip_members x2,
// venue_favorites — and the count landed at 39. Every nightly since has failed
// here.
//
// Raising MAX_REQUESTS would have been the wrong repair: the auth chrome scales
// with the signed-in header, not with the number of venue cards, so a bigger
// ceiling would have hidden exactly the per-card N+1 this test exists to catch.
// Pinning the spec signed-out restores the measurement the budget was written
// for and keeps ≤ 20 meaningful (page size ≥ 12, so a per-card query still blows
// straight through it).
test.use({ storageState: { cookies: [], origins: [] } });

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
