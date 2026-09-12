/**
 * Detail-route SSR for crawlers. Pattern-matches the pathname to a content
 * type, fetches the matching row from Supabase, and produces:
 *   - per-route <title> + <meta name="description">
 *   - <h1> + body content for #root injection (bot UA only)
 *   - schema.org JSON-LD for the head
 *
 * If the row isn't found or Supabase isn't configured, returns null and the
 * middleware falls back to the slug-derived static fallback in routeMeta.ts.
 */
import { fetchRows, type Env } from './sitemap';
import {
  glossaryHref,
  segmentGlossaryText,
  type FindGlossaryLinksOptions,
  type GlossaryLinkTerm,
} from '../../src/lib/glossaryLinks';
import { getGlossaryVocabulary } from './glossaryVocabulary';
import { SITE_ORIGIN, DEFAULT_OG_IMAGE, type RouteMeta } from './routeMeta';
import { safeOgImage } from './safeOgImage';
import { categoryLabel, categoryLabelTitle } from './categoryLabels';

export type DetailResult = {
  meta: RouteMeta;
  body: string;
  jsonLd: string;
  /**
   * Per-row indexability (P1.1). When false, the middleware emits a
   * <meta name="robots" content="noindex,nofollow"> and skips hreflang
   * alternates. Source: the row's seo_indexable column (default true).
   */
  indexable?: boolean;
};

const TITLE_SUFFIX = ' | Queer Guide';
const MAX_TITLE = 60;

/** Mirrors STATUS_LABEL in src/components/tags/TagLegalSource.tsx. A repeal
 *  marker is not decoration — "adopted 1993" alone is a wrong claim about what
 *  the law is today, and the crawler view must not make it. */
const LAW_STATUS_LABEL: Record<string, string> = {
  in_force: 'In force',
  repealed: 'Repealed',
  superseded: 'Superseded',
  partially_invalidated: 'In force, partly struck down',
};
const MAX_DESC = 155;

/**
 * Safety layer — a high-risk-country (safety_gated) venue/event must never leak
 * its content to crawlers via the bot-prerender path. We return a non-null,
 * `indexable:false` result with NO entity-specific meta/body/JSON-LD: the
 * middleware then emits noindex,nofollow and injects nothing identifying, while
 * the SPA still mounts for humans and shows the GatedDetailFallback sign-in gate.
 * Returning null is wrong here — the middleware hard-404s a null detail on a
 * detail path, which would break the human sign-in gate.
 */
function gatedDetailResult(): DetailResult {
  return {
    meta: {
      title: `Sign in to view${TITLE_SUFFIX}`,
      description: 'This content is only available to signed-in members on Queer Guide.',
      ogImage: safeOgImage(DEFAULT_OG_IMAGE),
    },
    body: '<main data-prerendered="bot-ua"><p>This content is only available to signed-in members.</p></main>',
    jsonLd: '',
    indexable: false,
  };
}

/**
 * Distinguish a genuinely-missing slug from a gated row the PostgREST key can't
 * see. On prod the Pages function reads with the anon key, so RLS hides a gated
 * venue/event → fetchOne returns null and the middleware would hard-404
 * (wrong: the place exists, the user just needs to sign in). The anon-callable
 * boolean RPC `gated_entity_exists` reports existence without leaking any row
 * data, so we can return a non-null gated placeholder instead — which lets the
 * middleware serve the SPA shell (humans get the GatedDetailFallback sign-in
 * gate) while bots still receive noindex + no real content.
 *
 * `tag` is gated for a different reason than the places above — sensitive prose
 * no human has reviewed, not a criminalising jurisdiction — but the question
 * this asks is the same one: does a row exist here that anon RLS hides?
 */
async function isGatedEntity(
  env: Env,
  entityType: 'venue' | 'event' | 'milestone' | 'guide' | 'tag',
  slug: string,
): Promise<boolean> {
  if (!env.SUPABASE_URL) return false;
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY;
  if (!key) return false;
  try {
    const res = await fetch(
      `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/gated_entity_exists`,
      {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ p_entity_type: entityType, p_slug: slug }),
      },
    );
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch {
    return false;
  }
}

/**
 * Cuts a string to max chars. Prefers a sentence boundary inside the last
 * 30 chars before the limit so descriptions don't end mid-thought; falls
 * back to a word boundary + ellipsis when no sentence end is found.
 * P2.7 of the SEO remediation.
 */
const truncate = (s: string, max: number) => {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const lookbehind = head.slice(Math.max(0, head.length - 30));
  // Sentence-end punctuation followed by whitespace or string end.
  const idx = lookbehind.search(/[.!?](?=\s|$)/);
  if (idx >= 0) {
    const cut = head.length - 30 + idx + 1;
    return head.slice(0, cut);
  }
  const wordCut = head.slice(0, max - 1).replace(/\s+\S*$/, '');
  return `${wordCut}…`;
};

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escapeJsonLd = (s: string) =>
  s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const renderLd = (obj: unknown) =>
  `<script type="application/ld+json">${escapeJsonLd(JSON.stringify(obj))}</script>`;

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');
const collapseWs = (s: string) => s.replace(/\s+/g, ' ').trim();

