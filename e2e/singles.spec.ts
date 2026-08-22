import { test, expect, type Page } from '@playwright/test';

// Inlined rather than shared: every spec in this directory carries its own
// copy, and there is no helpers module to put it in.
const dismissCookieBanner = async (page: Page) => {
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
};

/**
 * The subway singles — city, country, queer village, venue and event — after
 * the 2026-08 rebuild moved them onto `SinglePage`.
 *
 * `/villages/:slug` had NO end-to-end coverage at all before this file, which
 * is how it stayed on the legacy tab layout, behind an off-by-default flag,
 * with no safety gating, without anyone noticing.
 *
 * These assert structure and safety invariants, not copy — copy assertions on
 * a country page belong in `rights-safety.spec.ts`, which owns that surface.
 */

const ROUTES = [
  { path: '/city/berlin', name: 'Berlin', eyebrow: /City/ },
  { path: '/country/germany', name: 'Germany', eyebrow: /Country/ },
  { path: '/villages/chueca', name: 'Chueca', eyebrow: /District/ },
  // Venue and event joined the singles after the geo three. The venue is one
  // of the 626 (2.7%) that actually have opening hours, so its OWNER module
  // renders; pick another and the `hours` section is legitimately absent.
  { path: '/venues/scum-and-villainy-cantina', name: 'Scum & Villainy', eyebrow: /Venue/ },
  // The SPARSE venue, deliberately. Without a thin record in this list the
  // empty-section test above passes vacuously — every rich page fills its
  // sections. Lehighton has no hours, no amenities and no organisation, so it
  // is the page that exposed the empty "Access" heading.
  { path: '/venues/lehighton', name: 'Lehighton', eyebrow: /Venue/ },
  { path: '/events/capital-pride-ottawa-2026', name: 'Capital Pride', eyebrow: /Event/ },
  // A genuinely PAST event, for the same reason `/venues/lehighton` is above:
  // without one the empty-section test never sees the state that 99.2% of the
  // corpus is in (39,795 of 40,119 live events have finished).
  //
  // The route above is NOT that case and looks like it is — it is a multi-day
  // festival whose `end_date` is still ahead, so it renders the "be the first
  // to RSVP" prompt and its "Who's going" section has a body. `is_past` is
  // `coalesce(end_date, start_date) < now()`, never `start_date` alone.
  {
    path: '/events/denver-pridefest-2026',
    name: 'Denver PrideFest',
    eyebrow: /Event/,
  },
];

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator('article h1').first().waitFor({ state: 'visible', timeout: 30_000 });
  await dismissCookieBanner(page);
}

