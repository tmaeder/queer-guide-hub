/**
 * Strip the glossary auto-linker's anchors out of crawler HTML before a PROSE
 * assertion runs against it.
 *
 * WHY THIS EXISTS. `/tags/:slug` prose is rewritten on render so that any word
 * which is itself a glossary term becomes a link:
 *
 *     ... <a href="/tags/consent" data-glossary-link="consent">consent</a> to ...
 *
 * A phrase assertion against the raw HTML therefore breaks the day one of its
 * words becomes a tag — with the sentence still intact on the page and nothing
 * wrong with the content. Measured on prod 2026-09-19, three specs were red for
 * exactly this and only this:
 *
 *   /tags/stealthing  "consent to protected sex is not consent to unprotected sex"
 *   /tags/k-hole      "cannot consent to anything"
 *   /tags/doxy-pep    "cisgender women"
 *
 * All three sentences were published, correct and complete; `consent` and
 * `cisgender` had simply become linked terms since the specs were written.
 *
 * WHY IT REMOVES ONLY THESE ANCHORS, rather than stripping every tag. A blanket
 * tag strip also removes `<article>` boundaries, href values and attribute text,
 * which would weaken every NEGATIVE assertion in the same file — a check that
 * silently starts passing is worse than the red it replaced. Removing one
 * element class and keeping its inner text cannot add prose, so a positive
 * assertion can only go from wrongly-failing to passing, and a negative one
 * loses only text that was never prose.
 *
 * The non-greedy body is safe because glossary anchors are never nested —
 * `e2e/glossary-inline-links.spec.ts` asserts that directly, and that spec is
 * the one place this helper must NOT be used: it tests these anchors, so
 * removing them would gut it.
 *
 * Callers should keep a positive control that the raw HTML still carried
 * `data-glossary-link` at all. If the renderer ever renames the attribute this
 * helper becomes a silent no-op, and the phrase assertions go back to being
 * one glossary term away from red.
 */
import { expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders, SUPABASE_REST_URL } from './anonKey';

export const GLOSSARY_LINK_ATTR = 'data-glossary-link';

/** The crawler-indexed body of a detail page, or '' when none was served. */
export function articleOf(html: string): string {
  const m = html.match(/<article[\s\S]*?<\/article>/i);
  return m ? m[0] : '';
}

export function unlinkGlossary(html: string): string {
  return html.replace(/<a\b[^>]*\bdata-glossary-link=[^>]*>([\s\S]*?)<\/a>/gi, '$1');
}

/* -------------------------------------------------------------------------- */

/**
 * Read a glossary entry's prose from whichever surface currently publishes it.
 *
 * WHY THIS EXISTS. Every glossary spec asserted its content facts against the
 * crawler `<article>`, because that was the only published body when they were
 * written. `99991789930799_glossary_publication_readiness_completion` changed
 * that: an active tag is demoted to `publication_role='utility'` — and
 * deindexed — until it has a description, reviewed prose, a category, an
 * authoritative source where one is required, and ontology/localisation
 * decisions. Measured on prod 2026-10-05: **6,648 active tags carry
 * `publication_role:utility` and 1,196 remain indexable.**
 *
 * `functions/_middleware.ts` only injects the prerendered body when the page is
 * indexable (`const isBot = indexable && isBotUserAgent(...)`), so a demoted tag
 * is served the bare SPA shell with a correct `<head>` and no `<article>`. That
 * took 40 nightly tests red across eight spec files — `/tags/prep`,
 * `/tags/chemsex`, `/tags/ghb` and the rest of the harm-reduction set are all
 * demoted for one reason, `source_required` with `source_review_status =
 * 'required_missing'`: a clinical claim with no citation behind it.
 *
 * **That policy is right and must not be reversed to make tests green.** The
 * demotion is also reversible — each tag flips back to `article` when its
 * citation lands — so pinning an assertion to either state guarantees the spec
 * breaks again on the way back.
 *
 * WHAT IS ASSERTED INSTEAD. The content fact, against the surface that serves
 * it, plus the publication contract:
 *
 *   - published (`article`)  -> the crawler `<article>` must exist and carry it
 *   - demoted  (`utility`…)  -> the response must SAY so (`noindex`) and the
 *                               registry must agree, and the prose is read from
 *                               `unified_tags` as anon
 *
 * The second branch is what keeps this from becoming a check that passes either
 * way: a missing `<article>` is only accepted when the server declares the page
 * noindex AND `publication_role` is genuinely not `article`. An *accidental*
 * deindex — the regression these specs were written to catch — still fails,
 * because the registry would still say `article`.
 *
 * The reader surface is deliberately NOT used: `/tags/chemsex` renders an
 * 18+ interstitial for an anonymous visitor (measured), so a rendered-page
 * assertion would be gated on adult tags and silently weaker on exactly the
 * harm-reduction entries that matter most.
 */
export interface GlossaryEntry {
  /** Crawler `<article>` when published, else the registry prose. */
  prose: string;
  /** Whether the crawler is served a real body for this slug. */
  published: boolean;
  /** Raw crawler HTML, for callers that assert on the head or the whole page. */
  html: string;
}

const GLOSSARY_BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

export async function glossaryEntry(
  request: APIRequestContext,
  slug: string,
): Promise<GlossaryEntry> {
  const res = await request.get(`/tags/${slug}`, {
    headers: { 'User-Agent': GLOSSARY_BOT_UA },
  });
  expect(res.status(), `/tags/${slug} should resolve`).toBe(200);

  const html = await res.text();
  const article = articleOf(html);
  if (article) return { prose: unlinkGlossary(article), published: true, html };

  // No crawler body. Legitimate only when the page says it is not indexed AND
  // the registry agrees the tag is not an article.
  expect(
    html,
    `/tags/${slug} serves no <article> and no noindex either — the crawler body ` +
      `is missing without the page declaring it unpublished`,
  ).toMatch(/name=["']robots["'][^>]*content=["'][^"']*noindex/i);

  const headers = await anonHeaders(request);
  const row = await request.get(
    `${SUPABASE_REST_URL}/rest/v1/unified_tags` +
      `?slug=eq.${encodeURIComponent(slug)}` +
      `&select=publication_role,seo_indexable,description,short_description,long_description`,
    { headers },
  );
  expect(row.ok(), `could not read /tags/${slug} from the registry`).toBe(true);
  const rows = (await row.json()) as Array<{
    publication_role: string | null;
    description: string | null;
    short_description: string | null;
    long_description: string | null;
  }>;
  expect(rows.length, `/tags/${slug} has no registry row at all`).toBe(1);

  expect(
    rows[0].publication_role,
    `/tags/${slug} is still publication_role='article' but serves no crawler ` +
      `<article> — this is an ACCIDENTAL deindex, not the correctness-first gate`,
  ).not.toBe('article');

  const prose = [rows[0].description, rows[0].short_description, rows[0].long_description]
    .filter(Boolean)
    .join('\n\n');
  expect(
    prose,
    `/tags/${slug} is unpublished AND has no prose in the registry — the entry is empty`,
  ).not.toBe('');

  return { prose, published: false, html };
}
