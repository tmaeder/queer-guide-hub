import { test, expect } from '@playwright/test';

// Observances phase 2 against prod, ANON throughout so the safety-gated path is the one
// measured. Every absence assertion is paired with a positive control, or an empty or
// broken page would pass it.
test.use({ storageState: { cookies: [], origins: [] } });

const SUPABASE_URL = 'https://xqeacpakadqfxjxjcewc.supabase.co';
// The publishable (anon) key, already hardcoded in src/integrations/supabase/client.ts.
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
const ANON = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
const BOT = {
  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};

test('/days lists every published observance, next three pinned', async ({ page }) => {
  await page.goto('/days');
  await expect(page.getByRole('heading', { level: 1, name: /Awareness days/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Next up' })).toBeVisible();
  const links = page.locator('main a[href*="/days/"]');
  await expect(links.first()).toBeVisible();
  expect(await links.count()).toBeGreaterThanOrEqual(10);
  await expect(page.locator('main a[href$="/days/world-aids-day"]')).toHaveCount(1);
  // regional rules render per country
  await expect(page.getByText(/United Kingdom: February/)).toBeVisible();
  await expect(page.getByText(/in \d+ days/)).toHaveCount(0);
});

test('TDoR hub: past years and news render', async ({ page }) => {
  await page.goto('/days/transgender-day-of-remembrance');
  await expect(page.getByRole('heading', { level: 1, name: /Day of Remembrance/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Past years' })).toBeVisible();
  await expect(page.getByText(/^\d{4} · \d+ cit(y|ies) · \d+ events?$/).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'In the news' })).toBeVisible();
  await expect(page.locator('#obs-news ~ ul a[href*="/news/"]').first()).toBeVisible();
});

test('anon counts never include gated events (RLS, not the client)', async ({ request }) => {
  // positive control: anon reads linked rows at all
  const all = await request.get(
    `${SUPABASE_URL}/rest/v1/event_observances?select=event_id,events!inner(id)&status=eq.linked`,
    { headers: { ...ANON, Prefer: 'count=exact', Range: '0-0' } },
  );
  expect(all.ok()).toBe(true);
  expect(Number(all.headers()['content-range']?.split('/')[1])).toBeGreaterThan(50);
  const leak = await request.get(
    `${SUPABASE_URL}/rest/v1/event_observances?select=event_id,events!inner(safety_gated)&status=eq.linked&events.safety_gated=is.true`,
    { headers: { ...ANON, Prefer: 'count=exact', Range: '0-0' } },
  );
  expect(leak.ok()).toBe(true);
  expect(leak.headers()['content-range']).toMatch(/\/0$/);

  const idx = await request.post(`${SUPABASE_URL}/rest/v1/rpc/observances_index`, {
    headers: { ...ANON, 'Content-Type': 'application/json' },
    data: {},
  });
  expect(idx.ok()).toBe(true);
  expect(((await idx.json()) as unknown[]).length).toBeGreaterThanOrEqual(10);
});

test('the review queue is not readable by anon', async ({ request }) => {
  const res = await request.get(
    `${SUPABASE_URL}/rest/v1/triage_src_observance_review?select=id&limit=1`,
    {
      headers: ANON,
    },
  );
  expect(res.ok()).toBe(false);
  // positive control: the same key can read the public link table
  const ok = await request.get(`${SUPABASE_URL}/rest/v1/news_observances?select=id&limit=1`, {
    headers: ANON,
  });
  expect(ok.ok()).toBe(true);
  expect(((await ok.json()) as unknown[]).length).toBe(1);
});

test('crawler: /days/:slug has its own head, WebPage + ItemList, no countdown', async ({
  request,
}) => {
  const res = await request.get('/days/world-aids-day', { headers: BOT });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('<h1>World AIDS Day</h1>');
  expect(html).toMatch(/"@type":"WebPage"/);
  expect(html).toContain('href="/help"');
  expect(html).not.toMatch(/in \d+ days/);
  // positive control for the event list: the anon REST view of the same window has rows
  expect(html).toMatch(/"@type":"ItemList"/);
  expect(html).toMatch(/<a href="\/events\/[^"]+">/);
});

test('sitemap-days.xml lists the hubs and the index references it', async ({ request }) => {
  const sm = await (await request.get('/sitemap-days.xml')).text();
  expect(sm).toContain('/days/world-aids-day</loc>');
  expect((sm.match(/<loc>/g) ?? []).length).toBeGreaterThanOrEqual(10);
  expect(await (await request.get('/sitemap.xml')).text()).toContain('/sitemap-days.xml');
});

test('/events observance facet narrows the feed', async ({ page }) => {
  await page.goto('/events?observance=world-aids-day');
  const chip = page.getByRole('button', { name: 'World AIDS Day', pressed: true });
  await expect(chip).toBeVisible();
  // positive control: World AIDS Day 2026 has upcoming linked events
  await expect(page.locator('main a[href*="/events/"]').first()).toBeVisible();
});
