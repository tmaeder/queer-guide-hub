import { test, expect } from '@playwright/test';

// Venues audit Phase 4 (P0): verify N+1 batching — first page load
// should issue ≤ 6 Supabase REST requests (venues list, dataset count,
// user favorites, trip members, trip places, and possibly events for map).

const SUPABASE_PATTERN = /supabase.*\/rest\/v1\//;

test.describe('Venues — query batching', () => {
  test('first page load issues ≤ 6 Supabase REST calls', async ({ page }) => {
    const supabaseRequests: string[] = [];

    page.on('request', (req) => {
      if (SUPABASE_PATTERN.test(req.url())) {
        const url = new URL(req.url());
        supabaseRequests.push(url.pathname);
      }
    });

    await page.goto('/venues');
    await page.waitForLoadState('networkidle');

    // Allow a generous ceiling — the key invariant is that the count
    // doesn't scale with the number of cards (no N+1).
    expect(
      supabaseRequests.length,
      `Expected ≤ 6 Supabase requests, got ${supabaseRequests.length}:\n${supabaseRequests.join('\n')}`,
    ).toBeLessThanOrEqual(6);
  });
});
