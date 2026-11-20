import { test, expect, type Page } from '@playwright/test';
import { REDUCED_MOTION } from './support/reducedMotion';
import { DESTINATIONS_HEADING, loadDestinations, loadHomeContent } from './support/homeContent';

test.use({ ...REDUCED_MOTION, storageState: { cookies: [], origins: [] } });

async function openHome(page: Page) {
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText('Find queer places and events');
  const consent = page.getByRole('button', { name: 'Necessary Only', exact: true });
  if (await consent.isVisible()) await consent.click();
}

for (const width of [390, 1280]) {
  test(`discovery is visible and usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openHome(page);
    const hero = page.locator('.subway-hero');
    await expect(hero.getByRole('combobox')).toBeVisible();
    for (const [name, path] of [
      ['Browse places', '/venues'],
      ['Find events', '/events'],
      ['Open the map', '/map'],
    ]) {
      const link = hero.getByRole('link', { name });
      await expect(link).toBeInViewport();
      await expect(link).toHaveAttribute('href', path);
    }
    // The featured city follows the visitor's REGION since 7d5451f4b, so pinning one
    // name pins a transient: a runner in another region features another city, and
    // these four cases went red for exactly that. Assert the SHAPE instead.
    //
    // This does NOT guard the load-window defect that commit also shipped (an empty
    // `?city=` and a second 'Browse places' for ~300-800ms). Measured: reverting the
    // component fix leaves these cases GREEN, because a web-first assertion RETRIES
    // and the transient is gone before it settles. The guard for that is the unit test
    // src/components/home/subway/__tests__/HomeCityFeature.test.tsx, which renders the
    // unresolved state directly. Do not re-pin a city name here believing it covers it.
    const feature = hero.locator('section:has(#home-city-feature-title)');
    const city = feature.getByRole('link', { name: /city guide$/ });
    await expect(city).toBeInViewport();
    await expect(city).toHaveAttribute('href', /^\/city\/[a-z0-9-]+$/);
    // Non-empty name: an unresolved city rendered the label with the name missing.
    await expect(city).toHaveAccessibleName(/^\S[\s\S]*city guide$/);
    const places = feature.getByRole('link', { name: /Regenbogenhaus|Browse places/ });
    await expect(places).toBeInViewport();
    // Either the fallback's community space, or that city's venues -- never `?city=`.
    await expect(places).toHaveAttribute('href', /^\/venues(\/[a-z0-9-]+|\?city=.+)$/);
    expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(width);

    await hero.getByRole('combobox').click();
    const search = page.getByRole('combobox', { name: /search/i });
    await search.fill('Berlin');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/search\?.*q=Berlin/i);
  });
}

// The intent map ("What are you here for?", 7 links incl. /search) was removed in
// 52e24db6d; search is entered from the hero combobox, which the discovery cases
// above exercise end to end, so that half of this case is not re-pinned anywhere.
test('homepage prioritizes listings and destinations', async ({ page }) => {
  test.setTimeout(150_000); // loadDestinations: see its comment
  await openHome(page);
  // loadDestinations waits for the first city card: the positive control that the
  // band is populated. The country slot is the mixed-band invariant.
  const destinations = await loadDestinations(page);
  const events = page.getByRole('region', { name: 'Events', exact: true });
  await expect(events.getByRole('link', { name: /^See all events/ })).toHaveAttribute(
    'href',
    '/events',
  );
  await expect(destinations.getByRole('link', { name: /^Travel/ })).toHaveAttribute(
    'href',
    '/travel',
  );
  await expect(destinations.locator('a[href^="/country/"]').first()).toBeAttached();
  // The map band mounts on first interaction (loadDestinations scrolled), so all
  // four heads are present here. Order is the contract: listings before destinations.
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
  expect((await page.locator('main h2').allTextContents()).map((text) => text.trim())).toEqual([
    // The featured city is region-dependent; only that it is NAMED is invariant.
    expect.stringMatching(/^\S/),
    'Events',
    'Map',
    DESTINATIONS_HEADING,
  ]);
  await expect(page.getByRole('region', { name: 'Your lines' })).toHaveCount(0);
});

test('the city feature links to the directory when there is no upcoming event', async ({
  page,
}) => {
  await page.route('**/rest/v1/rpc/search_events', (route) => route.fulfill({ json: [] }));
  const eventsRequest = page.waitForResponse((response) =>
    response.url().endsWith('/rest/v1/rpc/search_events'),
  );
  await openHome(page);
  await eventsRequest;

  const feature = page.locator('section:has(#home-city-feature-title)');
  // Region-dependent city, so match the shape. Unanchored: the tile's accessible name
  // is both spans ("What's on Browse <city> events"). `\S` right after 'Browse ' is what
  // rejects the empty city, and `city=.+` is load-bearing -- the empty
  // `/events?city=` was the defect, and `city=` alone would satisfy a bare prefix check.
  await expect(feature.getByRole('link', { name: /Browse \S.* events/ })).toHaveAttribute(
    'href',
    /^\/events\?city=.+$/,
  );
  await expect(feature.locator('time')).toHaveCount(0);
});

test('a returning visitor sees their history and suggested places after local discovery', async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 823 });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.addInitScript(() => {
    const ts = Date.now();
    sessionStorage.setItem(
      'qg_home_region',
      JSON.stringify({ cityId: '00000000-0000-4000-8000-000000000001', cityName: 'Berlin', ts }),
    );
    localStorage.setItem(
      'qg_recently_viewed',
      JSON.stringify([{ type: 'venue', slug: 'recent-venue', title: 'Recent venue', ts }]),
    );
  });
  await page.route(
    (url) => url.hostname.startsWith('search.') && url.pathname === '/search',
    async (route) => {
      await pending;
      await route.fulfill({
        headers: { 'Access-Control-Allow-Origin': '*' },
        json: {
          hits: Array.from({ length: 4 }, (_, index) => ({
            type: 'venue',
            slug: `suggested-venue-${index}`,
            title: `Suggested venue ${index}`,
            city: 'Berlin',
            _boostReason: 'interest',
          })),
        },
      });
    },
  );

  try {
    await openHome(page);
    await loadHomeContent(page);
    const yourLines = page.getByRole('region', { name: 'Your lines' });
    // The rail is deferred; re-scroll in case the map band above grows after the
    // first scroll and pushes it back out of its viewport margin.
    await expect(async () => {
      await yourLines.evaluate((el) => el.scrollIntoView({ block: 'end' }));
      await expect(yourLines.getByRole('link', { name: 'Recent venue' })).toBeVisible({
        timeout: 3_000,
      });
    }).toPass({ timeout: 30_000 });
    // Your lines is the last band now (the intent map below it was removed), so the
    // guarded quantity is its own HEIGHT: the reserved min-height must absorb the
    // cards. Height, not a document position: the deferred map band ABOVE can mount
    // during the wait and move every position (measured 186px) without this band
    // shifting anything itself.
    const bandHeight = () => yourLines.evaluate((el) => el.getBoundingClientRect().height);
    const before = await bandHeight();
    release();
    await expect(yourLines.getByRole('link', { name: 'Suggested venue 0' })).toHaveAttribute(
      'href',
      '/venues/suggested-venue-0',
    );
    await expect(yourLines.getByText('Matches your interests').first()).toBeVisible();
    // <=1px: rounding. The defect this guards was 16px (the rail's negative margin
    // collapsing out of the reservation once the cards outgrew it).
    expect(Math.abs((await bandHeight()) - before)).toBeLessThanOrEqual(1);
  } finally {
    release();
  }
});

test('homepage requests do not generate PostgREST client errors', async ({ page }) => {
  test.setTimeout(150_000); // loadDestinations: see its comment
  const failures: string[] = [];
  page.on('response', (response) => {
    if (
      response.url().includes('/rest/v1/') &&
      response.status() >= 400 &&
      response.status() < 500
    ) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });
  await openHome(page);
  await loadDestinations(page);
  expect(failures).toEqual([]);
});

test('Arabic discovery fits a narrow viewport and keeps localized destinations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const hero = page.locator('.subway-hero');
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
    'اعثر على أماكن وفعاليات كويرية',
  );
  await expect(hero.getByRole('combobox')).toHaveAttribute(
    'placeholder',
    'ابحث عن أماكن وفعاليات…',
  );
  const map = hero.getByRole('link', { name: 'افتح الخريطة' });
  await expect(map).toBeInViewport();
  await expect(map).toHaveAttribute('href', '/ar/map');
  expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(320);
});

test('city selection recovers from a stale recent and can be reset', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'qg_recently_viewed',
      JSON.stringify([
        { type: 'city', slug: 'missing-city-e2e', title: 'Removed city', ts: Date.now() },
        { type: 'city', slug: 'berlin', title: 'Berlin', ts: Date.now() },
      ]),
    );
  });
  await page.route(
    (url) =>
      url.pathname.endsWith('/rest/v1/cities') &&
      url.searchParams.get('slug') === 'eq.missing-city-e2e',
    (route) => route.fulfill({ json: null }),
  );

  await openHome(page);
  // Wait for the plate's compact picker: before the city resolves the trigger is a
  // wider chip, and opening it mid-swap re-anchors the popover under the click.
  const cityGuide = page.locator('#home-city-feature-title a');
  await expect(cityGuide).toBeVisible();
  const cityPicker = page.getByRole('button', { name: /change city/i });
  await cityPicker.click();
  await page.getByRole('button', { name: 'Removed city', exact: true }).click();
  // The failed lookup is retried before it surfaces (measured ~4s on prod).
  await expect(page.getByText('Couldn’t load these results.')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Berlin', exact: true }).click();
  // Since 52e24db6d the picker is an icon button inside the hero's city plate, so
  // the chosen city is named by the plate's city-guide link, not by the picker.
  await expect(cityGuide).toHaveAttribute('href', '/city/berlin');

  await page.reload();
  await expect(cityGuide).toHaveAttribute('href', '/city/berlin');
  await cityPicker.click();
  await page.getByRole('button', { name: 'Use my area', exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('qg_home_region'))).toBeNull();
});

test('city labels keep the picker and adjacent link in place', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 823 });
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'qg_home_region',
      JSON.stringify({
        cityId: '00000000-0000-4000-8000-000000000001',
        cityName: 'A',
        ts: Date.now(),
      }),
    );
  });
  await openHome(page);
  await expect(page.locator('#home-city-feature-title a')).toBeVisible();
  const picker = page.getByRole('button', { name: /change city/i });
  const events = page.getByRole('link', { name: 'See all events' });
  const initialPicker = await picker.boundingBox();
  const initialEvents = await events.boundingBox();
  expect(initialPicker).not.toBeNull();
  expect(initialEvents).not.toBeNull();

  await page.evaluate(() => {
    const value = JSON.parse(sessionStorage.getItem('qg_home_region')!);
    value.cityName = 'A very long city name that needs to truncate';
    sessionStorage.setItem('qg_home_region', JSON.stringify(value));
    window.dispatchEvent(new Event('qg-home-region-changed'));
  });
  // The region name surfaces as the Events band's scope line (truncated, full name
  // in `title`); the hero picker is icon-only since 52e24db6d and never carries it.
  // Positive control: the long name really rendered before positions are compared.
  await expect(
    page.getByRole('region', { name: 'Events', exact: true }).getByTitle(/A very long city name/),
  ).toBeAttached();
  expect((await picker.boundingBox())!.width).toBe(initialPicker!.width);
  expect((await picker.boundingBox())!.x).toBe(initialPicker!.x);
  expect((await events.boundingBox())!.x).toBe(initialEvents!.x);
});

test('showing the resolved listing scope does not move the board', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 823 });
  const cityId = '00000000-0000-4000-8000-000000000001';
  const cityName = 'A very long city name that would wrap a heading';
  await page.addInitScript(
    ({ cityId, cityName }) => {
      sessionStorage.setItem(
        'qg_home_region',
        JSON.stringify({ cityId, cityName, ts: Date.now() }),
      );
    },
    { cityId, cityName },
  );

  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) =>
      url.pathname.endsWith('/rest/v1/events') &&
      url.searchParams.get('city_id') === `eq.${cityId}`,
    async (route) => {
      await pending;
      await route.fulfill({
        json: Array.from({ length: 4 }, (_, i) => ({
          id: String(i),
          slug: `fixture-event-${i}`,
          title: `Fixture event ${i}`,
          city: { id: cityId, name: cityName },
        })),
      });
    },
  );
  try {
    await openHome(page);
    const listings = page.getByRole('region', { name: 'Events', exact: true });
    const board = listings.locator('[aria-busy]');
    await expect(board).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => document.fonts.ready);
    const loadingTop = (await board.boundingBox())!.y;

    release();
    await expect(board).toHaveAttribute('aria-busy', 'false');
    await expect(board.getByRole('link', { name: 'Fixture event 0' })).toBeVisible();
    expect((await board.boundingBox())!.y).toBe(loadingTop);
  } finally {
    release();
  }
});