const stringField = (row: Record<string, unknown>, k: string): string | undefined => {
  const v = row[k];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
};
const numField = (row: Record<string, unknown>, k: string): number | undefined => {
  const v = row[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};
const arrayField = (row: Record<string, unknown>, k: string): unknown[] | undefined => {
  const v = row[k];
  return Array.isArray(v) ? v : undefined;
};

/**
 * Split prose into paragraphs, then collapse whitespace INSIDE each one.
 *
 * The order is the whole point. This used to call `collapseWs` first, which
 * rewrites every `\n` to a single space, so neither arm of the split could ever
 * match and every crawler-facing detail page — all 13 call sites below — served
 * its prose to Googlebot as one undifferentiated `<p>`. Measured on prod before
 * the fix: 4,558 `events.description`, 240 `unified_tags.long_description`,
 * 150 `cities.description` and 7/7 `guides.intro_md` rows carry blank-line
 * paragraph breaks that were being flattened.
 *
 * CRLF is normalised FIRST, and that is not cosmetic. `[ \t]*` does not match
 * `\r`, so on a `\r\n` row the lookbehind arms below see `\r` immediately
 * before the `\n` and never fire — 61 of the 189 newline-bearing
 * `venues.description` rows and 19 `events.description` rows are CRLF, so
 * without this line a third of the venue corpus keeps the exact bug this
 * function exists to fix. (`\n\s*\n` is unaffected: `\s` matches `\r`.)
 *
 * Three arms, all measured against the live corpus rather than assumed:
 *
 *  - a blank line. Unambiguous.
 *  - a SINGLE newline that follows sentence-terminal punctuation. Entire
 *    content types separate paragraphs this way and never use a blank line:
 *    106 of 175 `queer_villages.history` rows contain `\n` and ZERO contain
 *    `\n\n`, so the blank-line arm alone leaves every village history page a
 *    single block. Same shape on 858 `cities.description` rows.
 *  - a SINGLE newline whose next line opens with a capital or a digit, where
 *    the current line does not end in a comma or semicolon. This is the events
 *    corpus, which writes headings and timetables with no terminal punctuation
 *    at all: `Zugänglichkeit` / `Code of Conduct` / `Türöffnung: 21 Uhr` /
 *    `23.15h - Milky Diamond` ⏎ `23.30h - Sado Opera`. Without it 1,906 such
 *    line breaks in `events.description` render as one run-on paragraph.
 *
 * Every condition here removes a measured defect, none is a guess:
 *
 *  - Requiring punctuation OR a capitalised next line is what keeps a
 *    hard-wrapped sentence intact. A bare `\n+` split produced 22 broken
 *    sentences in a 1,182-row sample (German event copy, verse, Wikipedia list
 *    runs); this rule produces 0 across the same corpus. All 25 hand-read
 *    samples of what the third arm adds are headings, timetable lines or new
 *    sentences.
 *  - The comma/semicolon exclusion exists because of one row:
 *    `…in the City of Salford in Greater Manchester, England,` ⏎
 *    `3 miles (4.8 km) west of Salford city centre…`, which is one sentence.
 *    Keep the class NARROW — an earlier draft also excluded `+ / -` and so
 *    re-glued `Must be 19+`, bare URLs ending in `/`, and `-----` separators.
 *  - The digit half of the lookahead is worth 294 splits, 293 of them
 *    timetables. Its one bad split is `…Gramercy Theater (127 East` ⏎
 *    `23rd Street)`. An "unclosed `(` means continuation" rejoin was written to
 *    catch it and MEASURED TO BE NET-NEGATIVE — 3 fragments in 24,498 carry an
 *    unclosed paren, so it would fix that one and wrongly glue the other two.
 *    Known, measured, left alone; do not re-add it without re-measuring.
 *
 * The old `(?<=[.!?])\s{2,}` sentence-gap arm is deliberately NOT revived. It
 * was dead code, and reviving it fragments a paragraph at every typewriter-style
 * double space after a full stop — 110 `venues.description`, 117
 * `cities.description` and 35 `events.description` rows, all of them running
 * text ("…was 60 at the 2000 census.  The area is named for…").
 *
 * ONE splitter, because the copy is exactly what went wrong. `paragraphsHtmlLinked`
 * below shipped with an older `collapseWs(...)`-then-split body; when the fix
 * above landed the two auto-merged with NO conflict, and since all 13 call sites
 * render through the linked variant, the everything-in-one-`<p>` bug would have
 * come straight back under a green diff. Both now share `splitParagraphs`.
 *
 * Each returned paragraph is already whitespace-collapsed, so no `\n` survives
 * inside one — `paragraphsHtmlLinked` relies on that to rejoin them safely.
 */
function splitParagraphs(text: string): string[] {
  return stripHtml(text)
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n|(?<=[.!?:"'’”)\]])[ \t]*\n|(?<=[^\s,;])[ \t]*\n[ \t]*(?=[\p{Lu}0-9])/u)
    .map(collapseWs)
    .filter(Boolean);
}

export function paragraphsHtml(text: string): string {
  return splitParagraphs(text)
    .map((p) => `<p>${escape(p)}</p>`)
    .join('\n      ');
}

/**
 * `paragraphsHtml`, with the glossary terms the prose mentions turned into
 * links to `/tags/:slug`.
 *
 * WHY THE LINKS ARE NOT SIMPLY STORED IN THE PROSE COLUMN: this function's
 * sibling above is the reason. `stripHtml` would delete any `<a>` a migration
 * wrote into the column and `escape` would neutralise whatever survived, so a
 * stored anchor is invisible to exactly the audience it was written for. The
 * vocabulary is read at render time instead, which also means a term that is
 * later merged, deprecated or un-reviewed stops linking rather than rotting
 * into a dead anchor — `unified_tags` keeps 5,802 deprecated and 144 merged
 * rows at their old slugs.
 *
 * The escaping contract is unchanged and load-bearing: source text is ONLY ever
 * emitted through `escape()`, and the `href` is built from the vocabulary's own
 * slug, never from anything in the document. No source text can become markup.
 *
 * `docs/SEO.md`'s cloaking rule requires this set to be a subset of what a
 * human sees, which is why the span decisions come from the same
 * `src/lib/glossaryLinks.ts` the SPA uses rather than a second implementation.
 *
 * PARAGRAPHS COME FROM `splitParagraphs`, the same splitter `paragraphsHtml`
 * uses — never a second copy of that regex. Every call site renders through this
 * function, so a stale copy here silently reverts the paragraph fix for all 13
 * of them, which is exactly what a no-conflict auto-merge nearly shipped.
 *
 * The matcher then runs ONCE over the whole document (paragraphs rejoined by a
 * blank line) rather than per paragraph, so first-mention-only and the
 * per-document cap mean what they say instead of being multiplied by the
 * paragraph count. Rejoining is unambiguous because `splitParagraphs` has
 * already collapsed whitespace inside each paragraph, so the only `\n` in the
 * joined string are the ones added here.
 */
export function paragraphsHtmlLinked(
  text: string,
  vocabulary: readonly GlossaryLinkTerm[],
  options: FindGlossaryLinksOptions = {},
): string {
  if (vocabulary.length === 0) return paragraphsHtml(text);

  const paras = splitParagraphs(text);
  if (paras.length === 0) return '';
  const segments = segmentGlossaryText(paras.join('\n\n'), vocabulary, options);

  const paragraphs: string[][] = [[]];
  const push = (html: string) => paragraphs[paragraphs.length - 1].push(html);

  for (const segment of segments) {
    if (segment.kind === 'link') {
      // `data-glossary-link` mirrors the SPA's attribute and is what lets a test
      // tell an INLINE prose link from the nav and rail links on the same page —
      // without it "no bad inline link" is indistinguishable from "no inline
      // links at all".
      push(
        `<a href="${escape(glossaryHref(segment.slug))}" data-glossary-link="${escape(segment.slug)}">${escape(segment.text)}</a>`,
      );
      continue;
    }
    // Only the joins above can produce a blank line here, so this splits on
    // exactly the paragraph boundaries `splitParagraphs` already decided.
    const parts = segment.text.split('\n\n');
    parts.forEach((part, i) => {
      if (i > 0) paragraphs.push([]);
      if (part) push(escape(part));
    });
  }

  return paragraphs
    .map((parts) => parts.join('').trim())
    .filter(Boolean)
    .map((body) => `<p>${body}</p>`)
    .join('\n      ');
}

/**
 * The content carrying a tag, as crawlable links, for the tag page's bot body.
 *
 * `cityDetail` has listed its venues and events since 20260910 — the "two-hop
 * payoff" docs/SEO.md names — while `tagDetail` listed nothing at all, so the
 * glossary was a leaf in the crawl graph. The SPA equivalent, `TagLinkedContent`
 * over `get_tag_linked_content`, has rendered real anchors for months; this is
 * the same relationships served to a crawler that does not run JS. Per the
 * cloaking rule the bot set must be a SUBSET of the human one, which is why
 * this covers three of that component's four types and never more.
 *
 * EVERY visibility predicate below is mandatory and none is a duplicate of an
 * RLS policy: `fetchRows` authenticates with the service role, which bypasses
 * RLS entirely. The gates are copied verbatim from the sitemap generators so
 * the two cannot disagree about what is publishable — dropping
 * `safety_gated=eq.false` alone would publish venues in criminalising countries
 * to anonymous crawlers.
 */
async function tagLinkedContentHtml(env: Env, tagId: string, tagName: string): Promise<string> {
  // `unified_tag_assignments` is polymorphic — no FK per type — so PostgREST
  // embedding is not available and each type costs an id lookup plus a gated
  // fetch. Assignment ids are over-fetched because the gates below reject some.
  const ASSIGNMENT_FETCH = 60;
  const RENDER_LIMIT = 10;
  const today = new Date().toISOString().slice(0, 10);

  const idsFor = async (entityType: string): Promise<string[]> => {
    const rows = await fetchRows(
      env,
      'unified_tag_assignments',
      'entity_id',
      `tag_id=eq.${tagId}&entity_type=eq.${entityType}`,
      ASSIGNMENT_FETCH,
    ).catch(() => []);
    return rows.map((r) => stringField(r, 'entity_id')).filter((v): v is string => Boolean(v));
  };

  const gated = async (
    entityType: string,
    table: string,
    select: string,
    filter: string,
  ): Promise<Record<string, unknown>[]> => {
    const ids = await idsFor(entityType);
    if (ids.length === 0) return [];
    return fetchRows(env, table, select, `id=in.(${ids.join(',')})&${filter}`, RENDER_LIMIT).catch(
      () => [],
    );
  };

  const [venues, events, news] = await Promise.all([
    gated(
      'venues',
      'venues',
      'name,slug',
      'slug=not.is.null&seo_indexable=eq.true&safety_gated=eq.false&duplicate_of_id=is.null',
    ),
    gated(
      'event',
      'events',
      'title,slug,start_date',
      `slug=not.is.null&seo_indexable=eq.true&status=neq.cancelled&start_date=gte.${today}&safety_gated=eq.false&duplicate_of_id=is.null&order=start_date.asc`,
    ),
    gated(
      'news',
      'news_articles',
      'title,slug',
      'slug=not.is.null&seo_indexable=eq.true&duplicate_of_id=is.null&content=not.is.null&archived_at=is.null',
    ),
  ]);

  const list = (
    rows: Record<string, unknown>[],
    prefix: string,
    titleKey: string,
    heading: string,
  ): string => {
    const items = rows
      .map((r) => ({ title: stringField(r, titleKey), slug: stringField(r, 'slug') }))
      .filter((r) => r.title && r.slug)
      .map((r) => `<li><a href="${prefix}${escape(r.slug!)}">${escape(r.title!)}</a></li>`)
      .join('\n        ');
    return items ? `<section><h2>${escape(heading)}</h2><ul>\n        ${items}\n      </ul></section>` : '';
  };

  return [
    list(venues, '/venues/', 'name', `Places tagged ${tagName}`),
    list(events, '/events/', 'title', `Upcoming events tagged ${tagName}`),
    list(news, '/news/', 'title', `Reporting tagged ${tagName}`),
  ]
    .filter(Boolean)
    .join('\n      ');
}

async function fetchOne(env: Env, table: string, slugCol: string, slug: string, select: string) {
  const rows = await fetchRows(env, table, select, `${slugCol}=eq.${encodeURIComponent(slug)}`, 1);
  return rows[0] ?? null;
}

// A `slugify` helper lived here, and its only caller shape was building a city
// link out of the free-text `city` column. It is DELETED rather than kept for
// reuse: it is the footgun this change exists to remove, and the next person
// needing "a slug from a name" would reach for it and reintroduce `z-rich`.
// Resolve a slug through the row's FK — publishableCitySlug below — never by
// transforming a display name.

/**
 * The linked city's OWN slug, or null. Never derived from the city's name.
 *
 * `slugify` here is `toLowerCase().replace(/[^a-z0-9]+/g,'-')` — no
 * transliteration, no trim — so "Zürich" becomes `z-rich` and
 * "Wilmington (Long Beach)" becomes `wilmington-long-beach-`. Measured
 * 2026-09-10 on the crawler bodies of the three types that emit a city link:
 *
 *   venues  9,293 of 23,077 (40.3%) linked to a slug no city row has
 *   events    517 of  2,972 (17.4%)
 *   hotels     80 of    323 (24.8%)
 *
 * …plus 636 venues that linked to a city which EXISTS BUT IS THE WRONG PLACE:
 * every venue in Victoria, BC pointed at Victoria, SEYCHELLES, and Grad Hvar
 * (Croatia) at a French commune. That is the same-name-city collision class
 * recorded in CLAUDE.md, reached through a link instead of a resolver — and it
 * is worse than a 404, because a wrong-but-live link looks correct to everyone.
 *
 * Returning null (no link at all) is the deliberate answer for the ~2,500 rows
 * with no usable city_id. A missing link costs a crawl path; a wrong one sends
 * a reader to another country.
 */
export function publishableCitySlug(row: Record<string, unknown>): string | null {
  const c = (row.cities ?? null) as Record<string, unknown> | null;
  if (!c) return null;
  if (typeof c.slug !== 'string' || c.slug.length === 0) return null;
  if (c.seo_indexable !== true) return null;
  if (c.duplicate_of_id != null) return null;
  if (c.shell_status === 'ghost' || c.shell_status === 'merged') return null;
  return c.slug;
}

/** The `<li>` city link for a crawler nav, or '' when there is no safe target. */
export function cityLinkItem(row: Record<string, unknown>, cityText: string | null | undefined): string {
  const slug = publishableCitySlug(row);
  if (!slug) return '';
  return `<li><a href="/city/${encodeURIComponent(slug)}">More in ${escape(cityText ?? slug)}</a></li>`;
}

/**
 * Opening hours for the crawler body, or null.
 *
 * Reads `hours.display` and NOTHING else. Measured 2026-09-10: 609 of the
 * 23,664 publishable venues carry hours, and all 609 share one shape —
 * `{display, open_now, popular, regular}` — where `display` is already a human
 * string ("Mon-Thu 11:00-23:00; Fri-Sat 11:00-24:00; Sun 11:00-23:00").
 *
 * The first version of this function walked `monday`..`sunday` keys. ZERO rows
 * have such a key, so it was dead code that rendered nothing on every page —
 * and it looked like it worked, because the section simply never appeared.
 *
 * `open_now` is deliberately ignored: it is a boolean frozen at scrape time, so
 * publishing it would state "open now" to a reader at an arbitrary later moment.
 * `regular`/`popular` are ignored too — they encode close as "+0000" for
 * after-midnight, which reads as a real time and is not one.
 *
 * Coverage is 2.6% of venues. Small, but it is real data already fetched and
 * previously discarded; it is not a fix for the 11,302 empty descriptions.
 */
export function formatHoursForCrawler(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const display = (raw as Record<string, unknown>).display;
  if (typeof display !== 'string') return null;
  const text = display.trim();
  if (!text || text.length > 300) return null;
  return text.endsWith('.') ? text : `${text}.`;
}

/**
 * " · Rated 4.2 from 2 sources." or '' — derived from the rating columns that
 * are already fetched for the JSON-LD aggregateRating, so this states nothing
 * the structured data does not already claim.
 */
function aggregateRatingSentence(row: Record<string, unknown>): string {
  const ratings = [
    numField(row, 'foursquare_rating'),
    numField(row, 'tripadvisor_rating'),
    numField(row, 'tomtom_rating'),
  ].filter((n): n is number => n !== undefined);
  if (ratings.length === 0) return '';
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return ` · Rated ${avg.toFixed(1)} from ${ratings.length} source${ratings.length === 1 ? '' : 's'}.`;
}

// Venues

async function venueDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  // duplicate_of_id=is.null: a merged venue's dropped row still exists at its
  // old slug (merge_venues doesn't delete it) — exclude it so the caller's
  // !detail check falls through to resolveSlugRedirect instead of rendering
  // the stale duplicate's own content forever.
  const rows = await fetchRows(
    env,
    'venues',
    // cities(...) is embedded so the city LINK can use the city's real slug.
    // The body used to link `/places/${slugify(city_text)}`, and slugify here is
    // `toLowerCase().replace(/[^a-z0-9]+/g,'-')` — no transliteration, no trim —
    // so "Zürich" became `z-rich` and "Wilmington (Long Beach)" became
    // `wilmington-long-beach-`. Measured 2026-09-10 across the 23,077 indexable
    // venues carrying a city: 9,293 (40.3%) linked to a slug no city row has,
    // and a further 636 linked to a city that EXISTS BUT IS THE WRONG PLACE —
    // every venue in Victoria, BC pointed at Victoria, SEYCHELLES, and Grad Hvar
    // (Croatia) at a French commune. That is the same-name-city collision class
    // recorded in CLAUDE.md, reached through a link rather than a resolver.
    'name,slug,description,address,city,state,country,postal_code,latitude,longitude,phone,website,images,category,venue_subtype,foursquare_rating,tripadvisor_rating,tomtom_rating,hours,updated_at,safety_gated,review_status,seo_indexable,cities(slug,seo_indexable,duplicate_of_id,shell_status)',
    // review_status=neq.archived: fetchRows runs with the service role, so the
    // SPA's own archived filter (usePageFetchers → notFound) never applies here;
    // without it every soft-archived venue kept serving full meta + JSON-LD to
    // crawlers with HTTP 200.
    `slug=eq.${encodeURIComponent(slug)}&duplicate_of_id=is.null&review_status=neq.archived`,
    1,
  );
  const row = rows[0] ?? null;
  if (!row) return (await isGatedEntity(env, 'venue', slug)) ? gatedDetailResult() : null;
  if (row.safety_gated === true) return gatedDetailResult();

  const name = stringField(row, 'name') ?? slug;
  const description = stringField(row, 'description') ?? '';
  const address = stringField(row, 'address');
  const city = stringField(row, 'city');
  const country = stringField(row, 'country');
  const rawSubtype = stringField(row, 'venue_subtype');
  const rawCategory = stringField(row, 'category');
  // P2.1 — derive a human label that never says "other"; defaults to "space".
  const label = categoryLabel(rawSubtype, rawCategory);
  const labelTitle = categoryLabelTitle(rawSubtype, rawCategory);
  const subtype = rawSubtype ?? rawCategory ?? 'Venue';

  // P2.1+P2.2 — venue title and description templates. Title puts the
  // venue name + city so the click signal stays clear; description leads
  // with a typed clause ("Gay bar in Berlin · …") to lift CTR for
  // category-intent queries. When the row has its own description we use
  // that and only fall back to the template.
  const titledClause = `${labelTitle} in ${city ?? country ?? 'the LGBTQ+ community'}`;
  const meta: RouteMeta = {
    title: truncate(`${name}${city ? ` — ${city}` : ''}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description
        ? description
        : `${titledClause} · ${name} on Queer Guide${
            country && country !== city ? `, ${country}` : ''
          }. Hours, location, photos, and recent reviews.`,
      MAX_DESC,
    ),
    ogImage: safeOgImage((arrayField(row, 'images')?.[0] as string) ?? DEFAULT_OG_IMAGE),
  };
  void label;

  // Facts we already hold and were throwing away. `hours` was in the select list
  // and rendered nowhere, while 11,506 of 24,236 live venues (47%) have an empty
  // description — which is why the crawler body for one of those measured 64
  // characters end to end: name, city, nav. These lines are derived from
  // structured columns, never generated prose.
  const factLine = [labelTitle, city ? `in ${city}` : null, country && country !== city ? country : null]
    .filter(Boolean)
    .join(' ');
  const hoursText = formatHoursForCrawler(row.hours);

  const glossary = await getGlossaryVocabulary(env);
  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(name)}</h1>
      ${address || city ? `<p><strong>${escape([address, city, country].filter(Boolean).join(', '))}</strong></p>` : ''}
      ${factLine ? `<p>${escape(factLine)}${aggregateRatingSentence(row)}</p>` : ''}
      ${description ? paragraphsHtmlLinked(description, glossary) : ''}
      ${hoursText ? `<section><h2>Opening hours</h2><p>${escape(hoursText)}</p></section>` : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/venues">All venues</a></li>
        ${cityLinkItem(row, city)}
        <li><a href="/events">Events</a></li>
      </ul>
    </nav>
  </main>`;

  const ratings = [
    numField(row, 'foursquare_rating'),
    numField(row, 'tripadvisor_rating'),
    numField(row, 'tomtom_rating'),
  ].filter((n): n is number => n !== undefined);
  const aggregate = ratings.length
    ? {
        ratingValue: ratings.reduce((a, b) => a + b, 0) / ratings.length,
        ratingCount: ratings.length,
      }
    : null;

  const localBusiness: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': mapVenueType(subtype),
    name,
    url: `${SITE_ORIGIN}${pathname}`,
    description: description || undefined,
    // P2.3 — only emit PostalAddress when we have a real streetAddress.
    // Schema.org/Google flags PostalAddress entries without streetAddress
    // as invalid LocalBusiness markup. City + country alone go into the
    // areaServed field below; they don't pretend to be a postal address.
    address: address
      ? {
          '@type': 'PostalAddress',
          streetAddress: address,
          addressLocality: city,
          addressRegion: stringField(row, 'state'),
          postalCode: stringField(row, 'postal_code'),
          addressCountry: country,
        }
      : undefined,
    areaServed:
      !address && (city || country) ? [city, country].filter(Boolean).join(', ') : undefined,
    geo:
      numField(row, 'latitude') !== undefined && numField(row, 'longitude') !== undefined
        ? {
            '@type': 'GeoCoordinates',
            latitude: numField(row, 'latitude'),
            longitude: numField(row, 'longitude'),
          }
        : undefined,
    telephone: stringField(row, 'phone'),
    image: arrayField(row, 'images')?.[0],
    sameAs: stringField(row, 'website') ? [stringField(row, 'website')] : undefined,
    aggregateRating: aggregate
      ? {
          '@type': 'AggregateRating',
          ratingValue: Number(aggregate.ratingValue.toFixed(1)),
          ratingCount: aggregate.ratingCount,
        }
      : undefined,
  };

  return { meta, body, jsonLd: renderLd(prune(localBusiness)), indexable: row.seo_indexable !== false };
}

function mapVenueType(subtype: string): string {
  const s = subtype.toLowerCase();
  if (s.includes('bar')) return 'BarOrPub';
  if (s.includes('cafe') || s.includes('café')) return 'CafeOrCoffeeShop';
  if (s.includes('club') || s.includes('night')) return 'NightClub';
  if (s.includes('restaurant')) return 'Restaurant';
  if (s.includes('hotel') || s.includes('hostel') || s.includes('accommodation'))
    return 'LodgingBusiness';
  if (s.includes('shop') || s.includes('store') || s.includes('boutique')) return 'Store';
  return 'LocalBusiness';
}

// Events

async function eventDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  // duplicate_of_id=is.null — see the identical comment in venueDetail.
  const rows = await fetchRows(
    env,
    'events',
    'title,slug,description,address,city,state,country,postal_code,start_date,end_date,latitude,longitude,images,ticket_url,organizer_name,venue_name,price_min,price_max,is_free,event_type,timezone,updated_at,safety_gated,status,seo_indexable,cities(slug,seo_indexable,duplicate_of_id,shell_status)',
    // status=neq.cancelled is the archive gate — the existence engine writes
    // 'cancelled' to archive an event, and sitemap-events.xml.ts already
    // excludes it, but this renderer did not, so an archived event kept a fully
    // indexable crawler page. 'completed' is deliberately NOT excluded: this
    // corpus is ~99% past events and they legitimately keep their pages.
    `slug=eq.${encodeURIComponent(slug)}&duplicate_of_id=is.null&status=neq.cancelled`,
    1,
  );
  const row = rows[0] ?? null;
  if (!row) return (await isGatedEntity(env, 'event', slug)) ? gatedDetailResult() : null;
  if (row.safety_gated === true) return gatedDetailResult();

  const title = stringField(row, 'title') ?? slug;
  const description = stringField(row, 'description') ?? '';
  const city = stringField(row, 'city');
  const country = stringField(row, 'country');
  const startDate = stringField(row, 'start_date');
  const endDate = stringField(row, 'end_date');

  const meta: RouteMeta = {
    title: truncate(`${title}${city ? ` in ${city}` : ''}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description ||
        `${title} — LGBTQ+ event${city ? ` in ${city}` : ''}${
          startDate ? ` on ${startDate.slice(0, 10)}` : ''
        } on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: safeOgImage((arrayField(row, 'images')?.[0] as string) ?? DEFAULT_OG_IMAGE),
  };

  const glossary = await getGlossaryVocabulary(env);
  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(title)}</h1>
      ${startDate ? `<p><strong>When:</strong> <time datetime="${escape(startDate)}">${escape(startDate.slice(0, 10))}</time>${endDate ? ` – <time datetime="${escape(endDate)}">${escape(endDate.slice(0, 10))}</time>` : ''}</p>` : ''}
      ${city ? `<p><strong>Where:</strong> ${escape([stringField(row, 'venue_name'), stringField(row, 'address'), city, country].filter(Boolean).join(', '))}</p>` : ''}
      ${description ? paragraphsHtmlLinked(description, glossary) : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/events">All events</a></li>
        ${cityLinkItem(row, city)}
        <li><a href="/venues">Venues</a></li>
      </ul>
    </nav>
  </main>`;

  const eventLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: title,
    description: description || undefined,
    startDate,
    endDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: stringField(row, 'venue_name') ?? city ?? 'Unknown',
      address: {
        '@type': 'PostalAddress',
        streetAddress: stringField(row, 'address'),
        addressLocality: city,
        addressRegion: stringField(row, 'state'),
        postalCode: stringField(row, 'postal_code'),
        addressCountry: country,
      },
      geo:
        numField(row, 'latitude') !== undefined && numField(row, 'longitude') !== undefined
          ? {
              '@type': 'GeoCoordinates',
              latitude: numField(row, 'latitude'),
              longitude: numField(row, 'longitude'),
            }
          : undefined,
    },
    image: arrayField(row, 'images')?.[0],
    url: `${SITE_ORIGIN}${pathname}`,
    organizer: stringField(row, 'organizer_name')
      ? { '@type': 'Organization', name: stringField(row, 'organizer_name') }
      : undefined,
    offers:
      stringField(row, 'ticket_url') ||
      numField(row, 'price_min') !== undefined ||
      row.is_free === true
        ? {
            '@type': 'Offer',
            url: stringField(row, 'ticket_url'),
            price: row.is_free === true ? 0 : numField(row, 'price_min'),
            priceCurrency: 'EUR',
            availability: 'https://schema.org/InStock',
          }
        : undefined,
  };

  // seo_indexable was in neither the select nor this return, so an event page
  // was indexable whatever the column said. The stale comment further down this
  // file claiming eventDetail "already" honoured it was simply wrong.
  return { meta, body, jsonLd: renderLd(prune(eventLd)), indexable: row.seo_indexable !== false };
}

// News articles

async function newsDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  // duplicate_of_id=is.null — see the identical comment in venueDetail.
  const rows = await fetchRows(
    env,
    'news_articles',
    'title,slug,excerpt,author,image_url,published_at,url,publisher_name,updated_at,seo_indexable',
    // archived_at — fetchRows reads with the service role, so the RLS policy
    // that hides archived articles from every other reader does not apply here
    // and the filter has to be repeated.
    `slug=eq.${encodeURIComponent(slug)}&duplicate_of_id=is.null&archived_at=is.null`,
    1,
  );
  const row = rows[0] ?? null;
  if (!row) return null;

  const title = stringField(row, 'title') ?? slug;
  // P2.4 — excerpt occasionally contains inline HTML (anchors, em). The
  // meta description tag must be plain text or social previews render
  // raw tags. Strip + collapse whitespace before truncating.
  const excerpt = collapseWs(stripHtml(stringField(row, 'excerpt') ?? ''));
  const author = stringField(row, 'author');
  const publisher = stringField(row, 'publisher_name');
  const image = stringField(row, 'image_url');

  const meta: RouteMeta = {
    title: truncate(`${title}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(excerpt || `${title} — LGBTQ+ news on Queer Guide.`, MAX_DESC),
    ogImage: safeOgImage(image ?? DEFAULT_OG_IMAGE),
  };

  const sourceLink = stringField(row, 'url');
  const glossary = await getGlossaryVocabulary(env);
  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(title)}</h1>
      <p>${author ? `<em>By ${escape(author)}</em>` : ''}${author && publisher ? ' · ' : ''}${publisher ? `Published on ${escape(publisher)}` : ''}</p>
      ${excerpt ? paragraphsHtmlLinked(excerpt, glossary) : ''}
      ${sourceLink ? `<p><a href="${escape(sourceLink)}" rel="nofollow noopener">Read the full article at ${escape(publisher ?? 'the source')}</a></p>` : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/news">All news</a></li>
        <li><a href="/blog">Long-form essays</a></li>
        <li><a href="/tags">Glossary</a></li>
      </ul>
    </nav>
  </main>`;

  const articleLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    description: excerpt || undefined,
    datePublished: stringField(row, 'published_at'),
    dateModified: stringField(row, 'updated_at') ?? stringField(row, 'published_at'),
    author: author ? { '@type': 'Person', name: author } : undefined,
    // `publisher` is the organization publishing THIS page, which is Queer
    // Guide — so it takes Queer Guide's name and Queer Guide's logo.
    //
    // Until 2026-09-10 this emitted `news_articles.publisher_name` (the
    // ORIGINATING outlet) paired with Queer Guide's own icon as that outlet's
    // logo, e.g. `{"name":"Variety","logo":{"url":".../icons/icon-192.png"}}`
    // — a false claim about a third party, served on up to 24,117 URLs, in the
    // one property Google reads as a NewsArticle trust signal. The column is
    // also not always an organization at all: the top values include
    // "Google News LGBT Rights", "NewsData.io" and "Reddit LGBT", which are
    // feeds, so no logo could ever have been correct for them.
    //
    // The originating outlet is still credited, in the property that actually
    // means it. `sourceOrganization` carries no logo because we do not hold
    // theirs — omitting it is honest, inventing one is how this started.
    publisher: {
      '@type': 'Organization',
      name: 'Queer Guide',
      url: SITE_ORIGIN,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_ORIGIN}/icons/icon-192.png`,
      },
    },
    sourceOrganization: publisher ? { '@type': 'Organization', name: publisher } : undefined,
    image: image ? [image] : undefined,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_ORIGIN}${pathname}` },
    url: `${SITE_ORIGIN}${pathname}`,
    isBasedOn: sourceLink,
  };

  // News detail pages are first-class again (the P1.2 410 Gone handler was
  // removed). Index per the row's own quality gate — seo_indexable is set
  // false on low-quality / unverified articles, so respect it.
  return {
    meta,
    body,
    jsonLd: renderLd(prune(articleLd)),
    indexable: row.seo_indexable !== false,
  };
}

// Personalities

async function personalityDetail(
  env: Env,
  slug: string,
  pathname: string,
): Promise<DetailResult | null> {
  // duplicate_of_id=is.null — see the identical comment in venueDetail.
  //
  // visibility=eq.public is load-bearing. fetchRows PREFERS the service-role
  // key, so it bypasses RLS: without this filter a draft personality is served
  // to crawlers as a fully prerendered page — title, description, bio, image —
  // even though the SPA renders "Personality not found" for the same URL.
  //
  // That is how Googlebot was still receiving
  // "<title>Carl Sagan — Adult performer</title>" after the 2026-08 namesake
  // repair had already unpublished the row. The exposed set was precisely the
  // rows pulled from public view *because* their identity data was wrong or
  // unverified.
  const rows = await fetchRows(
    env,
    'personalities',
    'name,slug,bio,description,image_url,profession,lgbti_connection,lgbti_details,birth_date,death_date,birth_place,nationality,pronouns,website_url,updated_at,is_living,seo_indexable',
    `slug=eq.${encodeURIComponent(slug)}&duplicate_of_id=is.null&visibility=eq.public`,
    1,
  );
  const row = rows[0] ?? null;
  if (!row) return null;

  const name = stringField(row, 'name') ?? slug;
  const bio = stringField(row, 'bio') ?? '';
  const description = stringField(row, 'description') ?? '';
  const profession = stringField(row, 'profession');
  const image = stringField(row, 'image_url');
  const birthDate = stringField(row, 'birth_date');
  const deathDate = stringField(row, 'death_date');

  const meta: RouteMeta = {
    title: truncate(`${name}${profession ? ` — ${profession}` : ''}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description || bio || `${name} — notable LGBTQ+ figure on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: safeOgImage(image ?? DEFAULT_OG_IMAGE),
  };

  const glossary = await getGlossaryVocabulary(env);
  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(name)}</h1>
      ${profession ? `<p><strong>${escape(profession)}</strong></p>` : ''}
      ${birthDate || deathDate ? `<p>${birthDate ? escape(birthDate.slice(0, 10)) : '?'} – ${deathDate ? escape(deathDate.slice(0, 10)) : row.is_living === true ? 'present' : '?'}</p>` : ''}
      ${description ? paragraphsHtmlLinked(description, glossary) : ''}
      ${bio && bio !== description ? paragraphsHtmlLinked(bio, glossary) : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/personalities">All personalities</a></li>
        <li><a href="/tags">Glossary</a></li>
      </ul>
    </nav>
  </main>`;

  const personLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    description: description || bio || undefined,
    jobTitle: profession,
    image,
    birthDate,
    deathDate,
    birthPlace: stringField(row, 'birth_place')
      ? { '@type': 'Place', name: stringField(row, 'birth_place') }
      : undefined,
    nationality: stringField(row, 'nationality'),
    sameAs: stringField(row, 'website_url') ? [stringField(row, 'website_url')] : undefined,
    url: `${SITE_ORIGIN}${pathname}`,
  };

  // Honour the row's own indexability gate, the way newsDetail (`indexable:
  // row.seo_indexable !== false`) does. Omitting it made `detail.indexable !==
  // false` in _middleware trivially true, so a personality page was ALWAYS
  // indexable — `seo_indexable=false`, which the thin-content trigger sets, had
  // no effect on this route at all.
  //
  // This comment also named eventDetail as already doing it. That was false
  // when written and stayed false until 2026-08-29 — eventDetail had
  // seo_indexable in neither its select nor its return. Both it and cityDetail
  // carry the gate now.
  return {
    meta,
    body,
    jsonLd: renderLd(prune(personLd)),
    indexable: row.seo_indexable !== false,
  };
}

