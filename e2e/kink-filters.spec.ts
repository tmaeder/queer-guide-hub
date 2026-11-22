import { test, expect, type Page } from '@playwright/test';
import { anonHeaders, SUPABASE_REST_URL } from './support/anonKey';

/**
 * Kink & feature filters on prod (spec docs/superpowers/specs/
 * 2026-11-22-kink-feature-filters-design.md).
 *
 * Signed out by construction: the nightly hands the admin storageState to the
 * chromium project, and every visibility claim here is about ANON.
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function setAge(page: Page, affirmed: boolean) {
  await page.addInitScript((on) => {
    try {
      if (on)
        localStorage.setItem('qg_age_affirmation', JSON.stringify({ affirmedAt: Date.now() }));
      else {
        localStorage.removeItem('qg_age_affirmation');
        localStorage.removeItem('qg.marketplace.ageAck');
      }
    } catch {
      /* ignore */
    }
  }, affirmed);
}

async function rpc(request: Parameters<typeof anonHeaders>[0], fn: string, body: object) {
  const res = await request.post(`${SUPABASE_REST_URL}/rest/v1/rpc/${fn}`, {
    headers: { ...(await anonHeaders(request)), 'Content-Type': 'application/json' },
    data: body,
  });
  expect(res.ok(), `${fn} → ${res.status()}`).toBeTruthy();
  return res.json();
}

test.describe('kink & feature filters (anon)', () => {
  test('the term list serves registry terms with real counts', async ({ request }) => {
    const terms = (await rpc(request, 'kink_filter_terms_list', {})) as Array<{
      slug: string;
      event_count: number;
      venue_count: number;
    }>;
    expect(terms.length).toBeGreaterThanOrEqual(15);
    const by = Object.fromEntries(terms.map((t) => [t.slug, t]));
    // Positive controls: the fill and the amenity mirror both produced data.
    expect(Number(by.darkroom?.venue_count)).toBeGreaterThan(100);
    expect(Number(by.fisting?.event_count)).toBeGreaterThan(0);
  });

  test('the read path does not widen the glossary gate', async ({ request }) => {
    // chemsex is sensitive and NOT a filter term: it must read as nothing.
    expect(await rpc(request, 'kink_filter_term', { p_slug: 'chemsex' })).toEqual([]);
    // Control: a registry term does come back.
    const fisting = await rpc(request, 'kink_filter_term', { p_slug: 'fisting' });
    expect(fisting).toHaveLength(1);
  });

  test('dress-code events exist and none says "no dress code"', async ({ request }) => {
    const base = `${SUPABASE_REST_URL}/rest/v1/events?select=id&duplicate_of_id=is.null&tags=cs.{dress-code}`;
    const headers = await anonHeaders(request);
    const all = await request.get(`${base}&limit=200`, { headers });
    expect(all.ok()).toBeTruthy();
    // Positive control: the fill tagged events at all.
    expect((await all.json()).length).toBeGreaterThan(20);
    for (const neg of ['no dress code', 'without dress code', 'free dress code']) {
      const res = await request.get(`${base}&description=ilike.*${encodeURIComponent(neg)}*`, {
        headers,
      });
      expect(res.ok()).toBeTruthy();
      expect(await res.json(), neg).toEqual([]);
    }
  });

  test('tag pages list upcoming events first', async ({ request }) => {
    const [term] = await rpc(request, 'kink_filter_term', { p_slug: 'darkroom' });
    const content = await rpc(request, 'get_tag_linked_content', {
      p_tag_id: term.tag_id,
      p_tag_name: term.name,
      p_tag_slug: term.slug,
      p_limit: 20,
    });
    expect(content.events.length).toBeGreaterThan(0);
    const first = new Date(content.events[0].end_date ?? content.events[0].start_date);
    expect(first.getTime()).toBeGreaterThan(Date.now() - 2 * 86_400_000);
  });

  test('without 18+ the events filter shows the lock, not kink chips', async ({ page }) => {
    await setAge(page, false);
    await page.goto('/events');
    await page
      .getByRole('button', { name: /^Filters/ })
      .first()
      .click();
    const group = page.getByTestId('kink-filter-group');
    await expect(group).toBeVisible({ timeout: 20_000 });
    await expect(group.getByTestId('kink-filter-unlock')).toBeVisible();
    await expect(group.getByRole('button', { name: /^Fisting/ })).toHaveCount(0);
    // Control: a public feature chip does render.
    await expect(group.getByRole('button', { name: /^Darkroom/ })).toBeVisible();
  });

  test('with 18+ kink chips render and filter the events list', async ({ page }) => {
    await setAge(page, true);
    await page.goto('/events');
    await page
      .getByRole('button', { name: /^Filters/ })
      .first()
      .click();
    const group = page.getByTestId('kink-filter-group');
    await expect(group.getByRole('button', { name: /^Fisting/ })).toBeVisible({ timeout: 20_000 });
    await expect(group.getByTestId('kink-filter-unlock')).toHaveCount(0);

    await page.goto('/events?tags=fisting');
    await expect(page.locator('a[href*="/events/"]').first()).toBeVisible({ timeout: 20_000 });
  });

  test('event cards show the kink chip only after 18+', async ({ page, browser }) => {
    // Card chips are linkless TagChips: <span data-tag-slug>. Filter badges are
    // not, so this cannot match the active ?tags= filter itself.
    const chip = 'span[data-tag-slug="fisting"]';
    await setAge(page, true);
    await page.goto('/events?tags=fisting');
    await expect(page.locator('a[href*="/events/"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(chip).first()).toBeVisible();
    await expect(page.locator(chip).first()).toHaveText(/Fisting/);

    // Same list without the confirmation: events still listed, chip hidden.
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const p2 = await anon.newPage();
    await setAge(p2, false);
    await p2.goto('/events?tags=fisting');
    await expect(p2.locator('a[href*="/events/"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(p2.locator(chip)).toHaveCount(0);
    await anon.close();
  });

  test('with 18+ the venues filter offers features', async ({ page }) => {
    await setAge(page, true);
    await page.goto('/venues');
    await page.getByRole('button', { name: 'Toggle filters' }).first().click();
    const group = page.getByTestId('kink-filter-group');
    await expect(group.getByRole('button', { name: /^Steam room/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(group.getByRole('button', { name: /^Sling/ })).toBeVisible();
  });

  test('/kinks lists the terms and links to tag pages', async ({ page }) => {
    await setAge(page, true);
    await page.goto('/kinks');
    await expect(page.getByTestId('kink-hub')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-testid="kink-hub"] a[href*="/tags/"]')).toHaveCount(21, {
      timeout: 20_000,
    });
    const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('a reviewed kink term shows its full glossary page with events to anon', async ({
    page,
  }) => {
    await setAge(page, true);
    await page.goto('/tags/darkroom');
    await expect(page.getByRole('heading', { level: 1, name: 'Darkroom' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('#events a[href*="/events/"]').first()).toBeVisible();
  });

  test('a term created for the filters (underwear party) has its full page too', async ({
    page,
  }) => {
    // The four tags created with the registry were marked reviewed in
    // 99991795362072, so anon reads the glossary row and gets the full page
    // rather than the reduced KinkTermPage fallback.
    await setAge(page, true);
    await page.goto('/tags/underwear-party');
    await expect(page.getByRole('heading', { level: 1, name: 'Underwear Party' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('kink-term-page')).toHaveCount(0);
    await expect(page.locator('#events a[href*="/events/"]').first()).toBeVisible();
  });
});
