import { test, expect } from '@playwright/test';

// A gated glossary term must answer a signed-out reader "sign in", not "no such
// thing" — and must still answer a crawler with nothing.
//
// `unified_tags_public_gated_read` admits anon only when a tag is non-sensitive
// OR its `verification_status` is 'reviewed'/'locked'. Measured on prod
// 2026-09-03: 101 active tags are sensitive AND unverified — the glossary cohort
// created by 20261211100000 / 100100 / 20261217100000 — and every one HARD 404'd
// for a signed-out visitor while rendering in full for a signed-in one. A real
// term was indistinguishable from a typo.
//
// Discipline copied from tags-positions-gated.spec.ts and tags-wrong-sense.spec.ts:
// raw HTTP (~0.4s a GET, and signed-out by construction — the default project
// carries an admin storageState when creds are set, which is exactly the trap
// that broke earlier signed-out specs), and every negative paired with a
// POSITIVE CONTROL, because "does not contain the definition" is vacuously true
// of a 404 and of an empty body.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** `<meta name="robots" content="...">`, lower-cased, or '' when absent. */
function robotsOf(html: string): string {
  const m = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i);
  return m ? m[1].toLowerCase() : '';
}

/** The crawler-visible prerender block; '' when the edge injected none. */
function prerendered(html: string): string {
  const m = html.match(/<main data-prerendered="bot-ua">([\s\S]*?)<\/main>/i);
  return m ? m[1] : '';
}

// Four of the 101, spread across both creating migrations.
const GATED = ['footjob', 'anal-whore', 'gag-slut', 'spit-slut'];

test.describe('@safety gated glossary terms', () => {
  for (const slug of GATED) {
    test(`/tags/${slug} answers a sign-in gate, not a 404`, async ({ request }) => {
      const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
      // The status is the whole finding. 404 here means the edge conceded the
      // term does not exist and the SPA never mounted, so no gate can render.
      expect(res.status(), `${slug} must not 404 for a signed-out visitor`).toBe(200);

      const html = await res.text();
      // Still withheld from the index — a sign-in wall is not a page to rank,
      // and these rows are seo_indexable=false deliberately.
      expect(robotsOf(html), `${slug} must stay noindex`).toContain('noindex');
      // And the prose itself must not travel. The row is unreviewed
      // machine-written material about an explicit act; `seo_indexable=false`
      // suppresses indexing, not the bytes we hand over.
      //
      // Assert the placeholder IS there before asserting the term is not:
      // "does not contain footjob" passes just as happily on an empty
      // prerender block, which is the vacuous-absence trap this file opens by
      // naming.
      const block = prerendered(html).toLowerCase();
      expect(block, 'the edge must inject the gated placeholder').toContain(
        'only available to signed-in members',
      );
      expect(block).not.toContain(slug.replace(/-/g, ' '));
    });
  }

  test('a signed-out reader is offered sign-in, not "no such term"', async ({ browser }) => {
    // Explicitly sessionless: the default project inherits an admin
    // storageState when E2E creds are configured, and a signed-in browser
    // renders the term normally — which would pass this spec for the wrong
    // reason and hide the regression completely.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const res = await page.goto('/tags/footjob');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /sign in to view this term/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/nothing in the glossary is filed under/i)).toHaveCount(0);
    // The place-gate copy must never appear on a glossary term: it would tell a
    // reader that a kink term carries legal risk for travel.
    await expect(page.getByText(/heightened legal risk/i)).toHaveCount(0);
    await ctx.close();
  });

  // POSITIVE CONTROL. `kink` is sensitive too, but reviewed, so anon reads it.
  // Without this the spec above passes on a site where every tag is gated.
  test('a reviewed sensitive term still renders in full', async ({ request }) => {
    const res = await request.get('/tags/kink', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(prerendered(html).toLowerCase()).toContain('kink');
    expect(html).not.toMatch(/sign in to view this term/i);
  });

  // NEGATIVE CONTROL. The 404 must still exist. If `gated_entity_exists` ever
  // answered true too broadly, every typo would get a sign-in gate and the
  // glossary would lose its 404 entirely.
  test('an unknown slug is still a hard 404', async ({ request }) => {
    const res = await request.get('/tags/asdfgibberish-not-a-real-tag-90210', {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(res.status()).toBe(404);
  });

  // A merged tag is gated-shaped but is NOT gated — it has a live canonical one
  // hop away, and a sign-in gate there would swallow the 301.
  test('a merged slug still 301s rather than offering a gate', async ({ request }) => {
    const res = await request.get('/tags/rack', { headers: { 'User-Agent': BOT_UA } });
    expect(res.url()).toContain('/tags/risk-aware-consensual-kink');
    expect(await res.text()).not.toMatch(/sign in to view this term/i);
  });
});
