import { test, expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders } from './support/anonKey';

/**
 * Festival brands (Phase 3 of docs/plans/2026-11-22-festival-multi-event-structure-design.md,
 * migration 99991795355942_festival_brands) and the feed card's programme count (Phase 2),
 * as an anonymous reader and a crawler see them on prod.
 *
 * The festival is picked from live data — an upcoming edition with a programme that
 * belongs to a brand — so the spec keeps meaning something after this year's editions end.
 */

test.describe.configure({ timeout: 120_000 });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

interface Picked {
  edition: { id: string; slug: string; title: string; programme_size: number };
  brand: { slug: string; name: string };
}

async function pick(request: APIRequestContext): Promise<Picked> {
  const headers = await anonHeaders(request);
  const res = await request.get(
    `${SUPABASE_URL}/rest/v1/events?select=id,slug,title,programme_size,festival_id&festival_id=not.is.null&programme_size=gte.3&duplicate_of_id=is.null&end_date=gte.${new Date().toISOString()}&order=programme_size.desc&limit=1`,
    { headers },
  );
  expect(res.ok(), `events -> HTTP ${res.status()}`).toBe(true);
  const [edition] = (await res.json()) as Array<Picked['edition'] & { festival_id: string }>;
  // Positive control: without a branded upcoming festival every check below is vacuous.
  expect(edition, 'no upcoming branded festival with >= 3 programme children').toBeTruthy();

  const b = await request.get(
    `${SUPABASE_URL}/rest/v1/festivals?select=slug,name&id=eq.${edition.festival_id}`,
    { headers },
  );
  expect(b.ok()).toBe(true);
  const [brand] = (await b.json()) as Array<Picked['brand']>;
  expect(brand?.slug, 'edition points at a brand anon cannot read').toBeTruthy();
  return { edition, brand };
}

test('the /festivals hub lists the brand and links to it', async ({ page, request }) => {
  const { brand } = await pick(request);
  await page.goto('/festivals');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  const link = page.getByRole('link', { name: brand.name, exact: true }).first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  await expect(link).toHaveAttribute('href', new RegExp(`/festivals/${brand.slug}$`));
});

test('a brand page leads with the next edition and its programme', async ({ page, request }) => {
  const { edition, brand } = await pick(request);
  await page.goto(`/festivals/${brand.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: brand.name })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole('link', { name: edition.title, exact: true }).first(),
  ).toHaveAttribute('href', new RegExp(`/events/${edition.slug}$`));
  // Programme rows are links to the children; the edition has >= 3.
  await expect
    .poll(async () => page.locator('main li a[href^="/events/"]').count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(3);
});

test('an edition page links "Part of" to its brand', async ({ page, request }) => {
  const { edition, brand } = await pick(request);
  await page.goto(`/events/${edition.slug}`);
  await expect(page.getByRole('link', { name: brand.name, exact: true }).first()).toHaveAttribute(
    'href',
    new RegExp(`/festivals/${brand.slug}$`),
    { timeout: 30_000 },
  );
});

test('the feed card opens the programme without leaving the feed', async ({ page, request }) => {
  const { edition } = await pick(request);
  await page.goto(`/events?q=${encodeURIComponent(edition.title)}`);
  const count = page.getByRole('button', { name: `${edition.programme_size} events` }).first();
  await expect(count).toBeVisible({ timeout: 45_000 });
  await count.click();
  const full = page.getByRole('link', { name: 'Full programme' });
  await expect(full).toBeVisible({ timeout: 15_000 });
  await expect(full).toHaveAttribute('href', new RegExp(`/events/${edition.slug}#programme$`));
  await expect(page).toHaveURL(/\/events\?/);
});

test('crawlers get an EventSeries head and the brand is in the sitemap', async ({ request }) => {
  const { brand, edition } = await pick(request);
  const res = await request.get(`/festivals/${brand.slug}`, {
    headers: { 'user-agent': GOOGLEBOT },
  });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('"@type":"EventSeries"');
  expect(html).toContain(`/events/${edition.slug}`);

  const sm = await request.get('/sitemap-festivals.xml');
  expect(sm.ok()).toBe(true);
  const xml = await sm.text();
  // Positive control: a sitemap with a handful of URLs means the view or the gate broke.
  expect(xml.match(/<loc>/g)?.length ?? 0).toBeGreaterThan(100);
  expect(xml).toContain(`/festivals/${encodeURIComponent(brand.slug)}</loc>`);

  const index = await (await request.get('/sitemap.xml')).text();
  expect(index).toContain('/sitemap-festivals.xml');
});

test('an unknown brand is a 404 for crawlers', async ({ request }) => {
  const res = await request.get('/festivals/zz-no-such-festival-e2e', {
    headers: { 'user-agent': GOOGLEBOT },
  });
  expect(res.status()).toBe(404);
});

test('the service-role crawler view is not readable by anon', async ({ request }) => {
  const headers = await anonHeaders(request);
  const ok = await request.get(`${SUPABASE_URL}/rest/v1/festivals?select=slug&limit=1`, {
    headers,
  });
  expect(ok.ok(), 'positive control: anon can read festivals').toBe(true);
  const res = await request.get(`${SUPABASE_URL}/rest/v1/festivals_crawlable?select=slug&limit=1`, {
    headers,
  });
  expect(res.ok()).toBe(false);
});
