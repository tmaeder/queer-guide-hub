import { test, expect } from '@playwright/test';

// The reader-facing outcome of two reviewed tag passes, asserted on the surface a
// crawler actually indexes.
//
//   20261229104200  merged `orgasmic-dysfunction` into `anorgasmia` and took a clinical
//                   sexual dysfunction off the Fetishes shelf. It had been publishing
//                   `Category: Fetishes` over a Diagnostic codes band carrying ICD-11
//                   HA02.0, indexably, on a queer health glossary.
//   20261229104300  dispositioned all 27 aliases whose slug was a live tag's slug:
//                   9 merges and 18 alias deletes.
//   20261229104400  sealed the producer so the set cannot regrow a third time.
//
// WHY THIS EXISTS AS AN E2E AND NOT ONLY AS DB ASSERTIONS. The migrations already assert
// their own postconditions against the tables. What no in-transaction check can see is
// whether the *edge* resolves the slug — `resolve_tag_slug` is one hop, but
// `functions/_lib/detail.ts` filters redirect targets on `status='active'`, so a merge
// into a non-active row 404s in one hop rather than redirecting. The whole value of the
// merge half of this work is that /tags/<loser> keeps resolving; that is a live-URL
// property and only a live URL can prove it.
//
// TWO ASSERTIONS PER CASE, ALWAYS. "The request ended at /tags/mdma" is satisfied by a
// soft-404, which this site serves as HTTP 200 — so the landing slug is paired with the
// page TITLE, which a not-found page cannot fake ("Page not found · Queer Guide").
// Where the surviving page is indexable the prose is checked too; where it is not, the
// crawler emits no <article> at all and a prose assertion would be vacuous, so those
// cases deliberately stop at identity.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function titleOf(html: string): string {
  return html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '';
}

function articleOf(html: string): string {
  return html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? '';
}

/** A slug that must keep resolving, and where it must land. */
interface Landing {
  from: string;
  /** Final slug. Same as `from` for the rows this pass deliberately left alone. */
  to: string;
  /** Page title of the surviving tag — the half a soft-404 cannot satisfy. */
  title: string;
  /** Prose fingerprint, only where the surviving page is indexable. */
  present?: RegExp;
  /** Prose that would mean the wrong page answered. */
  absent?: RegExp[];
  why: string;
}

// ---------------------------------------------------------------- the 9 merges
// Each loser keeps its slug as a redirect trail. A 404 here means the merge took a
// live URL out of circulation, which is the failure mode 20261015110000 had to undo
// once already.
const MERGED: Landing[] = [
  {
    from: 'orgasmic-dysfunction',
    to: 'anorgasmia',
    title: 'Anorgasmia',
    present: /orgasm/i,
    // The whole point of the change: the surviving page is not filed under Fetishes.
    absent: [/Category:\s*Fetishes/i],
    why: 'Q1772397 labels as anorgasmia; orgasmic dysfunction is one of its aliases',
  },
  {
    from: 'bisexuell',
    to: 'bisexual',
    title: 'Bisexual',
    present: /attraction/i,
    why: 'German twin; unified_tags.name is the English label by design',
  },
  { from: 'gayfriendly', to: 'lgbt-friendly', title: 'LGBT-Friendly', why: 'German-feed spelling of the descriptor' },
  { from: 'gewalt', to: 'violence', title: 'Violence', present: /force|aggress/i, why: "Q98034423's German label is Gewalt" },
  { from: 'musik', to: 'music', title: 'Music', why: 'German twin, Q638' },
  {
    from: 'ecstasy',
    to: 'mdma',
    title: 'MDMA',
    present: /stimulant|tablet/i,
    // The losing row's description was a scraped Wikipedia disambiguation page.
    absent: [/Religious ecstasy/i, /Ecstasy \(philosophy\)/i],
    why: 'same item Q69488, label MDMA; precedent crystal-meth -> methamphetamine',
  },
  { from: 'femdom', to: 'female-dominance', title: 'Female Dominance', why: 'same item Q1404482, label "female dominance"' },
  { from: 'bimbofication', to: 'bimboification', title: 'Bimboification', why: 'orthographic variant; winner already held the QID and prose' },
  {
    from: 'priligy',
    to: 'dapoxetine',
    title: 'Dapoxetine',
    present: /premature ejaculation/i,
    why: 'brand row was a byte-for-byte copy of the generic, the zoloft/paxil/stendra shape',
  },
  {
    from: 'prozac',
    to: 'fluoxetine',
    title: 'Fluoxetine',
    present: /antidepressant|serotonin/i,
    why: 'same as priligy',
  },
];

