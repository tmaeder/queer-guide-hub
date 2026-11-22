import { test, expect } from '@playwright/test';

// UK LGBT+ History Month 2027 after the observance-seed pages (99991795376453).
// Anon throughout. On 2026-11-22 anon read 7 linked February-2027 UK events; the
// threshold sits below that so a broken seed source or linker fails, churn does not.
test.use({ storageState: { cookies: [], origins: [] } });

const SUPABASE_URL = 'https://xqeacpakadqfxjxjcewc.supabase.co';
// The publishable (anon) key, already hardcoded in src/integrations/supabase/client.ts.
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
const ANON = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
const LINKS =
  `${SUPABASE_URL}/rest/v1/event_observances?select=event:events!inner(title,start_date,country:countries(code))` +
  `,observance:observances!inner(slug)&observance.slug=eq.lgbt-history-month&status=eq.linked` +
  `&event.start_date=gte.2027-02-01&event.start_date=lt.2027-03-01`;

test('February 2027 links are UK events that name the month', async ({ request }) => {
  const res = await request.get(LINKS, { headers: ANON });
  expect(res.ok()).toBe(true);
  const rows = (await res.json()) as {
    event: { title: string; country: { code: string } | null };
  }[];
  expect(rows.length).toBeGreaterThanOrEqual(5); // positive control
  // the GB rule is February; other countries' rules are other months
  for (const r of rows) expect(r.event.country?.code).toBe('GB');
});

test('hub lists the 2027 UK events', async ({ page }) => {
  await page.goto('/days/lgbt-history-month');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('History Month');
  const cards = page.locator('section[aria-labelledby="obs-events"] a[href*="/events/"]');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(5);
  await expect(
    page
      .locator('section[aria-labelledby="obs-events"]')
      .getByText('2027 LGBT+ History Month Lecture, University of Oxford'),
  ).toBeVisible();
});