// City — programmatic SEO surface for /city/:slug

async function cityDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  // shell_status + seo_indexable were absent from this select entirely, so the
  // crawler response was unconditionally indexable regardless of what either
  // column said — the same hole villageDetail and personalityDetail had. This
  // ran with the service role, so RLS could never have covered it.
  const cityRow = await fetchOne(
    env,
    'cities',
    'slug',
    slug,
    'id,name,slug,description,image_url,latitude,longitude,country_id,is_capital,is_major_city,population,lgbt_friendly_rating,shell_status,seo_indexable,updated_at',
  );
  if (!cityRow) return null;

  // 'ghost' is the archived disposition archive_city_as_nonplace writes for a
  // row that is not a place at all — a Bundesland, a continent, a country in
  // German. Returning null makes the middleware serve a hard 404, which matches
  // what the SPA now does, rather than publishing "LGBTQ+ guide to Hessen" with
  // a mere noindex. 'merged' is left to resolveSlugRedirect, which turns it
  // into a 301 — a redirect is better than a 404 when a canonical row exists.
  if (stringField(cityRow, 'shell_status') === 'ghost') return null;

  const name = stringField(cityRow, 'name') ?? slug;
  const description = stringField(cityRow, 'description') ?? '';
  const image = stringField(cityRow, 'image_url');
  const cityId = stringField(cityRow, 'id');

  // Aggregate venues + events for this city. Best-effort — if either fails the
  // page still renders with whatever we have.
  const [venues, events] = await Promise.all([
    cityId
      ? fetchRows(
          env,
          'venues',
          'name,slug,address,category,venue_subtype,foursquare_rating',
          // Safety layer — never list high-risk-country venues in the
          // prerendered city page (service-role fetch bypasses RLS).
          `city_id=eq.${cityId}&safety_gated=eq.false&order=foursquare_rating.desc.nullslast`,
          10,
        ).catch(() => [])
      : Promise.resolve([]),
    cityId
      ? fetchRows(
          env,
          'events',
          'title,slug,start_date',
          `city_id=eq.${cityId}&safety_gated=eq.false&start_date=gte.${new Date().toISOString().slice(0, 10)}&order=start_date.asc`,
          10,
        ).catch(() => [])
      : Promise.resolve([]),
  ]);

  const meta: RouteMeta = {
    title: truncate(`LGBTQ+ guide to ${name}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description ||
        `Queer venues, events, hotels and travel tips for ${name}. ${venues.length} venues, ${events.length} upcoming events on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: safeOgImage(image ?? DEFAULT_OG_IMAGE),
  };

  const venuesList = venues
    .filter((v) => stringField(v, 'slug'))
    .map((v) => {
      const vname = escape(stringField(v, 'name') ?? '');
      const vslug = escape(stringField(v, 'slug') ?? '');
      const vsub = stringField(v, 'venue_subtype') ?? stringField(v, 'category');
      return `<li><a href="/venues/${vslug}">${vname}</a>${vsub ? ` — ${escape(vsub)}` : ''}</li>`;
    })
    .join('\n        ');

  const eventsList = events
    .filter((e) => stringField(e, 'slug'))
    .map((e) => {
      const ename = escape(stringField(e, 'title') ?? '');
      const eslug = escape(stringField(e, 'slug') ?? '');
      const edate = stringField(e, 'start_date');
      return `<li><a href="/events/${eslug}">${ename}</a>${edate ? ` — <time datetime="${escape(edate)}">${escape(edate.slice(0, 10))}</time>` : ''}</li>`;
    })
    .join('\n        ');

  const glossary = await getGlossaryVocabulary(env);
  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>LGBTQ+ guide to ${escape(name)}</h1>
      ${description ? paragraphsHtmlLinked(description, glossary) : `<p>${escape(name)} is part of the global queer life Queer Guide tracks. Below are the venues, events and travel tips we have on file for ${escape(name)}.</p>`}
      ${venues.length ? `<section><h2>Top LGBTQ+ venues in ${escape(name)}</h2><ul>\n        ${venuesList}\n      </ul></section>` : ''}
      ${events.length ? `<section><h2>Upcoming LGBTQ+ events in ${escape(name)}</h2><ul>\n        ${eventsList}\n      </ul></section>` : ''}
      <section><h2>Plan your trip</h2><p>Check the <a href="/travel">country safety guide</a> before you go, and browse <a href="/hotels">queer-friendly hotels</a> and <a href="/villages">queer villages</a> for a place to stay.</p></section>
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/places">All places</a></li>
        <li><a href="/venues">All venues</a></li>
        <li><a href="/events">All events</a></li>
        <li><a href="/travel">Travel</a></li>
      </ul>
    </nav>
  </main>`;

  const placeLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name,
    description: description || `LGBTQ+ guide to ${name} on Queer Guide.`,
    url: `${SITE_ORIGIN}${pathname}`,
    image,
    geo:
      numField(cityRow, 'latitude') !== undefined && numField(cityRow, 'longitude') !== undefined
        ? {
            '@type': 'GeoCoordinates',
            latitude: numField(cityRow, 'latitude'),
            longitude: numField(cityRow, 'longitude'),
          }
        : undefined,
  };

  const itemList: Record<string, unknown> | null = venues.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `LGBTQ+ venues in ${name}`,
        itemListElement: venues
          .filter((v) => stringField(v, 'slug'))
          .map((v, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${SITE_ORIGIN}/venues/${stringField(v, 'slug')}`,
            name: stringField(v, 'name'),
          })),
      }
    : null;

  const jsonLd = renderLd(prune(placeLd)) + (itemList ? '\n' + renderLd(prune(itemList)) : '');

  return { meta, body, jsonLd, indexable: cityRow.seo_indexable !== false };
}

