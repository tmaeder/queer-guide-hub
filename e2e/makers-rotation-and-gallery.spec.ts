import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * The makers directory's ROTATION and its GALLERY/INDEX split, against the
 * DEPLOYED site.
 *
 * Deliberately narrow. `marketplace-makers-directory.spec.ts` already covers
 * the four-band rebuild, the "#" bucket filing last and the feed-ID
 * retirement; this file asserts only what #3805 added, so the two do not
 * duplicate each other or drift apart asserting the same thing twice.
 *
 * Two defects, both of which would ship looking perfectly healthy:
 *
 *   1. THE BAND NEVER CHANGED. It took the top twelve by `product_count`, so
 *      the same twelve makers led the page from the day it shipped. 94 brands
 *      clear every gate it enforces, leaving 82 unreachable — not for failing
 *      a quality bar but for selling less than the twelve above them. A frozen
 *      band and a rotating one are IDENTICAL in any single request, which is
 *      why rotation is asserted across SEEDS rather than by eye.
 *
 *   2. THE COVERLESS HALF CAN VANISH SILENTLY. The page partitions on
 *      `cover_url IS NULL` — gallery for the 657 makers with a photograph,
 *      a named index for the 214 without. A directory that filters the
 *      coverless half away leaves a gallery that looks flawless while a
 *      quarter of the catalogue is simply gone. Nothing on the page says so,
 *      which is why the positive control below is the point of the file.
 *
 * Read through the ANON PostgREST role — the same role the browser uses — so
 * this asserts what a logged-out reader is actually served. A REVOKE on either
 * function renders an empty band and an empty catalogue with no error anywhere.
 *
 * **Nightly, not `e2e-pr.yml`.** Nightly runs the whole directory against
 * `https://queer.guide`, so this is picked up with no registration. The PR job
 * serves a local `vite preview` against the live backend, where the counts
 * below are prod's and the cover thumbnails are mirrored on `img.queer.guide`,
 * which is Referer-gated and answers 1011 to any origin that is not the real
 * one.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

test.skip(!ANON_KEY, 'VITE_SUPABASE_ANON_KEY not set');

type DirectoryRow = {
  slug: string;
  display_name: string;
  product_count: number | null;
  cover_url: string | null;
};

type CoverRow = { slug: string; covers: Array<{ url: string; thumb: string | null }> };

