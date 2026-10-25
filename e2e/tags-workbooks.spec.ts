import { reviewerTagRows, hasReviewerSession } from './support/reviewerRegistry';
import { glossaryEntry } from './support/glossaryProse';
/**
 * Output-level guard for the glossary workbooks, against prod.
 *
 * WHAT THIS ASSERTS THAT NO UNIT TEST CAN
 *
 * The unit guard reads migration source and component source. It cannot tell
 * you what a crawler is actually served. The single most important property of
 * this feature is that a workbook PROMPT is public content while an ANSWER
 * never leaves its owner, and the crawler surface is where a leak would show
 * up — `functions/_lib/detail.ts` fetches with the SERVICE ROLE, which bypasses
 * RLS entirely, so RLS is not what protects the answers there. What protects
 * them is that the renderer never reads the table at all. That absence is only
 * observable from outside.
 *
 * EVERY NEGATIVE ASSERTION HERE CARRIES A POSITIVE CONTROL
 *
 * "No answer text in the HTML" is equally true of a page that rendered nothing
 * — a 404, a sign-in gate, an outage. So each case first proves the page
 * rendered its own prose, then asserts the absence. Without that pairing this
 * whole file would pass against a dead route, which is the failure mode this
 * repo has recorded repeatedly.
 *
 * ANON-READABILITY WAS MEASURED, NOT ASSUMED
 *
 * All five host terms carry `is_sensitive = false`, so `tag_is_anon_gated` is
 * false for each and the crawler gets a real page rather than the sign-in
 * fallback. A sensitive term would serve `gatedDetailResult()` and every
 * assertion below would pass vacuously.
 *
 * This paragraph said "all four host terms" and added `verification_status in
 * ('reviewed','auto')`; re-measured on prod 2026-10-16, there are FIVE hosts and
 * `kink-burnout` is `unverified`. The gate is `is_sensitive AND NOT
 * reviewed/locked`, so `is_sensitive = false` alone is what makes all five
 * readable — the verification half was never load-bearing here, and quoting it
 * would make a correct row look like a regression the day it is reviewed.
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'https://queer.guide';
const CRAWLER = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** The five host terms and the workbook each carries. */
const HOSTS = [
  { tag: 'negotiation', workbook: 'contract-preparation' },
  { tag: 'consensual-non-consent-cnc', workbook: 'cnc-negotiation-menu' },
  { tag: 'scene', workbook: 'scene-plan' },
  { tag: 'chastity', workbook: 'chastity-first-four-days' },
  { tag: 'kink-burnout', workbook: 'burnout-reset' },
] as const;

/**
 * Prompt fragments that exist ONLY in `tag_workbook_steps.prompt_md`. If any of
 * these reaches a crawler, the band has grown a server-side emission.
 *
 * Deliberately phrases a reader would never find in ordinary tag prose, so a
 * match is evidence rather than coincidence.
 */
const PROMPT_FRAGMENTS = [
  'What are you afraid this will cost you?',
  'What is off the table permanently',
  'How does either of you end this',
  'What is this four days for?',
  'Which rituals are holding something up',
  'What would make you stop early even without a safeword?',
];

async function crawl(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': CRAWLER } });
  return { status: res.status, html: await res.text() };
}