// Country — /country/:slug

async function countryDetail(
  env: Env,
  slug: string,
  pathname: string,
): Promise<DetailResult | null> {
  // duplicate_of_id=is.null — see the identical comment in venueDetail.
  const rows = await fetchRows(
    env,
    'countries',
    'id,name,slug,code,description,editorial_hook,editorial_long,image_url,capital,latitude,longitude,equality_score,lgbti_same_sex_unions,population,seo_indexable,updated_at',
    `slug=eq.${encodeURIComponent(slug)}&duplicate_of_id=is.null`,
    1,
  );
  const row = rows[0] ?? null;
  if (!row) return null;

  const name = stringField(row, 'name') ?? slug;
  // Prefer the editorial long-form (richer, queer-specific) over the bare description.
  const description = stringField(row, 'editorial_long') ?? stringField(row, 'description') ?? '';
  const hook = stringField(row, 'editorial_hook');
  const image = stringField(row, 'image_url');
  const unions = stringField(row, 'lgbti_same_sex_unions');
  const capital = stringField(row, 'capital');

  const meta: RouteMeta = {
    title: truncate(`LGBTQ+ rights & travel — ${name}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      hook || description || `LGBTQ+ legal status, safety, venues and travel guide for ${name}.`,
      MAX_DESC,
    ),
    ogImage: safeOgImage(image ?? DEFAULT_OG_IMAGE),
  };

  const glossary = await getGlossaryVocabulary(env);
  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>LGBTQ+ guide to ${escape(name)}</h1>
      ${capital ? `<p><strong>Capital:</strong> ${escape(capital)}</p>` : ''}
      ${unions ? `<p><strong>Same-sex unions:</strong> ${escape(unions)}</p>` : ''}
      ${description ? paragraphsHtmlLinked(description, glossary) : `<p>Country profile, legal status and travel notes for ${escape(name)}.</p>`}
      <section><h2>Plan your trip</h2><p>Read the <a href="/travel">global travel safety guide</a>, browse <a href="/places">cities and queer villages</a>, and check <a href="/help">crisis hotlines</a> before you go.</p></section>
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/places">Places</a></li>
        <li><a href="/travel">Travel</a></li>
        <li><a href="/venues">Venues</a></li>
      </ul>
    </nav>
  </main>`;

  const countryLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Country',
    name,
    identifier: stringField(row, 'code'),
    description: description || undefined,
    image,
    url: `${SITE_ORIGIN}${pathname}`,
  };

  // `countries` carries seo_indexable and this renderer ignored it — the same
  // omission as personalityDetail, villageDetail, tagDetail, eventDetail and
  // cityDetail. Found 2026-08-29 while fixing the last two.
  return { meta, body, jsonLd: renderLd(prune(countryLd)), indexable: row.seo_indexable !== false };
}

// Hotels — /hotels/:slug

async function hotelDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  // duplicate_of_id=is.null — see the identical comment in venueDetail.
  const rows = await fetchRows(
    env,
    'hotels',
    'name,slug,description,address,city,country,latitude,longitude,images,hotel_type,star_rating,price_range,amenities,booking_url,phone,website,queer_safety_notes,lgbtq_friendly,updated_at,seo_indexable,cities(slug,seo_indexable,duplicate_of_id,shell_status)',
    // archived_at — service-role read, RLS does not apply. See newsDetail.
    `slug=eq.${encodeURIComponent(slug)}&duplicate_of_id=is.null&archived_at=is.null`,
    1,
  );
  const row = rows[0] ?? null;
  if (!row) return null;

  const name = stringField(row, 'name') ?? slug;
  const description = stringField(row, 'description') ?? '';
  const city = stringField(row, 'city');
  const country = stringField(row, 'country');
  const safetyNotes = stringField(row, 'queer_safety_notes');

  const meta: RouteMeta = {
    title: truncate(`${name}${city ? ` — ${city}` : ''}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description || `LGBTQ+ friendly hotel${city ? ` in ${city}` : ''} on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: safeOgImage((arrayField(row, 'images')?.[0] as string) ?? DEFAULT_OG_IMAGE),
  };

  const glossary = await getGlossaryVocabulary(env);
  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(name)}</h1>
      ${city ? `<p><strong>${escape([stringField(row, 'address'), city, country].filter(Boolean).join(', '))}</strong></p>` : ''}
      ${description ? paragraphsHtmlLinked(description, glossary) : ''}
      ${safetyNotes ? `<section><h2>Queer safety notes</h2>${paragraphsHtmlLinked(safetyNotes, glossary)}</section>` : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/hotels">All hotels</a></li>
        ${cityLinkItem(row, city)}
        <li><a href="/travel">Travel</a></li>
      </ul>
    </nav>
  </main>`;

  const lodgingLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name,
    description: description || undefined,
    url: `${SITE_ORIGIN}${pathname}`,
    address:
      stringField(row, 'address') || city
        ? {
            '@type': 'PostalAddress',
            streetAddress: stringField(row, 'address'),
            addressLocality: city,
            addressRegion: stringField(row, 'state'),
            postalCode: stringField(row, 'postal_code'),
            addressCountry: country,
          }
        : undefined,
    geo:
      numField(row, 'latitude') !== undefined && numField(row, 'longitude') !== undefined
        ? {
            '@type': 'GeoCoordinates',
            latitude: numField(row, 'latitude'),
            longitude: numField(row, 'longitude'),
          }
        : undefined,
    image: arrayField(row, 'images')?.[0],
    starRating: numField(row, 'star_rating')
      ? { '@type': 'Rating', ratingValue: numField(row, 'star_rating') }
      : undefined,
    telephone: stringField(row, 'phone'),
    priceRange:
      numField(row, 'price_range') !== undefined
        ? '$'.repeat(numField(row, 'price_range') as number)
        : undefined,
    sameAs: stringField(row, 'website') ? [stringField(row, 'website')] : undefined,
  };

  // `hotels.seo_indexable` has existed all along and this renderer read neither
  // the column nor returned the flag, so every hotel page was served indexable
  // no matter what the database said. Seventh instance of this class, after
  // personality, village, tag, city, event and country — which is why
  // detailIndexableGate.test.ts asserts the pairing for every builder rather
  // than for the one just fixed.
  return { meta, body, jsonLd: renderLd(prune(lodgingLd)), indexable: row.seo_indexable !== false };
}

// Queer villages — /villages/:slug

async function villageDetail(
  env: Env,
  slug: string,
  pathname: string,
): Promise<DetailResult | null> {
  // duplicate_of_id=is.null — see the identical comment in venueDetail.
  const rows = await fetchRows(
    env,
    'queer_villages',
    'name,slug,description,history,latitude,longitude,images,image_url,notable_landmarks,website,updated_at,seo_indexable',
    `slug=eq.${encodeURIComponent(slug)}&duplicate_of_id=is.null`,
    1,
  );
  const row = rows[0] ?? null;
  if (!row) return null;

  const name = stringField(row, 'name') ?? slug;
  const description = stringField(row, 'description') ?? '';
  const history = stringField(row, 'history') ?? '';
  const landmarks = arrayField(row, 'notable_landmarks') ?? [];
  const image =
    stringField(row, 'image_url') ?? (arrayField(row, 'images')?.[0] as string | undefined);

  const meta: RouteMeta = {
    title: truncate(`${name} — Queer village${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description || `${name} — historic queer neighborhood and travel destination on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: safeOgImage(image ?? DEFAULT_OG_IMAGE),
  };

  const landmarksList = landmarks
    .filter((l): l is string => typeof l === 'string' && l.length > 0)
    .map((l) => `<li>${escape(l)}</li>`)
    .join('\n        ');

  const glossary = await getGlossaryVocabulary(env);
  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(name)}</h1>
      ${description ? paragraphsHtmlLinked(description, glossary) : ''}
      ${history ? `<section><h2>History</h2>${paragraphsHtmlLinked(history, glossary)}</section>` : ''}
      ${landmarksList ? `<section><h2>Notable landmarks</h2><ul>\n        ${landmarksList}\n      </ul></section>` : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/places">All places</a></li>
        <li><a href="/travel">Travel</a></li>
      </ul>
    </nav>
  </main>`;

  const placeLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name,
    description: description || undefined,
    url: `${SITE_ORIGIN}${pathname}`,
    image,
    geo:
      numField(row, 'latitude') !== undefined && numField(row, 'longitude') !== undefined
        ? {
            '@type': 'GeoCoordinates',
            latitude: numField(row, 'latitude'),
            longitude: numField(row, 'longitude'),
          }
        : undefined,
  };

  // seo_indexable was missing from both the select list and this return until
  // 2026-08-24, so every village page was indexable no matter what the column
  // said — the same hole personalityDetail had (see the comment at its return).
  // run_village_trust_recompute now sets the column false for the zero-content
  // 'ghost' tier, and this is the half that makes that visible to crawlers.
  return { meta, body, jsonLd: renderLd(prune(placeLd)), indexable: row.seo_indexable !== false };
}

// Tags — /tags/:slug

/**
 * Mirror of the SQL `public.tag_is_anon_gated(is_sensitive, verification_status)`
 * (20261220113000), which is also what `unified_tags_public_gated_read` is
 * written through. Keep the three in step: this is the only copy RLS cannot
 * enforce for us.
 *
 * It is needed because `fetchRows` PREFERS the service-role key, which bypasses
 * RLS entirely. On prod the Pages function has only the anon key, so a gated tag
 * already comes back as `null` and the `isGatedEntity` branch handles it — but
 * that is an accident of which secret is bound, not a guarantee. With a
 * service-role key configured (previews, local) the row arrives in full and this
 * is the only thing standing between an unreviewed explicit definition and the
 * crawler-visible `<article>` body. `seo_indexable=false` alone is not enough:
 * it suppresses indexing, not the prose we hand over.
 *
 * NULL `verification_status` means UNVERIFIED, not "not gated" — the SQL policy
 * denies on it (`= any(...)` yields NULL, not false), so the default here must
 * deny too.
 */
export function tagIsAnonGated(row: {
  is_sensitive?: unknown;
  verification_status?: unknown;
}): boolean {
  if (row.is_sensitive !== true) return false;
  const status = typeof row.verification_status === 'string' ? row.verification_status : '';
  return status !== 'reviewed' && status !== 'locked';
}

async function tagDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  // status=eq.active mirrors fetchTagWithCategories in src/hooks/usePageFetchers.ts,
  // and is the same trick as venueDetail's duplicate_of_id=is.null above: a merged
  // or deprecated tag keeps its row at its old slug, so without this filter the
  // edge happily titled `<title>Rack | Queer Guide</title>` while the SPA rendered
  // "No such term" underneath it — a soft 404 on every one of the 144 merged and
  // 5,802 deprecated tags. Excluding them here lets the caller's `!detail` check
  // fall through to resolveSlugRedirect (301 for the 127 that have a live
  // canonical) and then to the hard 404 (correct for a retired concept).
  const rows = await fetchRows(
    env,
    'unified_tags',
    'id,name,slug,description,short_description,long_description,category,wikipedia_url,wikidata_id,seo_indexable,is_sensitive,verification_status,updated_at',
    `slug=eq.${encodeURIComponent(slug)}&status=eq.active`,
    1,
  );
  const row = rows[0] ?? null;
  // Same two lines as milestoneDetail/guideDetail, for the tag gate rather than
  // the safety gate. A null here is ambiguous under the anon key — the row may
  // exist and be hidden — so ask the boolean RPC before conceding a 404. That
  // matters more than it looks: `!detail` on a detail path makes the middleware
  // emit a REAL 404, so without this the SPA never mounts and the sign-in gate
  // added in src/pages/TagDetail.tsx could never be reached on a hard load.
  // Measured on prod 2026-09-03: /tags/footjob answered 404 to a browser UA.
  //
  // A merged or deprecated tag is excluded by `status='active'` on both sides,
  // so it still falls through to resolveSlugRedirect's 301.
  if (!row) return (await isGatedEntity(env, 'tag', slug)) ? gatedDetailResult() : null;
  if (tagIsAnonGated(row)) return gatedDetailResult();

  // Curated legal citations for law tags. The SPA renders these into its own
  // DefinedTerm, but a crawler that does not run JS only ever sees THIS one, so
  // it has to be built here too or the citation is invisible to exactly the
  // consumer JSON-LD exists for.
  //
  // `is_public=eq.true` is MANDATORY and is not a duplicate of the RLS policy:
  // fetchRows authenticates with the service role, which bypasses RLS entirely,
  // so without it this would publish all ~8,700 wikipedia/wikidata backfill rows
  // as legal citations. Same trap as the draft-personalities leak.
  const tagId = stringField(row, 'id');
  //
  // `source_type` is selected because since 20261013110300 this table publishes
  // TWO kinds of citation. Clinical guidance is not law, so it gets its own
  // heading and its own JSON-LD node type below — rendering the UCSF trans care
  // guidelines under "Source of law" would tell a crawler they are a legal
  // instrument.
  const publishedRows = tagId
    ? await fetchRows(
        env,
        'tag_sources',
        'source_type,official_title,source_url,jurisdiction,adopted_year,instrument_status',
        `tag_id=eq.${encodeURIComponent(tagId)}&is_public=eq.true`,
        10,
      )
    : [];
  const allCitations = publishedRows
    .map((r) => ({
      type: stringField(r, 'source_type'),
      title: stringField(r, 'official_title'),
      url: stringField(r, 'source_url'),
      juris: stringField(r, 'jurisdiction'),
      status: stringField(r, 'instrument_status'),
      year: numField(r, 'adopted_year'),
    }))
    .filter((c): c is typeof c & { title: string; url: string } =>
      Boolean(c.title && c.url),
    );
  const citations = allCitations.filter((c) => c.type !== 'clinical_guideline');
  const clinicalCitations = allCitations.filter((c) => c.type === 'clinical_guideline');

  const name = stringField(row, 'name') ?? slug;
  // TWO FIELDS, NOT ONE — they had been the same variable, with
  // `long_description` first, so the 155-char meta description was a
  // mid-sentence slice of the wiki body ("…the average survival time…") on
  // every tag that has one. Worse, src/pages/TagDetail.tsx's useMeta picks
  // `description` FIRST, so the crawler and the reader were served different
  // fields for the same URL — the inverse of the byte-identical-title fix
  // noted above, and invisible unless the two are compared directly.
  //
  // On /tags/hiv that meant humans read "with effective treatment … cannot be
  // transmitted sexually" while Google indexed "without treatment, the average
  // survival time … is 9 to 11 years". A stigma difference, not a cosmetic one.
  const article =
    stringField(row, 'long_description') ??
    stringField(row, 'description') ??
    stringField(row, 'short_description') ??
    '';
  // Precedence mirrors the SPA's useMeta exactly. A meta description wants the
  // curated one-liner; the crawler-visible <article> below still gets the long
  // prose, which is what it is for.
  const summary =
    stringField(row, 'description') ??
    stringField(row, 'short_description') ??
    stringField(row, 'long_description') ??
    '';
  const category = stringField(row, 'category');

  const meta: RouteMeta = {
    // Byte-identical to the SPA's `useMeta({ title: tag.name })`. The edge used
    // to append "— Topic", so a crawler and a reader saw two different titles
    // for the same URL.
    title: truncate(`${name}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      summary || `Articles, venues and events about ${name} on Queer Guide.`,
      MAX_DESC,
    ),
    // Glossary photography is retired (tags render drawn TagPlates); the SPA's
    // useMeta emits no ogImage either, so both surfaces fall to the site card.
    ogImage: safeOgImage(DEFAULT_OG_IMAGE),
  };

  const [glossary, linkedContent] = await Promise.all([
    getGlossaryVocabulary(env),
    // Best-effort: a failed content lookup must leave the definition page
    // intact, not blank it.
    tagId ? tagLinkedContentHtml(env, tagId, name).catch(() => '') : Promise.resolve(''),
  ]);
  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(name)}</h1>
      ${category ? `<p><strong>Category:</strong> ${escape(category)}</p>` : ''}
      ${article ? paragraphsHtmlLinked(article, glossary, { currentSlug: slug }) : `<p>Browse content tagged ${escape(name)} on Queer Guide.</p>`}
      ${
        citations.length
          ? `<section><h2>Source of law</h2><ul>${citations
              .map(
                (c) =>
                  `<li><a href="${escape(c.url)}" rel="noopener">${escape(c.title)}</a>${
                    c.juris ? ` — ${escape(c.juris === 'INT' ? 'International' : c.juris)}` : ''
                  }${c.year ? ` (${c.year})` : ''}${
                    c.status ? ` — ${escape(LAW_STATUS_LABEL[c.status] ?? c.status)}` : ''
                  }</li>`,
              )
              .join('')}</ul></section>`
          : ''
      }
      ${
        clinicalCitations.length
          ? `<section><h2>Clinical guidance</h2><ul>${clinicalCitations
              .map(
                (c) =>
                  `<li><a href="${escape(c.url)}" rel="noopener">${escape(c.title)}</a>${
                    c.year ? ` (${c.year} edition)` : ''
                  }</li>`,
              )
              .join('')}</ul></section>`
          : ''
      }
      ${linkedContent}
      ${stringField(row, 'wikipedia_url') ? `<p><a href="${escape(stringField(row, 'wikipedia_url')!)}" rel="noopener">Read more on Wikipedia</a></p>` : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/tags">Glossary</a></li>
        <li><a href="/news">Related news</a></li>
        <li><a href="/blog">Long-form essays</a></li>
      </ul>
    </nav>
  </main>`;

  const thingLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name,
    // Summary, not the article: src/lib/tags/tagJsonLd.ts is fed the SPA's
    // summary-first `description`, and the two DefinedTerm documents for one
    // URL must not disagree.
    description: summary || undefined,
    url: `${SITE_ORIGIN}${pathname}`,
    sameAs: [stringField(row, 'wikipedia_url'), ...allCitations.map((c) => c.url)].filter(Boolean)
      .length
      ? [stringField(row, 'wikipedia_url'), ...allCitations.map((c) => c.url)].filter(Boolean)
      : undefined,
    identifier: stringField(row, 'wikidata_id'),
    // No `legislationDate` / `datePublished`: schema.org types both as a Date and
    // only a year is held, so emitting one would assert a precision we do not
    // have. Kept deliberately identical to src/lib/tags/tagJsonLd.ts — including
    // the split by kind, since clinical guidance emitted as `Legislation` would
    // tell a crawler the UCSF guidelines are law.
    citation: allCitations.length
      ? allCitations.map((c) =>
          c.type === 'clinical_guideline'
            ? { '@type': 'CreativeWork', name: c.title, url: c.url }
            : {
                '@type': 'Legislation',
                name: c.title,
                url: c.url,
                legislationJurisdiction: c.juris || undefined,
              },
        )
      : undefined,
  };

  // Honour the row's own SEO gate. Omitting this made every tag page
  // unconditionally indexable to crawlers NO MATTER WHAT seo_indexable said —
  // the same hole personalityDetail and villageDetail each had, and it silently
  // defeated both writers of the column: run_tag_thin_page_reindex
  // (20260921110000) and the 304-page verbatim-overlap deindex
  // (20261007160100). Measured on prod before this fix: /tags/fetish,
  // /tags/felching, /tags/compersion, /tags/hentai and /tags/gooning all had
  // seo_indexable=false in the database and served NO robots meta at all.
  return { meta, body, jsonLd: renderLd(prune(thingLd)), indexable: row.seo_indexable !== false };
}

// Milestones — queer-history timeline entries at /history/:slug

async function milestoneDetail(
  env: Env,
  slug: string,
  pathname: string,
): Promise<DetailResult | null> {
  const rows = await fetchRows(
    env,
    'milestones',
    'title,slug,description,date,date_precision,date_end,location,region,city_name,country_name,category,impact,significance,sources,image_url,seo_indexable,safety_gated,updated_at',
    `slug=eq.${encodeURIComponent(slug)}&status=eq.published&duplicate_of_id=is.null`,
    1,
  );
  const row = rows[0] ?? null;
  if (!row) return (await isGatedEntity(env, 'milestone', slug)) ? gatedDetailResult() : null;
  if (row.safety_gated === true) return gatedDetailResult();

  const title = stringField(row, 'title') ?? slug;
  const description = stringField(row, 'description') ?? '';
  const date = stringField(row, 'date') ?? '';
  const precision = stringField(row, 'date_precision') ?? 'day';
  const year = date.slice(0, 4);
  const cityName = stringField(row, 'city_name');
  const countryName = stringField(row, 'country_name');
  const place = [cityName, countryName].filter(Boolean).join(', ');
  const image = stringField(row, 'image_url');
  const sources = Array.isArray(row.sources) ? (row.sources as Array<Record<string, unknown>>) : [];
  const sourceUrls = sources
    .map((sRow) => (typeof sRow.url === 'string' ? sRow.url : null))
    .filter((u): u is string => Boolean(u));

  const meta: RouteMeta = {
    title: truncate(`${title} (${year}) — Queer History${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description || `${title} (${year}) — a milestone of queer history on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: safeOgImage(image ?? DEFAULT_OG_IMAGE),
  };

  const glossary = await getGlossaryVocabulary(env);
  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(title)}</h1>
      <p><strong>${escape(precision === 'year' ? year : date)}</strong>${place ? ` — ${escape(place)}` : ''}</p>
      ${description ? paragraphsHtmlLinked(description, glossary) : ''}
      ${sources.length ? `<h2>Sources</h2><ul>${sources.map((sRow) => `<li>${typeof sRow.url === 'string' ? `<a href="${escape(sRow.url)}" rel="nofollow noopener">${escape(String(sRow.label ?? sRow.url))}</a>` : escape(String(sRow.label ?? ''))}</li>`).join('')}</ul>` : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/history">Queer history timeline</a></li>
        <li><a href="/personalities">Personalities</a></li>
      </ul>
    </nav>
  </main>`;

  // ISO-8601 reduced precision: year-only dates emit "1969" (valid, honest).
  const isoDate = precision === 'year' ? year : precision === 'month' ? date.slice(0, 7) : date;
  const dateEnd = stringField(row, 'date_end');
  const eventLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: title,
    startDate: isoDate,
    endDate: dateEnd ?? undefined,
    description: description || undefined,
    image,
    location: place
      ? { '@type': 'Place', name: stringField(row, 'location') ?? place, address: place }
      : undefined,
    sameAs: sourceUrls.length ? sourceUrls : undefined,
    url: `${SITE_ORIGIN}${pathname}`,
  };

  return { meta, body, jsonLd: renderLd(prune(eventLd)), indexable: row.seo_indexable === true };
}

// Guides (unified editorial family: guide | list | quest)

async function guideDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  const rows = await fetchRows(
    env,
    'guides',
    'title,slug,format,dek,intro_md,hero_image_path,category,reading_time_min,pick_count,published_at,updated_at,safety_gated',
    `slug=eq.${encodeURIComponent(slug)}&status=eq.published`,
    1,
  );
  const row = rows[0] ?? null;
  if (!row) return (await isGatedEntity(env, 'guide', slug)) ? gatedDetailResult() : null;
  if (row.safety_gated === true) return gatedDetailResult();

  const title = stringField(row, 'title') ?? slug;
  const dek = stringField(row, 'dek');
  const intro = stringField(row, 'intro_md') ?? '';
  const format = stringField(row, 'format') ?? 'guide';
  const formatLabel =
    format === 'quest' ? 'Community quest' : format === 'list' ? 'Curated list' : 'Guide';
  const picks = numField(row, 'pick_count');
  const hero = stringField(row, 'hero_image_path');

  const meta: RouteMeta = {
    title: truncate(`${title}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      dek ??
        (intro
          ? collapseWs(stripHtml(intro))
          : `${formatLabel} on Queer Guide${picks ? ` — ${picks} picks` : ''}.`),
      MAX_DESC,
    ),
    ogImage: safeOgImage(hero && /^https?:\/\//.test(hero) ? hero : DEFAULT_OG_IMAGE),
  };

  const glossary = await getGlossaryVocabulary(env);
  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(title)}</h1>
      ${dek ? `<p><em>${escape(dek)}</em></p>` : ''}
      ${intro ? paragraphsHtmlLinked(intro, glossary) : ''}
      ${picks ? `<p>${picks} picks in this ${escape(formatLabel.toLowerCase())}.</p>` : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/guides">All guides</a></li>
        <li><a href="/venues">Venues</a></li>
        <li><a href="/events">Events</a></li>
      </ul>
    </nav>
  </main>`;

  const articleLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: meta.description,
    image: meta.ogImage,
    datePublished: stringField(row, 'published_at'),
    dateModified: stringField(row, 'updated_at'),
    author: { '@type': 'Organization', name: 'Queer Guide' },
    url: `${SITE_ORIGIN}${pathname}`,
  };

  return { meta, body, jsonLd: renderLd(prune(articleLd)), indexable: true };
}

// Dispatch

const DETAIL_ROUTE_RE =
  /^\/(venues?|events?|news|personalities|personality|city|country|hotels?|villages?|tags?|history|guides)\/([^/?#]+)\/?$/;

// Static SPA sub-routes that share a segment with detail routes
// (/venues/guides, /events/guides, legacy /venues/leaderboard redirect, …).
// These are never entity slugs — treating them as one made the middleware
// return a hard 404 for the whole page.
const RESERVED_DETAIL_SLUGS = new Set([
  'guides',
  'leaderboard',
  'passport',
  'share',
  'hotels',
  'events',
  'news',
  'marketplace',
  'travel',
  'groups',
  'resources',
  // Missing entries here are invisible until someone loads the page: the route
  // exists in the SPA, but the edge hard-404s it before React ever runs.
  // /news/all (the "Open archive" CTA), /news/me and /personalities/milestones
  // were all dead in production this way. `reservedDetailSlugs.test.ts` parses
  // src/routes.tsx and fails if a static sub-route is missing from this set.
  'all',
  'me',
  'milestones',
  // /city/compare — the two-city comparison tool, not a city slug.
  'compare',
  // /tags/interactions — the drug interaction chart. Not a tag slug; the SPA
  // route also reserves the name so no tag can ever claim it.
  'interactions',
  // /tags/sti-guide — the STI transmission/testing/protection guide. Same
  // shape as interactions: a static page under the tag namespace.
  'sti-guide',
]);

function matchDetailPath(pathname: string): RegExpMatchArray | null {
  const m = pathname.match(DETAIL_ROUTE_RE);
  if (!m) return null;
  if (RESERVED_DETAIL_SLUGS.has(decodeURIComponent(m[2]).toLowerCase())) return null;
  return m;
}

/**
 * True if the URL matches a detail-route pattern (regardless of whether the
 * row actually exists). The middleware uses this to decide whether a missing
 * detail row should produce a 404 vs. fall through to the SPA.
 */
export function isDetailPath(pathname: string): boolean {
  return matchDetailPath(pathname) !== null;
}

// Merged/renamed-entity slug redirects, one row per `kindRaw` match. Each
// entity's merge core (or, for guides, the rename flow) leaves the old slug in
// `<redirectTable>` (old_slug → <redirectIdColumn>); this drives the generic
// lookup below. Marketplace and organizations aren't here — they have no edge
// SSR detail route at all (not in DETAIL_ROUTE_RE), so an edge 301 isn't
// architecturally possible for them yet.
//
// Tags used to be excluded here, on the reasoning that "their public routes are
// topic/category pages, not a single /tags/:slug detail page, so the redirect
// target isn't a simple slug swap". That stopped being true when TagDetail.tsx
// lifted /tags/:slug out of the index page into a real detail route, and the
// stale comment is why 144 merged tags stayed soft-404s for months: the
// mechanism that fixes them was sitting right here, already built, with a note
// on it saying it did not apply. tag_slug_redirects is old_slug → tag_id, which
// is exactly the shape this lookup wants.
const SLUG_REDIRECT_KINDS: Array<{
  test: (kindRaw: string) => boolean;
  redirectTable: string;
  redirectIdColumn: string;
  entityTable: string;
  routePrefix: string;
  /** Extra PostgREST filter on the CANONICAL row lookup. See the tags entry. */
  entityFilter?: string;
}> = [
  {
    test: (k) => k.startsWith('venue'),
    redirectTable: 'venue_slug_redirects',
    redirectIdColumn: 'venue_id',
    entityTable: 'venues',
    routePrefix: '/venues',
  },
  {
    test: (k) => k.startsWith('event'),
    redirectTable: 'event_slug_redirects',
    redirectIdColumn: 'event_id',
    entityTable: 'events',
    routePrefix: '/events',
  },
  {
    test: (k) => k.startsWith('personalit'),
    redirectTable: 'personality_slug_redirects',
    redirectIdColumn: 'personality_id',
    entityTable: 'personalities',
    routePrefix: '/personalities',
  },
  {
    test: (k) => k === 'country',
    redirectTable: 'country_slug_redirects',
    redirectIdColumn: 'country_id',
    entityTable: 'countries',
    routePrefix: '/country',
  },
  {
    test: (k) => k.startsWith('hotel'),
    redirectTable: 'hotel_slug_redirects',
    redirectIdColumn: 'hotel_id',
    entityTable: 'hotels',
    routePrefix: '/hotels',
  },
  {
    test: (k) => k.startsWith('village'),
    redirectTable: 'village_slug_redirects',
    redirectIdColumn: 'village_id',
    entityTable: 'queer_villages',
    routePrefix: '/villages',
  },
  {
    test: (k) => k === 'news',
    redirectTable: 'news_slug_redirects',
    redirectIdColumn: 'article_id',
    entityTable: 'news_articles',
    routePrefix: '/news',
  },
  {
    test: (k) => k === 'history',
    redirectTable: 'milestone_slug_redirects',
    redirectIdColumn: 'milestone_id',
    entityTable: 'milestones',
    routePrefix: '/history',
  },
  {
    test: (k) => k === 'guides',
    redirectTable: 'guide_slug_redirects',
    redirectIdColumn: 'guide_id',
    entityTable: 'guides',
    routePrefix: '/guides',
  },
  {
    test: (k) => k.startsWith('tag'),
    redirectTable: 'tag_slug_redirects',
    redirectIdColumn: 'tag_id',
    entityTable: 'unified_tags',
    routePrefix: '/tags',
    // status=eq.active is load-bearing, not belt-and-braces. Measured on prod
    // 2026-08-16: 57 of the 195 tag_slug_redirects rows point at a tag that is
    // itself deprecated (the diacritic-repair cohort — `alex-j-rgen` →
    // `alex-jurgen`, now retired). Without this filter each of those becomes a
    // 301 into a hard 404, which is worse for a crawler than the 404 it
    // replaces. With it, resolveSlugRedirect returns null and the middleware
    // falls through to the 404 — the right answer for a retired concept.
    // resolve_tag_slug() in Postgres joins `status = 'active'` for the same
    // reason; this keeps the two resolvers telling one story.
    entityFilter: 'status=eq.active',
  },
];

/**
 * Merged/renamed-entity redirect. A dropped or renamed row leaves its old slug
 * in a `<type>_slug_redirects` table (old_slug → canonical id). When a detail
 * route's row is missing, check for a redirect and return the CURRENT detail
 * path so the middleware can emit a real 301 (keeps SEO link equity). Returns
 * the de-localised target path, or null if no redirect exists.
 */
export async function resolveSlugRedirect(env: Env, pathname: string): Promise<string | null> {
  if (!env.SUPABASE_URL || (!env.SUPABASE_ANON_KEY && !env.SUPABASE_SERVICE_ROLE_KEY)) {
    return null;
  }
  const m = matchDetailPath(pathname);
  if (!m) return null;
  const [, kindRaw, rawSlug] = m;
  const slug = decodeURIComponent(rawSlug);
  const kind = SLUG_REDIRECT_KINDS.find((k) => k.test(kindRaw));
  if (!kind) return null;
  try {
    const redirectRows = await fetchRows(
      env,
      kind.redirectTable,
      kind.redirectIdColumn,
      `old_slug=eq.${encodeURIComponent(slug)}`,
      1,
      // ORDER BY old_slug, not fetchRows' `id.asc` default. Eleven of the twelve
      // `<type>_slug_redirects` tables are keyed on old_slug and have NO `id`
      // column at all — PostgREST answers `order=id.asc` on them with a 400, so
      // fetchRows returned [] and every merged venue, event, personality, hotel,
      // village, country, news article, milestone, guide, org and marketplace
      // listing hard-404'd instead of 301-ing.
      //
      // tag_slug_redirects is the ONE table that happens to carry an `id`, which
      // is why tags redirected correctly and hid this for everything else: the
      // mechanism looked healthy because the entity someone last tested worked.
      // Measured on prod 2027-06-02 — /tags/sluts -> /tags/slut (301), while
      // /venues/berghain-7 and /events/gayhane both returned a hard 404 with no
      // Location header.
      'old_slug.asc',
    );
    const canonicalId = stringField(redirectRows[0] ?? {}, kind.redirectIdColumn);
    if (!canonicalId) return null;
    // Resolve the target through `<redirectIdColumn>` rather than trusting a
    // `new_slug` column: prod has a redirect row whose new_slug still reads
    // `munchen` while the tag it points at was since renamed to `munich`. The
    // id is the durable pointer, the denormalized slug is not.
    const canonicalRows = await fetchRows(
      env,
      kind.entityTable,
      'slug',
      `id=eq.${canonicalId}${kind.entityFilter ? `&${kind.entityFilter}` : ''}`,
      1,
    );
    const newSlug = stringField(canonicalRows[0] ?? {}, 'slug');
    if (!newSlug || newSlug === slug) return null;
    return `${kind.routePrefix}/${newSlug}`;
  } catch {
    return null;
  }
}

export async function resolveDetailRoute(env: Env, pathname: string): Promise<DetailResult | null> {
  if (!env.SUPABASE_URL || (!env.SUPABASE_ANON_KEY && !env.SUPABASE_SERVICE_ROLE_KEY)) {
    return null;
  }
  const m = matchDetailPath(pathname);
  if (!m) return null;
  const [, kindRaw, rawSlug] = m;
  const slug = decodeURIComponent(rawSlug);
  try {
    if (kindRaw.startsWith('venue')) return await venueDetail(env, slug, pathname);
    if (kindRaw.startsWith('event')) return await eventDetail(env, slug, pathname);
    if (kindRaw === 'news') return await newsDetail(env, slug, pathname);
    if (kindRaw.startsWith('personalit')) return await personalityDetail(env, slug, pathname);
    if (kindRaw === 'city') return await cityDetail(env, slug, pathname);
    if (kindRaw === 'country') return await countryDetail(env, slug, pathname);
    if (kindRaw.startsWith('hotel')) return await hotelDetail(env, slug, pathname);
    if (kindRaw.startsWith('village')) return await villageDetail(env, slug, pathname);
    if (kindRaw.startsWith('tag')) return await tagDetail(env, slug, pathname);
    if (kindRaw === 'history') return await milestoneDetail(env, slug, pathname);
    if (kindRaw === 'guides') return await guideDetail(env, slug, pathname);
  } catch {
    return null;
  }
  return null;
}

function prune<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const nested = prune(v as Record<string, unknown>);
      if (Object.keys(nested).length > 0) out[k] = nested;
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
