import { test, expect } from '@playwright/test';

// IDAHOBIT hub after source-may17 (observances phase 3). Anon throughout, so the
// safety-gated path is the one measured. Thresholds sit below what anon read on
// 2026-11-22 (2026: 131 events / 110 cities; 2025: 77 events), so normal churn does
// not flake them but a broken source or linker does.
test.use({ storageState: { cookies: [], origins: [] } });

const SUPABASE_URL = 'https://xqeacpakadqfxjxjcewc.supabase.co';
// The publishable (anon) key, already hardcoded in src/integrations/supabase/client.ts.
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
const ANON = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  Prefer: 'count=exact',
  Range: '0-0',
};
const total = (h: Record<string, string>) => Number(h['content-range']?.split('/')[1]);
const LINKS = `${SUPABASE_URL}/rest/v1/event_observances?select=event_id,observance:observances!inner(slug),event:events!inner(id,safety_gated)&observance.slug=eq.idahobit&status=eq.linked`;

test('IDAHOBIT hub shows last May’s events and a real past-years line', async ({ page }) => {
  await page.goto('/days/idahobit');
  await expect(page.getByRole('heading', { level: 1, name: 'IDAHOBIT' })).toBeVisible();
  // the next occurrence is 2027, so 2026 is the "last time" section
  await expect(page.getByRole('heading', { level: 2, name: '2026 events' })).toBeVisible();
  const cards = page.locator('section[aria-labelledby="obs-last-time"] a[href*="/events/"]');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(50);

  await expect(page.getByRole('heading', { level: 2, name: 'Past years' })).toBeVisible();
  const line = page.getByText(/^2026 · (\d+) cities · (\d+) events$/);
  await expect(line).toBeVisible();
  const [, cities, events] = /^2026 · (\d+) cities · (\d+) events$/.exec(
    (await line.textContent()) ?? '',
  )!;
  expect(Number(events)).toBeGreaterThanOrEqual(100);
  expect(Number(cities)).toBeGreaterThanOrEqual(80);
  await expect(page.getByText(/^2025 · \d+ cities · \d+ events$/)).toBeVisible();
});

test('may17 events link through the source signal, not only through titles', async ({
  request,
}) => {
  const all = await request.get(LINKS, { headers: ANON });
  expect(all.ok()).toBe(true);
  expect(total(all.headers())).toBeGreaterThanOrEqual(150); // positive control

  // events whose title does not name the day, linked because may17 listed them
  const viaSource = await request.get(`${LINKS}&evidence->>title_term=like.source:*`, {
    headers: ANON,
  });
  expect(viaSource.ok()).toBe(true);
  expect(total(viaSource.headers())).toBeGreaterThanOrEqual(60);
});

test('no safety-gated IDAHOBIT event is visible to anon', async ({ request }) => {
  const all = await request.get(LINKS, { headers: ANON });
  expect(total(all.headers())).toBeGreaterThanOrEqual(150); // positive control: anon reads links
  const gated = await request.get(`${LINKS}&event.safety_gated=is.true`, { headers: ANON });
  expect(gated.ok()).toBe(true);
  expect(gated.headers()['content-range']).toMatch(/\/0$/);
});
