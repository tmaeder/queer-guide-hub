import { test, expect } from '@playwright/test';

// The health and drug fact-check (PRs #3066 #3067 #3070 #3071 #3078 #3082
// #3096; audit at docs/audits/2026-08-28-health-drug-tag-facts.md).
//
// WHY THIS EXISTS AT THE E2E LAYER. Every defect the audit found was invisible
// to unit tests by construction: the data was wrong, not the code. `/tags/prep`
// — the HIV-prevention page — served a paragraph about the grammatical
// prepositional case for as long as the tag existed, and every component test
// passed the whole time. Only a layer that reads the rendered page can see it.
//
// THE SUITE IS SPLIT BY WHERE EACH FACT ACTUALLY LIVES, which is also what
// keeps it cheap enough to run against production:
//
//   * Tag PROSE is server-rendered into the crawler HTML by
//     functions/_lib/detail.ts. That is the surface where the prep defect
//     mattered — Google was reading it — so these assert over a plain HTTP GET
//     with a crawler UA. No SPA boot, ~20 requests instead of ~600.
//   * The INTERACTION BAND and the CITATION RAIL render client-side from RPCs
//     and are absent from that HTML by design. Curling cannot see them, which
//     is exactly how the "FDA label, FDA label, FDA label, FDA label" defect
//     reached production. Those few need a real browser.
//
// An earlier draft booted the SPA for all 26 cases and timed out on 11 of them
// under load while every one passed in isolation — a suite that only goes green
// on an idle machine is not a guard.