/**
 * The `DefinedTerm` JSON-LD node a crawler is served for a readable tag, or null.
 *
 * THIS IS THE POSITIVE CONTROL, and it replaced an assertion on
 * `<main data-prerendered="bot-ua">` + `<article>` that COULD NOT PASS FOR ANY
 * TAG. `functions/_middleware.ts:593` computes `isBot = indexable && isBotUserAgent(...)`
 * and only that branch injects `detail.body`, while `indexable` (line 432) is
 * vetoed by the row's own `seo_indexable` — and `tagDetail` returns
 * `indexable: row.seo_indexable !== false`. All five hosts are
 * `seo_indexable=false`, so the body is never injected and the marker never
 * appears. Measured on prod 2026-10-16: 0 occurrences on all five hosts, 1 on
 * `/city/berlin`, which is indexable. It had failed every scheduled nightly
 * since the file shipped.
 *
 * `tags-gated-sign-in.spec.ts` had already measured this on 2026-09-04 and
 * recorded the same conclusion — "that block is absent from BOTH a gated tag and
 * a readable one ... asserting its presence would fail nightly while proving
 * nothing" — and reached for `DefinedTerm` for exactly this reason. This file was
 * written a month later and did not inherit it.
 *
 * The JSON-LD discriminates where the body cannot, because
 * `_middleware.ts:527` pushes `detail.jsonLd` with NO indexability gate, and
 * `gatedDetailResult()` sets `jsonLd: ''`. Measured three ways on prod the same
 * day: readable host → present with this term's `name`/`url`/`description`;
 * gated term (`rainbow-kiss`, `sex-worker`, `labia`) → absent, title "Sign in to
 * view"; nonexistent slug → HTTP 404, absent.
 *
 * It is also the right surface rather than a convenient one: `description`
 * carries the term's own prose, so a prompt emitted server-side into a tag's
 * description WOULD land here. The absence asserted below is checked against a
 * document that could have leaked.
 */
function definedTermOf(html: string): { name?: string; description?: string; url?: string } | null {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue; // A malformed block is not this term's document.
    }
    for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
      if (
        node &&
        typeof node === 'object' &&
        (node as { '@type'?: string })['@type'] === 'DefinedTerm'
      ) {
        return node as { name?: string; description?: string; url?: string };
      }
    }
  }
  return null;
}

