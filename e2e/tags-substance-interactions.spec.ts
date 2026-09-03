import { test, expect } from '@playwright/test';

// `/tags/interactions` and the per-tag combinations band — the surfaces fed by
// `public.substance_interactions`.
//
// WHY THIS EXISTS. The table had **no e2e coverage at all** before this file,
// on a page whose entire purpose is answering "can I combine these two?". It
// also had no cron: 421 TripSit rows were loaded once by `20260909172500` and
// nothing re-read them for two weeks, which is what `source-tripsit` and the
// staleness sentinel in `check-pipeline-health.mjs` now fix. A recurring
// *writer* against safety content needs a reader-side guard, and this is it.
//
// THESE RUN AGAINST PRODUCTION. `playwright.config.ts` defaults `baseURL` to
// https://queer.guide. Both surfaces render client-side from RPCs
// (`substance_interaction_matrix`, `get_substance_interactions`) and are absent
// from the crawler HTML by design, so a plain GET cannot see them — this needs
// a real browser. Values below were measured against prod on 2026-08-30.
//
// THE FLOORS ARE DELIBERATELY BELOW THE MEASURED NUMBERS. They exist to catch a
// sync that *destroys* rows, not to pin an exact count that ordinary growth
// would break. A refresh can only add pairs; if these ever go down, something
// deleted safety ratings.

const RENDER = { timeout: 20_000 };

