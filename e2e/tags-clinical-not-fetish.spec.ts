import { test, expect } from '@playwright/test';
import { glossaryEntry } from './support/glossaryProse';
import { anonHeaders, SUPABASE_REST_URL } from './support/anonKey';

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

test.describe('@smoke clinical conditions are not fetishes', () => {
  test('the crawler sees a Sexual Health page, not a fetish', async ({ request }) => {
    const { prose: article, html } = await glossaryEntry(request, 'orgasmic-dysfunction');

    // Positive first: the page rendered its own subject. Without this the
    // negative below passes on an empty body or a 404 shell.
    expect(article, 'the tag page did not render').toMatch(/orgasm/i);
    expect(html, 'a clinical condition is filed as a fetish again').not.toMatch(/Fetish/i);
    // The category is read from the registry, not scraped out of the <article>:
    // that line is crawler chrome, and a demoted tag emits no <article> to
    // carry it. The filing is the claim; the chrome was only ever its carrier.
    const headers = await anonHeaders(request);
    const catRes = await request.get(
      `${SUPABASE_REST_URL}/rest/v1/unified_tags?slug=eq.orgasmic-dysfunction&select=category`,
      { headers },
    );
    expect(catRes.ok(), 'could not read the tag category').toBe(true);
    const cat = ((await catRes.json()) as Array<{ category: string | null }>)[0]?.category ?? '';
    expect(cat, 'a clinical dysfunction must not publish under Fetishes').not.toMatch(/fetish/i);
    expect(cat).toMatch(/Sexual Health/i);

    // INDEXABILITY IS NO LONGER ASSERTED DIRECTLY, and not because it stopped
    // mattering. The guarantee this line defends — "the fix re-filed the page,
    // it did not quietly hide it" — is now carried by glossaryEntry(), which
    // FAILS when a tag serves no crawler <article> while the registry still
    // calls it publication_role='article'. What it tolerates is the deliberate
    // correctness-first demotion (utility, pending an authoritative source),
    // which is policy rather than a regression. See e2e/support/glossaryProse.ts.
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