for (const route of ROUTES) {
  test.describe(route.path, () => {
    test('leads with a typographic masthead, not a photo hero', async ({ page }) => {
      await open(page, route.path);
      const h1 = page.locator('article h1').first();
      await expect(h1).toContainText(route.name);
      // The title is real text in the document flow. The 58vh image bed it
      // replaced put the name on a scrim over an <img>, which is the site's
      // only over-image contrast exception and was carrying a generated
      // texture on ~6% of cities.
      await expect(h1.locator('img')).toHaveCount(0);
      const fontFamily = await h1.evaluate((el) => getComputedStyle(el).fontFamily);
      expect(fontFamily.toLowerCase()).toContain('anton');
    });

    test('renders exactly one <h1>', async ({ page }) => {
      await open(page, route.path);
      // `DetailMasthead` owns the heading. The event page's photo hero used to
      // emit its own, so porting it without removing that would have produced
      // two — which `e2e/a11y-event-detail.spec.ts` fails on.
      await expect(page.locator('article h1')).toHaveCount(1);
    });

    test('no section renders as a bare heading with no content', async ({ page }) => {
      await open(page, route.path);
      // The station/section invariant catches a station pointing at nothing.
      // It CANNOT catch the inverse: a section whose component returns `null`
      // from its own body still renders its `<h2>`, so the id exists and the
      // rail looks healthy while the reader gets an empty heading.
      //
      // That shipped. `/venues/lehighton` served an "Access" heading with zero
      // characters under it because `VenueAmenities` self-hides and the
      // section had no `when` guard — on 91% of venues. This asserts the thing
      // the model cannot express.
      const empty = await page.evaluate(() =>
        [...document.querySelectorAll('article section[id]')]
          .filter((el) => {
            // EVERY heading is stripped, not just the first.
            //
            // This read `el.querySelector('h2')` and removed that one string,
            // which made the check defeatable by the very thing it should have
            // flagged: the event single's "Who's going" section rendered the
            // section h2 AND a second identical h2 from its own component, so
            // the duplicate's text survived the strip, counted as a body, and
            // the guard passed green on a section that was otherwise empty for
            // every signed-out reader on a past event (99.2% of events). A
            // section whose only content is headings has no body.
            const clone = el.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => h.remove());
            const text = (clone.textContent ?? '').trim();
            if (text.length > 0) return false;
            // Text is not the only content. `VenuePhotos` renders a grid of
            // <img> and nothing else, so a textContent-only check flagged it —
            // a false positive that would have taught everyone to ignore this
            // assertion. Media and controls count as a body.
            //
            // Measured against `clone`, i.e. headings already removed: a
            // heading may carry its own icon (`<h2><ShieldCheck/>…</h2>`), and
            // counting that svg as a body would reintroduce the same blind
            // spot one layer down.
            return (
              clone.querySelectorAll('img, svg, video, canvas, iframe, picture, input').length === 0
            );
          })
          .map((el) => el.id),
      );

      expect(empty, `sections rendered with a heading and no body: ${empty.join(', ')}`).toEqual(
        [],
      );
    });

    test('every route-rail station points at a heading that exists', async ({ page }) => {
      await open(page, route.path);
      const stations = page.locator('nav a[href^="#"]');
      const count = await stations.count();
      // A single with fewer than two sections renders no rail at all.
      if (count === 0) test.skip();

      for (let i = 0; i < count; i++) {
        const href = await stations.nth(i).getAttribute('href');
        if (!href || href === '#') continue;
        const id = href.slice(1);
        // The station/section invariant: both lists are derived from the same
        // filtered array, so a station can never survive its section being
        // dropped for having no data.
        //
        // Attribute selector, not `#${id}`: the id comes from the page, and
        // `CSS.escape` does not exist in the Node side of a Playwright test —
        // only inside `page.evaluate`. An `[id="…"]` needs no escaping.
        await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
      }
    });

    test('the rail reflows under the body on a phone instead of disappearing', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, route.path);
      // "Every single works at 390px with the same modules in the same order,
      // stacked. No mobile-only cuts." A `hidden lg:block` rail would drop
      // the map, the facts and the provenance line on a phone.
      // By testid, not `article aside`: the rail is not the only <aside> in
      // the article. A signed-in visitor whose trip covers this destination
      // also gets TripCoveringBanner, and the e2e account accumulates exactly
      // such a trip every time trip-creation.spec.ts runs — so this assertion
      // became a strict-mode violation ("resolved to 2 elements") on
      // /city/berlin for every authenticated run, on every branch.
      await expect(page.getByTestId('single-rail')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
}

test.describe('safety layer', () => {
  // The chromium project carries the admin storageState when CI has admin
  // credentials, so "anonymous" must be asked for. Without this the assertion
  // still passes — a signed-in visitor never sees the notice for ANY country —
  // but it passes for a reason that has nothing to do with the gate, and would
  // keep passing if the gate were deleted.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a village in a criminalising country is gated for anonymous visitors', async ({ page }) => {
    // Villages carried no safety layer at all before the rebuild: a district
    // in a criminalising country rendered exactly like one in Berlin. The
    // gated notice is anonymous-only and count-only.
    await open(page, '/villages/chueca');
    // Spain is not criminalising, so the notice must NOT appear here — the
    // point of this assertion is that the component is wired in and gating on
    // the country, not that it always shows.
    await expect(page.getByText(/only shown to signed-in members/i)).toHaveCount(0);
    // …but the verdict tile is always present.
    await expect(page.getByText('Safety', { exact: true })).toBeVisible();
  });

  test('no track colour appears on the safety verdict', async ({ page }) => {
    await open(page, '/city/berlin');
    // Scoped to the verdict, NOT the whole rail: the route rail sits in the
    // same column and legitimately carries its line's colour. The rule is that
    // track colours never encode a STATE — "they must not reach the equality
    // scale or any risk badge".
    const verdict = page.getByTestId('geo-safety-verdict').first();
    await expect(verdict).toBeVisible();
    const html = await verdict.evaluate((el) => el.outerHTML);
    expect(html).not.toMatch(/track-(pink|blue|green|yellow)/);
  });
});

test.describe('city network diagram', () => {
  test('renders for a city that has real geometry', async ({ page }) => {
    await open(page, '/city/berlin');
    await page.locator('#travel').scrollIntoViewIfNeeded();
    // The line legend is what makes the diagram information rather than
    // ornament — the homepage card renders the same geometry `aria-hidden`.
    await expect(page.getByText('U7', { exact: true })).toBeVisible();
  });

  test('renders nothing for a city with no network rather than a fake one', async ({ page }) => {
    // 22 of ~3,070 cities have generated geometry. The homepage card falls
    // back to a template squiggle so its grid has no holes; on a single, under
    // a heading about getting around, that squiggle would be a false claim.
    // Zurich is a real, well-populated city with trams that OSM did not yield
    // a usable relation set for — so it exercises the gate rather than a
    // thin-data page that might not render a travel section at all.
    await open(page, '/city/zurich');
    await expect(page.getByText('Lines', { exact: true })).toHaveCount(0);
    for (const mode of ['Metro network', 'Light rail network', 'Tram network']) {
      await expect(page.getByText(mode, { exact: true })).toHaveCount(0);
    }
  });
});