test.describe('@smoke substance interactions', () => {
  test('the interaction chart renders real data and discriminates between pairs', async ({
    page,
  }) => {
    await page.goto('/tags/interactions');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/interaction chart/i, RENDER);

    // The grid states its own dimensions: "N substances, C combinations".
    // Prod measured 51 / 476 on 2026-08-30. Parsing them rather than matching a
    // fixed string is what makes this a data guard instead of a copy guard.
    const hint = page.locator('text=/\\d+ substances, \\d+ combinations/');
    await expect(hint).toBeVisible(RENDER);
    const hintText = (await hint.first().textContent()) ?? '';
    const [, substances, combos] = hintText.match(/(\d+) substances, (\d+) combinations/) ?? [];
    expect(Number(substances), 'substances on the axis').toBeGreaterThanOrEqual(45);
    expect(Number(combos), 'interaction pairs rendered').toBeGreaterThanOrEqual(460);

    // The grid is a real table with row headers, not a simulated one — a screen
    // reader has to announce "MDMA, Alcohol, Caution" rather than read 900
    // unlabelled cells.
    await expect(page.getByRole('table')).toBeVisible(RENDER);
    await expect(page.getByRole('rowheader').first()).toBeVisible();

    // The checker is the part people actually use. MDMA + MAOIs is the pair the
    // schema migration itself uses as a fixture and it is a genuine
    // contraindication — serotonin syndrome / hypertensive crisis.
    const selects = page.locator('select');
    await expect(selects).toHaveCount(2, RENDER);
    await selects.nth(0).selectOption({ label: 'MDMA' });
    await selects.nth(1).selectOption({ label: 'MAOIs' });
    await expect(page.getByText(/MDMA \+ MAOIs: Dangerous/i)).toBeVisible(RENDER);

    // ...and it must DISCRIMINATE. Asserting only the dangerous pair would pass
    // just as well against a page that rendered "Dangerous" unconditionally,
    // which on this page would be a safety defect of its own kind — a chart
    // that cries wolf is a chart people stop reading.
    await selects.nth(0).selectOption({ label: 'Cannabis' });
    await selects.nth(1).selectOption({ label: 'LSD' });
    await expect(page.getByText(/Cannabis \+ LSD: Dangerous/i)).toHaveCount(0);
    await expect(page.getByText(/Cannabis \+ LSD: /i)).toBeVisible(RENDER);

    // Absence is its own answer and must never read as "safe".
    await expect(page.getByText(/no entry for that pair|no information, not a clean bill/i)).toHaveCount(
      0,
      { timeout: 1000 },
    );

    // Attribution is a column on every row, not a footnote.
    const credit = page.getByTestId('interaction-credit');
    await expect(credit).toBeVisible(RENDER);
    await expect(credit.locator('a', { hasText: /^TripSit$/ })).toHaveAttribute(
      'href',
      /tripsit/i,
    );
  });

  // THE ATTRIBUTION GUARD FOR THE FULL GRID.
  //
  // This page credited ALL 476 cells to TripSit — `substance_interaction_matrix()`
  // returned `'source','tripsit'` as a LITERAL, so the footer read "Interaction
  // data researched and published by TripSit" over a grid that also holds 48
  // eve&rave Substanzhandbuch ratings and 7 FDA-label ones. 55 safety claims
  // attributed to an organisation that never made them.
  //
  // THE EXPECTED LIST IS DERIVED FROM THE PAGE'S OWN RPC RESPONSE, never from a
  // list written here. A hardcoded ['TripSit','eve&rave…','FDA label'] would go
  // green on the day a fourth source lands and is silently omitted from the
  // credit — which is precisely the defect, one source later. Reading the
  // response also means the assertion needs no API key and no DB access.
  //
  // THE RULE IS "the credit names exactly the sources the response exposes, one
  // each" — a property of the page against its own data, not a fixed list.
  //
  // Its shape is a record of a deadlock worth not repeating. The first draft
  // opened with `expect(Array.isArray(matrix.sources))`, but `Critical paths`
  // is a REQUIRED check that builds this branch against the LIVE backend, so
  // that assertion could not pass until the migration adding `sources` had
  // already merged — a check that only goes green after the merge it blocks.
  // It was rewritten to read whatever provenance the response offered, which
  // held against both envelopes and let the migration land.
  //
  // That accommodation is now retired: `20261207100000` deleted the scalars, so
  // requiring `sources` is simply true, and the assertion is back to its
  // strongest form with no deadlock left to dodge. **A compatibility branch is
  // temporary by construction — delete it when the thing it tolerated is gone**,
  // or it silently becomes the fallback for a state that should fail loudly.
  test('the grid credits every source in it, exactly once each', async ({ page }) => {
    const rpc = page.waitForResponse(
      (r) => r.url().includes('substance_interaction_matrix') && r.status() === 200,
      { timeout: 20_000 },
    );
    await page.goto('/tags/interactions');
    const matrix = await (await rpc).json();

    // `sources` is REQUIRED, and asserting that is now correct rather than a
    // deadlock. This read the array `?? [{source: matrix.source, …}]` while the
    // RPC still returned those top-level scalars — necessary at the time, since
    // `Critical paths` builds this branch against the LIVE backend and the
    // migration adding `sources` had not merged yet. `20261207100000` then
    // DELETED both scalars, so the fallback became unreachable and this spec was
    // their last reader in the repo.
    //
    // Reinstating it would be worse than dead code: `matrix.source` was a
    // literal 'tripsit' over a grid where 55 of 476 cells are eve&rave or FDA,
    // so a fallback would reconstruct exactly the single-source provenance that
    // migration removed — and it would do it silently, at the moment `sources`
    // went missing, which is precisely when the test should fail instead.
    expect(
      Array.isArray(matrix.sources),
      'substance_interaction_matrix must return a sources array (20261207100000)',
    ).toBe(true);

    // `tripsit` is the one key the importers store lowercase; everything else is
    // stored display-ready. Mirrors `sourceLabel` in src/lib/substanceRisk.ts.
    const label = (s: string) => (s === 'tripsit' ? 'TripSit' : s);

    const expected = [
      ...new Set(
        (matrix.sources as Array<{ source?: string; source_url?: string }>)
          .filter((s) => s.source && s.source_url)
          .map((s) => label(s.source as string)),
      ),
    ].sort();

    // Guards every assertion below from passing on an empty envelope: without
    // this, a response carrying no provenance at all would make "0 links == 0
    // sources" trivially true.
    expect(expected.length, 'the response must expose at least one credited source').toBeGreaterThan(
      0,
    );
    expect(matrix.cells.length, 'and it must actually hold cells').toBeGreaterThanOrEqual(460);

    const credit = page.getByTestId('interaction-credit');
    await expect(credit).toBeVisible(RENDER);

    // Every source present is NAMED — the half that was broken.
    for (const name of expected) {
      await expect(credit).toContainText(name);
    }

    // ...and the count matches, which is the half that catches the OTHER
    // failure mode: the per-tag band once deduped by URL and printed "FDA
    // label, FDA label, FDA label, FDA label", because the 7 FDA rows cite four
    // different DailyMed documents. Names in, names out, one each.
    const links = credit.locator('a');
    await expect(links).toHaveCount(expected.length);
    expect((await links.allInnerTexts()).map((s) => s.trim()).sort()).toEqual(expected);

    // A credit with no destination is not a credit.
    for (let i = 0; i < expected.length; i++) {
      await expect(links.nth(i)).toHaveAttribute('href', /^https?:\/\//);
    }
  });

  // THE MULTI-SOURCE GUARD, and the sharpest assertion in this file.
  //
  // `substance_interactions` is multi-source: 421 TripSit rows, 48 eve&rave
  // Substanzhandbuch, 7 FDA labels. `substance_interactions_pair_uniq` spans
  // ALL of them, so an ordinary `ON CONFLICT DO UPDATE` in a TripSit refresh
  // would silently overwrite another source's rating *and its attribution*.
  // `sync_tripsit_interactions` skips such a pair instead and reports it.
  //
  // /tags/methamphetamine is the page that proves it end to end: measured on
  // prod, it carries 10 interactions and **not one of them is TripSit** — all
  // ten are eve&rave. If a refresh ever clobbers the other sources, this page
  // empties out, and no unit test in the repo would notice.
  test('a tag whose combinations come entirely from a non-TripSit source still renders', async ({
    page,
  }) => {
    await page.goto('/tags/methamphetamine');

    const combos = page.locator('#combinations');
    await expect(combos).toBeVisible(RENDER);
    await expect(combos).toContainText(/Mixing Methamphetamine/i, RENDER);

    // The three dangerous ones, by name. These are eve&rave rows; TripSit's
    // chart does not cover methamphetamine at all.
    for (const other of ['MAOIs', 'Opioids', 'Tramadol']) {
      await expect(combos).toContainText(new RegExp(other, 'i'));
    }
    await expect(combos).toContainText(/Dangerous/i);

    // The credit must name the source that actually produced these rows. If
    // this ever reads "TripSit", a refresh has taken the rows over.
    await expect(combos).toContainText(/eve&rave/i);
    await expect(combos.locator('a', { hasText: /^TripSit$/ })).toHaveCount(0);
  });
});
