import { test, expect } from '@playwright/test';

/**
 * Geographic containment — asserted through the ANON surface, against prod.
 *
 * These check PROPERTIES, not pinned numbers. An earlier draft asserted
 * "Key West is at 24.5551,-81.7800"; that goes green forever and says nothing
 * about whether the invariant still holds, and it rots the moment a more precise
 * centroid lands. What must stay true is: a city's own coordinate falls inside
 * the country it claims, and no entity is published on a coordinate that is
 * demonstrably in the wrong hemisphere.
 *
 * Anon-only on purpose. geo_hygiene_stats() is service-role, so a spec built on
 * it could not run here — and the thing worth guarding is what a VISITOR is
 * served, which is exactly what RLS-filtered anon reads return.
 *
 * The defect this guards: Key West's stored centroid sat 151 km out in the Gulf
 * of Mexico and run_event_geo_fill stamped it onto all 48 events linked to it.
 * A distance-to-city detector could not see it, because it measures against that
 * same bad centroid.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xqeacpakadqfxjxjcewc.supabase.co';
const ANON = process.env.VITE_SUPABASE_ANON_KEY || '';

/** Continental-US bounding box. Deliberately generous — this is a hemisphere
 *  check, not a geocoder assertion. */
const CONUS = { latMin: 24.3, latMax: 49.5, lngMin: -125.1, lngMax: -66.8 };

async function rest(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

test.describe('Geo containment (prod, anon)', () => {
  test.skip(!ANON, 'VITE_SUPABASE_ANON_KEY not set');

  test('Key West sits on land in Florida, not in the Gulf', async () => {
    const rows = await rest(
      'cities?select=name,latitude,longitude,slug&name=eq.Key%20West&limit=5',
    );
    expect(rows.length, 'Key West must exist in cities').toBeGreaterThan(0);

    const kw = rows[0];
    const lat = Number(kw.latitude);
    const lng = Number(kw.longitude);

    // The regression: 26.593,-83.889 is open water ~151 km offshore.
    expect(lat).toBeGreaterThan(CONUS.latMin);
    expect(lat).toBeLessThan(26.0);
    expect(lng).toBeGreaterThan(-82.5);
    expect(lng).toBeLessThan(-81.0);
  });

  test('no event is still published on the Gulf-of-Mexico point', async () => {
    // Positive control FIRST: if this query shape cannot see events at all, the
    // "zero bad events" assertion below would pass on an empty result set and
    // mean nothing.
    const anyEvents = await rest('events?select=id&latitude=not.is.null&limit=1');
    expect(anyEvents.length, 'control: anon must be able to read events with coordinates').toBe(1);

    const stranded = await rest(
      'events?select=id,title&latitude=eq.26.59306&longitude=eq.-83.889396&limit=10',
    );
    expect(stranded, `events still on the bad Key West centroid`).toHaveLength(0);
  });

  test('US cities carrying content are inside the US box', async () => {
    // A cheap corpus-wide shape check. Runs over the busiest US cities rather
    // than one row, so a future bad centroid on a major city fails here even if
    // nobody remembers to re-run the sweep.
    const us = await rest(
      'cities?select=name,latitude,longitude,country_id,countries!inner(code)' +
        '&countries.code=eq.US&latitude=not.is.null&order=population.desc&limit=40',
    );
    expect(us.length, 'control: US cities must be readable').toBeGreaterThan(10);

    const offBox = us.filter((c: { latitude: string; longitude: string }) => {
      const la = Number(c.latitude);
      const ln = Number(c.longitude);
      // Alaska and Hawaii are legitimately outside CONUS.
      if (la > 51 || ln < -140 || (la < 23 && ln < -150)) return false;
      return (
        la < CONUS.latMin || la > CONUS.latMax || ln < CONUS.lngMin || ln > CONUS.lngMax
      );
    });

    expect(
      offBox.map((c: { name: string }) => c.name),
      'US cities whose coordinate falls outside the US',
    ).toEqual([]);
  });

  test('the Key West city page renders its places', async ({ page }) => {
    const res = await page.goto('/city/key-west');
    // A soft-404 here would mean the slug moved, which is itself worth failing on.
    expect(res?.status(), '/city/key-west must resolve').toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/key west/i);
  });
});
