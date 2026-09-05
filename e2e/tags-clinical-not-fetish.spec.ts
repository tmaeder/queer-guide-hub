import { test, expect } from '@playwright/test';

// A clinical condition must not publish as a fetish, and must not sit behind an
// 18+ gate.
//
// `/tags/orgasmic-dysfunction` is `seo_indexable` and carries seven diagnostic
// codes — ICD-11 HA02.0, ICD-10 F52.3, ICD-9 302.73/302.74, SNOMED CT 62607004,
// ICPC-2 P08, DiseasesDB 23879. It was filed under **Fetishes**, so the crawler
// body read `Category: Fetishes` over prose that opens "Anorgasmia is a type of
// sexual dysfunction…". Two changes fixed it, and the second exists because the
// first was not enough:
//
//   #3389  merged the duplicate `anorgasmia` in and re-filed the survivor to
//          Sexual Health by writing `category_id`.
//   #3396  deleted the Fetishes JUNCTION that write left behind. The AFTER
//          trigger only DEMOTES the old primary to is_primary=false, and
//          `unified_tags_recompute_is_adult()` matches ANY assignment — so the
//          category text read Sexual Health while the row stayed 18+.
//
// That second failure is the one worth a permanent test: it is invisible in the
// category text, which is the thing everyone looks at.
//
// THE AGE GATE IS AN SPA BEHAVIOUR, NOT A CRAWLER ONE. Adult tags carry no
// robots noindex — measured on prod: `fisting` and `cruising` are both `is_adult`
// and both serve `robots: none` to a bot. So the crawler half of this spec can
// only assert the filing, and the gate has to be driven in a real page. Hence
// the split, and hence the positive control: "no age modal appeared" also passes
// on a page that failed to load, so a tag that MUST gate is asserted in the same
// run.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function articleOf(html: string): string {
  return html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? '';
}

/**
 * Tag-stripped, whitespace-collapsed text.
 *
 * Required, not cosmetic: the crawler renders the label as
 * `<p><strong>Category:</strong> Sexual Health</p>`, so a regex for
 * `Category:\s*Sexual Health` never matches the raw HTML — it failed on the
 * first run of this spec against a page that was perfectly correct.
 */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test.describe('@smoke clinical conditions are not fetishes', () => {
  test('the crawler sees a Sexual Health page, not a fetish', async ({ request }) => {
    const res = await request.get('/tags/orgasmic-dysfunction', {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();
    const article = articleOf(html);

    // Positive first: the page rendered its own subject. Without this the
    // negative below passes on an empty body or a 404 shell.
    expect(article, 'the tag page did not render').toMatch(/orgasm/i);
    expect(textOf(article)).toMatch(/Category:\s*Sexual Health/i);

    // The defect, stated on the whole document rather than the article, because
    // the category also appears in nav and JSON-LD.
    expect(html, 'a clinical condition is filed as a fetish again').not.toMatch(/Fetish/i);

    // It is still meant to be indexed — the fix must not have quietly hidden
    // the page instead of re-filing it.
    expect(html, 'the page was deindexed rather than re-filed').not.toMatch(
      /<meta name="robots"[^>]*noindex/i,
    );
  });

  test('the merged duplicate still resolves', async ({ request }) => {
    // `anorgasmia` keeps its slug as a redirect trail. A 404 here would mean the
    // merge took a live URL out of circulation — the failure 20261015110000 had
    // to undo once already, on sildenafil.
    const res = await request.get('/tags/anorgasmia', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    expect(new URL(res.url()).pathname).toBe('/tags/orgasmic-dysfunction');
    // Paired with the title, because a soft-404 is served as 200 on this site
    // and would otherwise satisfy the redirect assertion.
    expect(await res.text()).toMatch(/<title>Orgasmic Dysfunction/i);
  });

  test('vaginismus is not filed as a fetish either', async ({ request }) => {
    // Same residue, from the 2026-08-29 alias-shadow cleanup rather than #3389 —
    // which is what makes it a class and not a one-off. Deindexed for unrelated
    // reasons, so only the filing is asserted here.
    const res = await request.get('/tags/vaginismus', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toMatch(/Fetish/i);
  });

  test('no 18+ affirmation stands in front of it, while a real kink tag still gates', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem('qg_age_affirmation');
      } catch {
        /* ignore */
      }
    });

    // THE POSITIVE CONTROL RUNS FIRST, deliberately. If the gate mechanism were
    // broken or the fixture had stopped being adult, the negative assertion
    // below would pass for the wrong reason and this spec would quietly assert
    // nothing. `age-play` is filed under Practices & Play, an
    // ADULT_CATEGORY_NAMES member.
    await page.goto('/tags/age-play');
    await expect(
      page.getByTestId('age-affirmation-modal'),
      'the age gate itself is not working — the negative below would be vacuous',
    ).toBeVisible({ timeout: 20_000 });

    // The actual assertion: a clinical sexual-health page does not demand an
    // 18+ affirmation. This is the reader-facing effect of deleting the leftover
    // Fetishes junction; nothing on the crawler surface shows it.
    await page.goto('/tags/orgasmic-dysfunction');
    await expect(page.getByRole('heading', { name: /orgasmic dysfunction/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByTestId('age-affirmation-modal'),
      'a clinical condition is behind an 18+ gate',
    ).toHaveCount(0);
  });
});