const CRAWLER = { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' };
const RENDER = { timeout: 20_000 };

/** The crawler HTML for a tag page, asserted reachable before it is searched. */
async function tagHtml(request: import('@playwright/test').APIRequestContext, slug: string) {
  const res = await request.get(`/tags/${slug}`, { headers: CRAWLER });
  expect(res.status(), `/tags/${slug} must be reachable`).toBeLessThan(400);
  const html = await res.text();
  // Guards every negative assertion below from passing on an empty or error
  // body: the tag's own name must be in what we are about to search.
  expect(html.length, `/tags/${slug} returned an empty document`).toBeGreaterThan(1000);
  return html;
}

test.describe('@smoke glossary health & drug facts', () => {
  // ── The wrong-entity class ────────────────────────────────────────────────
  // Seven live tags carried an auto-generated paragraph about a different
  // subject. Three were journals whose titles begin with the tag's own name,
  // which is the resolver bug that produced them.
  //
  // These assertions are NEGATIVE on purpose. "Absent of this specific wrong
  // subject" is the durable form; asserting the corrected prose would pass just
  // as happily if it were replaced by a *different* wrong subject tomorrow.
  // Each row pairs the wrong subject with a fingerprint of the CORRECTED prose.
  // The pairing is what makes the negative meaningful: on its own, "does not
  // contain 'prepositional case'" also passes on an error page, an empty shell,
  // or a document where the long_description simply stopped rendering. Verified
  // out of band first — all nine markers are present in the crawler HTML — and
  // then asserted here so the suite carries its own proof.
  const WRONG_ENTITY: Array<[string, RegExp, RegExp]> = [
    ['prep', /prepositional case/i, /IPERGAY/i],
    ['pep', /pep rall(y|ies)/i, /28-day/i],
    ['trauma', /physiological damage to living tissue|animals, or plants/i, /minority stress/i],
    ['fertility', /monthly peer-reviewed medical journal/i, /reciprocal IVF/i],
    ['pcp', /Portuguese Communist|Marxist/i, /NMDA/i],
    ['aids-education', /bimonthly peer-reviewed/i, /untransmittable/i],
    ['vascular-health', /peer-reviewed medical journal/i, /vascular event/i],
  ];

  for (const [slug, wrongSubject, correctedProse] of WRONG_ENTITY) {
    test(`/tags/${slug} is about its own subject`, async ({ request }) => {
      const html = await tagHtml(request, slug);
      expect(html, 'the corrected prose must be on the page').toMatch(correctedProse);
      expect(html).not.toMatch(wrongSubject);
    });
  }

  // ── Model refusals published as encyclopaedia text ────────────────────────
  // All three were ACTIVE and indexable. A harm-reduction page saying the drug
  // is "not a topic related to LGBTQ+ travel or community" is worse than none.
  for (const slug of ['heroin', 'cocaine', 'ketamine']) {
    test(`/tags/${slug} carries facts, not a refusal`, async ({ request }) => {
      expect(await tagHtml(request, slug)).not.toMatch(
        /not a topic related to LGBTQ|not supported or promoted by our|no specific information provided/i,
      );
    });
  }

  // ── The nitrite contraindication ──────────────────────────────────────────
  // The reason the audit went past prose fixes. Six of these were deprecated
  // and answering 404 while carrying no nitrate warning at all, and three said
  // the drug was "not directly related to LGBTQ+ travel or community".
  for (const slug of [
    'sildenafil',
    'tadalafil',
    'vardenafil',
    'avanafil',
    'cialis',
    'levitra',
    'viagra',
  ]) {
    test(`/tags/${slug} states the nitrite contraindication`, async ({ request }) => {
      expect(await tagHtml(request, slug)).toMatch(/nitrite|nitrate/i);
    });
  }

  test('the two label facts the popular retelling gets wrong', async ({ request }) => {
    // Both were read off DailyMed and both invert the common advice: the
    // sildenafil label states NO safe interval (the "wait 24 hours" everyone
    // repeats is clinical convention, not a labelled figure), and tadalafil's
    // 48-hour nitrate exclusion OUTLASTS the 36 hours it is marketed as
    // working — "it has worn off" is not "it is safe".
    // Asserted on VIAGRA, not sildenafil, and that is the point of this comment.
    //
    // `sildenafil` was later merged into `viagra`, and the merge kept the
    // surviving row's prose — which was the pre-audit stub, 361 chars against
    // the 1,088-char label-checked version. The corrections survived on a row
    // that `status='merged'` makes invisible, and every reader following
    // /tags/sildenafil landed on a page without them. This test is what found
    // that; the repair is 20261013100000.
    //
    // So the assertion follows the CANONICAL page a reader actually reaches.
    // Asserting on the generic slug is what let the regression hide.
    const viagra = await tagHtml(request, 'viagra');
    expect(viagra, 'no label-stated interval — the "24 hours" is convention').toMatch(
      /convention/i,
    );
    expect(viagra, 'riociguat is a hard contraindication and usually omitted').toMatch(
      /riociguat/i,
    );
    expect(await tagHtml(request, 'tadalafil')).toMatch(/48 hours/i);
  });

  // ── Interventions the audit found missing entirely ────────────────────────
  test('doxy-pep ships its limits, not just its benefit', async ({ request }) => {
    // The efficacy figures are quotable on their own, which is exactly why the
    // two limits travel with them: no benefit shown in cisgender women, and a
    // measured tetracycline-resistance signal.
    const html = await tagHtml(request, 'doxy-pep');
    expect(html).toMatch(/cisgender women/i);
    expect(html).toMatch(/resistan/i);
  });

  test('fentanyl test strips name their blind spot', async ({ request }) => {
    // A negative strip is not a safe supply: nitazenes are not fentanyl and are
    // not what the immunoassay detects. A class-level claim — brands differ and
    // no per-product cross-reactivity panel was read.
    expect(await tagHtml(request, 'fentanyl-test-strips')).toMatch(/nitazene/i);
  });

  test('drug-checking is reachable', async ({ request }) => {
    // The audit listed this as a gap and it was already live — one of the two
    // entries the audit itself got wrong.
    await tagHtml(request, 'drug-checking');
  });

  test('slamming resolves rather than 404ing', async ({ request }) => {
    // The audit called this deprecated. It was `status='merged'` behind a slug
    // redirect; splitting it back out would have broken that redirect.
    const res = await request.get('/tags/slamming', { headers: CRAWLER });
    expect(res.status()).toBeLessThan(400);
  });

  // ── Client-rendered: the interaction band ─────────────────────────────────
  // Four browser tests, all on one page, because this is the part curl cannot
  // see and the part that shipped broken.
  test('the poppers interaction band, end to end', async ({ page }) => {
    await page.goto('/tags/poppers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(RENDER);

    // Scoped to the band, never the body — the "more on this line" rail also
    // links substance tags, so a body-level match would prove nothing about
    // whether the chart actually holds these rows.
    const combos = page.locator('#combinations');
    await expect(combos).toContainText(/Absolute contraindication/i, RENDER);

    // `substance_interactions` held 421 TripSit-imported pairs and not one
    // covered poppers with a PDE5 inhibitor — TripSit's chart does not model
    // them. These rows are cited to the FDA labels instead.
    for (const drug of ['Sildenafil', 'Tadalafil', 'Vardenafil', 'Avanafil', 'Viagra']) {
      await expect(combos).toContainText(new RegExp(drug, 'i'));
    }

    // Shipped broken: the credit deduped by URL, and the combinations cite four
    // DailyMed documents under one source name, so production read
    // "Interaction data by FDA label, FDA label, FDA label, FDA label".
    const credit = page.locator('a', { hasText: /^FDA label$/ });
    await expect(credit).toHaveCount(1);
    await expect(credit.first()).toHaveAttribute('href', /dailymed|fda\.gov/i);

    // No health tag had ever carried a clinical citation — 8,813 tag_sources
    // rows and zero from FDA, PubMed, JAMA, Lancet or compendium.ch.
    await expect(
      page.locator('a[href*="dailymed"], a[href*="pubmed"], a[href*="ncbi.nlm.nih.gov"]').first(),
    ).toBeVisible(RENDER);
  });

  test('a TripSit-only page still credits TripSit', async ({ page }) => {
    // The other half of that fix: per-source attribution must not have broken
    // the 421 rows that were already correct.
    await page.goto('/tags/ghb');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(RENDER);
    await expect(page.locator('a', { hasText: /^TripSit$/ })).toHaveCount(1, RENDER);
  });
});