test.describe('workbook prompts never reach a crawler', () => {
  for (const { tag } of HOSTS) {
    test(`/tags/${tag} serves its own prose and no workbook prompt`, async ({ request }) => {
      const { status, html } = await crawl(`/tags/${tag}`);
      expect(status).toBe(200);
      const gated = /<title>Sign in to view(?: \||<)/i.test(html);
      let prose = '';
      let published = false;
      if (gated) {
        expect(html).toMatch(/name=["']robots["'][^>]*content=["'][^"']*noindex/i);
        expect(definedTermOf(html), 'A sign-in gate must not leak term metadata').toBeNull();
        if (hasReviewerSession) {
          const rows = await reviewerTagRows<{ status: string; long_description: string }>(
            request,
            `slug=eq.${tag}&select=status,long_description`,
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].status).toBe('active');
          prose = rows[0].long_description;
        }
      } else {
        ({ prose, published } = await glossaryEntry(request, tag));
      }

      // ── POSITIVE CONTROL ──────────────────────────────────────────────────
      // Without this, "no prompt text" is also true of a 404 or a gate. See
      // definedTermOf() for why this is the JSON-LD and not the body.
      const term = definedTermOf(html);
      if (published) {
        expect(term, `/tags/${tag} published no DefinedTerm`).not.toBeNull();
        expect(term!.url ?? '').toContain(`/tags/${tag}`);
        expect((term!.description ?? '').length).toBeGreaterThan(0);
      }
      if (!gated || hasReviewerSession) {
        expect(prose.trim().length, 'The readable term carries its own prose').toBeGreaterThan(0);
      }

      // ── THE ASSERTION ─────────────────────────────────────────────────────
      for (const fragment of PROMPT_FRAGMENTS) {
        expect(html, `workbook prompt leaked to a crawler: "${fragment}"`).not.toContain(fragment);
        expect(prose, `workbook prompt leaked to glossary prose: "${fragment}"`).not.toContain(
          fragment,
        );
      }
      // Nor any trace of the tables themselves.
      expect(html).not.toContain('tag_workbook');
      expect(html).not.toContain('get_tag_workbooks');
    });
  }
});

test.describe('the runner is gated and unlisted', () => {
  for (const { workbook } of HOSTS) {
    test(`/tools/workbook/${workbook} shows no prompt to an anonymous visitor`, async () => {
      const { status, html } = await crawl(`/tools/workbook/${workbook}`);
      // The SPA shell answers 200 for any in-app route; what matters is that
      // the body carries no prompt and no answer.
      expect(status).toBeLessThan(500);
      for (const fragment of PROMPT_FRAGMENTS) {
        expect(html, `the runner leaked "${fragment}" to an anonymous request`).not.toContain(
          fragment,
        );
      }
    });
  }

  test('neither /tools/workbook nor /tools/checklist is in the sitemap', async () => {
    const res = await fetch(`${BASE}/sitemap-static.xml`);
    expect(res.status).toBe(200);
    const xml = await res.text();
    // POSITIVE CONTROL: the sitemap has real entries, so the absences below
    // are not an empty document.
    expect(xml).toContain('<loc>');
    expect(xml.match(/<loc>/g)!.length).toBeGreaterThan(5);

    expect(xml).not.toContain('tools/workbook');
    expect(xml).not.toContain('tools/checklist');
  });

  test('the glossary sitemap does not list a deindexed host term', async () => {
    // All five hosts are seo_indexable=false, and sitemap-tags filters on that,
    // so a host term appearing here would mean the filter stopped applying.
    //
    // This said "all five hosts are publication_role='utility', which forces
    // seo_indexable=false". Re-measured on prod 2026-10-16: four are 'utility'
    // and `consensual-non-consent-cnc` is 'article', yet all five are
    // seo_indexable=false. The role is not what this test rests on, and naming
    // it as the cause would send the next reader to the wrong column.
    const res = await fetch(`${BASE}/sitemap-tags.xml`);
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<loc>'); // control: the sitemap is populated
    for (const { tag } of HOSTS) {
      expect(xml, `${tag} is deindexed but listed in the tag sitemap`).not.toContain(
        `/tags/${tag}<`,
      );
    }
  });
});

test.describe('the reveal RPCs are not reachable anonymously', () => {
  // Both are `revoke all ... from public, anon` + `grant execute to
  // authenticated`, so an unauthenticated POST must be refused rather than
  // returning an empty result — an empty 200 here would mean anon holds EXECUTE
  // and is simply seeing no rows, which is a very different posture.
  const ANON = process.env.E2E_SUPABASE_ANON_KEY;
  const URL = process.env.E2E_SUPABASE_URL;

  test('workbook_compare refuses an anonymous caller', async () => {
    test.skip(!ANON || !URL, 'needs E2E_SUPABASE_URL + E2E_SUPABASE_ANON_KEY');
    const res = await fetch(`${URL}/rest/v1/rpc/workbook_compare`, {
      method: 'POST',
      headers: {
        apikey: ANON!,
        Authorization: `Bearer ${ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_workbook_id: '00000000-0000-0000-0000-000000000000',
        p_other: '00000000-0000-0000-0000-000000000000',
      }),
    });
    // 401/403 (no privilege) or 404 (PostgREST hides a function anon cannot
    // execute). Never 200.
    expect([401, 403, 404]).toContain(res.status);
  });

  test('but get_tag_workbooks IS reachable anonymously — the content half', async () => {
    // The mirror. If this were also refused, the band could never render for a
    // signed-out reader and every absence above would be meaningless.
    test.skip(!ANON || !URL, 'needs E2E_SUPABASE_URL + E2E_SUPABASE_ANON_KEY');
    const res = await fetch(`${URL}/rest/v1/rpc/get_tag_workbooks`, {
      method: 'POST',
      headers: {
        apikey: ANON!,
        Authorization: `Bearer ${ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_tag_id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test('tag_workbook_answers is unreachable anonymously as a TABLE', async () => {
    // No anon grant at all, so this is refused by privilege rather than by
    // policy — a policy edit cannot re-expose it.
    test.skip(!ANON || !URL, 'needs E2E_SUPABASE_URL + E2E_SUPABASE_ANON_KEY');
    const res = await fetch(`${URL}/rest/v1/tag_workbook_answers?select=body&limit=1`, {
      headers: { apikey: ANON!, Authorization: `Bearer ${ANON}` },
    });
    expect(res.status).not.toBe(200);
  });
});