async function rpc<T>(
  request: APIRequestContext,
  fn: string,
  body: Record<string, unknown> = {},
): Promise<T[]> {
  const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${ANON_KEY!}`,
      'Content-Type': 'application/json',
    },
    data: body,
  });
  // A 404 here is the PGRST202 shape: the function is missing, or an argument
  // was renamed. Both are silent in the browser — the band just never renders.
  expect(res.ok(), `rpc/${fn} -> HTTP ${res.status()}: ${await res.text()}`).toBeTruthy();
  return res.json();
}

// --- the catalogue ----------------------------------------------------------

test('anon can read the directory, and it carries BOTH halves of the split', async ({
  request,
}) => {
  const rows = await rpc<DirectoryRow>(request, 'get_marketplace_brand_directory');

  expect(rows.length, 'the directory is empty — anon cannot read it').toBeGreaterThan(500);

  const withCover = rows.filter((r) => r.cover_url);
  const withoutCover = rows.filter((r) => !r.cover_url);

  expect(withCover.length, 'no maker has a cover — the gallery would be empty').toBeGreaterThan(
    300,
  );

  // THE POSITIVE CONTROL. "Every maker has a photograph" is not a success
  // state, it is the signature of a directory that filtered the coverless
  // makers away — which removes a quarter of the catalogue while leaving a
  // gallery that looks flawless.
  expect(
    withoutCover.length,
    'every row has a cover — the coverless makers have been filtered out and the index half of the page is gone',
  ).toBeGreaterThan(0);

  // Every cover must be an absolute URL. A relative or empty string renders as
  // a broken tile rather than falling back to the monogram plate.
  for (const r of withCover.slice(0, 50)) {
    expect(r.cover_url, `${r.slug} has a non-absolute cover`).toMatch(/^https?:\/\//);
  }
});

test('the directory is ordered, and every maker it lists actually sells something', async ({
  request,
}) => {
  const rows = await rpc<DirectoryRow>(request, 'get_marketplace_brand_directory');

  // `product_count > 0` is not cosmetic: marketplace_brands retains rows whose
  // listings have all gone inactive, and a tile that opens onto an empty grid
  // is a dead end the reader paid a navigation for.
  const dead = rows.filter((r) => (r.product_count ?? 0) <= 0).map((r) => r.slug);
  expect(dead.slice(0, 5), 'makers with no live listings are being listed').toEqual([]);

  const counts = rows.map((r) => r.product_count ?? 0);
  expect(counts, 'the directory is not ordered by product_count').toEqual(
    [...counts].sort((a, b) => b - a),
  );
});

// --- the highlight ----------------------------------------------------------

test('anon can read the highlight band, and every tile is a full strip', async ({ request }) => {
  const rows = await rpc<CoverRow>(request, 'get_marketplace_brand_covers', { p_limit: 12 });

  expect(rows.length, 'the highlight band is empty').toBe(12);

  for (const r of rows) {
    // The RPC drops any maker that cannot fill the strip: a tile with two
    // covers reads as broken rather than as a strip.
    expect(r.covers?.length, `${r.slug} cannot fill the three-cover strip`).toBe(3);
    // Colour variants of one garment are separate listings sharing a hero
    // image, so a naive top-three yields three byte-identical thumbnails.
    expect(new Set(r.covers.map((c) => c.url)).size, `${r.slug} repeats a cover image`).toBe(3);
  }
});

test('the band ROTATES, and is stable within a seed', async ({ request }) => {
  const slugs = async (seed: number) =>
    (await rpc<CoverRow>(request, 'get_marketplace_brand_covers', { p_limit: 12, p_seed: seed }))
      .map((r) => r.slug)
      .sort()
      .join(',');

  const a1 = await slugs(1);
  const a2 = await slugs(1);
  const b = await slugs(99);

  // Stability first. `random()` is VOLATILE, so an ordering built on it
  // reshuffles on every request: a reader who scrolls and comes back finds a
  // different band, and two tabs disagree.
  expect(a2, 'the same seed returned two different windows — the band is not stable').toBe(a1);

  // Then rotation. This is the half that catches a hash ordering silently
  // collapsing to a constant — which returns twelve makers and looks entirely
  // healthy while being exactly the frozen band this replaced.
  expect(
    b,
    'two different seeds returned the same twelve makers — the band is not rotating',
  ).not.toBe(a1);
});

test('rotation reaches past one window — the 82 unreachable makers are reachable', async ({
  request,
}) => {
  // The whole point of the change. If the pool is only ever twelve deep the
  // rotation is cosmetic: it reorders the same makers and nobody new is shown.
  const seen = new Set<string>();
  for (const seed of [1, 2, 3, 5, 8, 13]) {
    const rows = await rpc<CoverRow>(request, 'get_marketplace_brand_covers', {
      p_limit: 12,
      p_seed: seed,
    });
    rows.forEach((r) => seen.add(r.slug));
  }
  expect(
    seen.size,
    'six seeds surfaced no more than one window — the pool is not being rotated over',
  ).toBeGreaterThan(12);
});

// --- the rendered page ------------------------------------------------------

test('the page renders the band, the gallery and the named index', async ({ page }) => {
  await page.goto('/marketplace/brands');

  const band = page.locator('section[aria-labelledby="makers-counter"]');
  await expect(band).toBeVisible();

  // The band rotates over everyone who qualifies, so a ranking word would be
  // false and a curation word would claim an editorial judgement nobody made.
  // This is the comment-outlives-its-data failure wearing copy.
  await expect(band).toContainText(/Not a ranking/i);
  await expect(band).not.toContainText(/most listings|featured|hand-?picked|curated/i);

  const tiles = page.locator('a[href*="/marketplace/brands/"]');
  await expect(tiles.first()).toBeVisible();
  expect(await tiles.count(), 'no maker links rendered').toBeGreaterThan(20);

  // The coverless makers are named rather than hidden. If this heading is
  // missing, either the split collapsed or the 214 were dropped.
  await expect(
    page.getByRole('heading', { name: /Makers we have no photograph of/i }),
  ).toBeVisible();
});