// ------------------------------------------------------- the pages left standing
// These are the 18 alias deletes. Deleting a shadowing alias must NOT move a page —
// `resolve_tag_slug` never consults `tag_aliases`, so the URL was never routed by it.
// If any of these starts redirecting, an alias delete was silently turned into a merge.
const UNMOVED: Landing[] = [
  {
    from: 'gbl',
    to: 'gbl',
    title: 'GBL',
    present: /fatal|stronger/i,
    // Its `covers` alias + search synonym used to rewrite GBL queries to GHB, while
    // this page carries the distinction that a matching volume can kill.
    absent: [/^GHB \|/],
    why: 'a covers alias must not route a term that has its own page',
  },
  {
    from: 'sildenafil',
    to: 'sildenafil',
    title: 'Sildenafil',
    present: /nitrite|nitrate|poppers/i,
    why: 'the unmerge of 20261015110000 restored this page; its alias kept rewriting search away from it',
  },
  { from: 'sertraline', to: 'sertraline', title: 'Sertraline', present: /serotonin/i, why: 'covers alias, but it has its own page' },
  { from: 'sub', to: 'sub', title: 'Sub', why: 'an organisation name in Berlin/Augsburg listings, not the kink abbreviation' },
  { from: 'voyeur', to: 'voyeur', title: 'Voyeur', why: 'deliberately revived as the person beside the practice' },
  { from: 'mosh', to: 'mosh', title: 'Mosh', why: 'its alias routed moshing to a page about injecting drugs' },
  { from: 'frottage', to: 'frottage', title: 'Frottage', why: 'kept separate; merging would need a QID move' },
  { from: 'danseur', to: 'danseur', title: 'Danseur', why: 'a sex position, not the French for a performer' },
  { from: 'villa', to: 'villa', title: 'Villa', why: 'Q3950 (a building), not Q3957 (town)' },
  { from: 'pretzel', to: 'pretzel', title: 'Pretzel', why: 'a kink role, not Q160525 the pastry' },
  { from: 'coach', to: 'coach', title: 'Coach', why: 'a kink role, not Q41583 the sports coach' },
];

async function fetchTag(request: import('@playwright/test').APIRequestContext, slug: string) {
  const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
  const html = await res.text();
  return { res, html, title: titleOf(html), article: articleOf(html) };
}

test.describe('@smoke tag shadow-alias dispositions', () => {
  for (const c of [...MERGED, ...UNMOVED]) {
    const label = c.from === c.to ? `/tags/${c.from} stays itself` : `/tags/${c.from} resolves to /tags/${c.to}`;

    test(`${label} — ${c.why}`, async ({ request }) => {
      const { res, html, title, article } = await fetchTag(request, c.from);

      expect(res.status(), `/tags/${c.from} must resolve`).toBe(200);

      // Identity, both halves. The landing slug alone is satisfied by a soft-404
      // (served as 200); the title is what a not-found page cannot satisfy.
      expect(new URL(res.url()).pathname, `/tags/${c.from} landed on the wrong slug`).toBe(
        `/tags/${c.to}`,
      );
      expect(title, `/tags/${c.from} did not render the ${c.to} page`).toContain(c.title);
      expect(title, `/tags/${c.from} is a not-found page`).not.toMatch(/Page not found/i);

      // A deindexed tag emits no <article>, so prose assertions would be vacuous
      // against an empty string. Several of these are correctly not indexable.
      if (!article) {
        test.info().annotations.push({
          type: 'note',
          description: `/tags/${c.to} is deindexed — asserted identity only`,
        });
        return;
      }

      if (c.present) {
        expect(article, `/tags/${c.to} did not render its own subject`).toMatch(c.present);
      }
      for (const re of c.absent ?? []) {
        expect(html, `/tags/${c.to} still carries ${re}`).not.toMatch(re);
      }
    });
  }

  // The defect the whole anorgasmia change existed to remove, stated once on its own
  // rather than folded into the case above: a page carrying clinical diagnostic codes
  // must not be filed as a fetish.
  test('the clinical sexual dysfunction is filed under Sexual Health, not Fetishes', async ({
    request,
  }) => {
    const { res, html } = await fetchTag(request, 'anorgasmia');
    expect(res.status()).toBe(200);
    expect(html, 'anorgasmia is still filed under Fetishes').not.toMatch(/Category:\s*Fetishes/i);
    expect(html, 'anorgasmia lost its category').toMatch(/Category:\s*Sexual Health/i);
  });
});
