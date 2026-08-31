#!/usr/bin/env node
/**
 * Match the Kinktionary vocabulary signal against unified_tags and write the
 * disposition file the revival/creation migrations are generated from.
 *
 * Reads:  scripts/data-quality/kinktionary-term-index.json   (committed signal)
 *         unified_tags + tag_aliases via PostgREST (SERVICE ROLE — see below)
 * Writes: scripts/data-quality/out/kinktionary-disposition.json (committed)
 *
 * WHY THE MATCH IS BY SLUG, NOT BY NAME
 *
 * `normalize_tag_slug()` is what decides whether a term already exists in this
 * corpus. Matching on the display name alone answers a different question and
 * gets the buckets wrong: "Leather Fetish" is a *creation* by name and a
 * *revival* by slug if `leather-fetish` already sits deprecated. Every bucket
 * below is therefore keyed on the normalized slug, and names are compared only
 * as a secondary arm so a term whose name normalizes differently from its slug
 * is still found.
 *
 * The comparison runs against ALL statuses, not just active. The whole point of
 * this program is that ~1,000 of these already exist as deprecated rows with
 * finished prose; a match restricted to active tags would report them as
 * missing and the migrations would insert duplicates.
 *
 * Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/data-quality/match-kinktionary-to-tags.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIGNAL = join(HERE, 'kinktionary-term-index.json');
const OUT_DIR = join(HERE, 'out');
const OUT = join(OUT_DIR, 'kinktionary-disposition.json');

const URL_BASE = 'https://xqeacpakadqfxjxjcewc.supabase.co';

/**
 * THIS SCRIPT MUST NOT RUN ON THE ANON KEY, AND THAT IS NOT A CONVENIENCE.
 *
 * `unified_tags_public_gated_read` lets anon read a row only when
 *   NOT is_sensitive  OR  verification_status IN ('reviewed','locked')
 * and 652 rows on prod are is_sensitive with verification_status='auto', 649 of
 * them deprecated. An anon run cannot see them, so it reports them as ABSENT —
 * "no such tag, would need writing from scratch" — when they are in fact the
 * deprecated-with-prose rows this whole program exists to revive.
 *
 * That is not a hypothetical. Waves 1-4 were generated from an anon run and
 * silently skipped 111 corroborated tags, including bastinado, figging,
 * omorashi, sadomasochism, leather-fetish, macrophilia and 48 Roles. The RLS
 * predicate keys on is_sensitive, and on this corpus is_sensitive means kink —
 * so the rows it hides are precisely the ones that matter most here.
 *
 * A row-count assertion does NOT catch it: a paginated read and a COUNT taken
 * through the same predicate are filtered identically, so the check passes
 * vacuously. Refusing the anon key up front is the only guard that works.
 */
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY not set.\n' +
      'This script must bypass RLS: unified_tags_public_gated_read hides ~650 sensitive\n' +
      'deprecated tags from anon, and they are exactly the kink vocabulary this matcher\n' +
      'exists to find. Running on the anon key silently under-reports the corpus.',
  );
  process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

/**
 * Mirror of public.normalize_tag_slug(): lowercase, strip diacritics, drop
 * anything non-alphanumeric to a single hyphen, trim hyphens. Kept deliberately
 * close to the SQL so a term that matches here matches there.
 */
const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Looser key for the secondary arm — hyphens removed, parentheticals dropped. */
const loose = (s) => slugify(s.replace(/\(.*?\)/g, ' ')).replace(/-/g, '');

/**
 * ORDER IS NOT OPTIONAL HERE.
 *
 * PostgREST paginates with limit/offset over an unordered result set, and
 * Postgres makes no ordering guarantee between two such queries — so rows drift
 * between pages and some are never returned at all. That is not theoretical:
 * the first run of this script classified `figging`, `bastinado` and `omorashi`
 * as ABSENT while all three existed as deprecated rows with full prose, and
 * they were consequently left out of the revival. A stable sort key is what
 * makes the page boundaries disjoint.
 *
 * The count is asserted by the caller against a separate unpaginated count, so
 * a future regression fails loudly instead of silently shrinking the corpus.
 */
async function pageAll(path, orderBy = 'id') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(
      `${URL_BASE}/rest/v1/${path}&order=${orderBy}.asc&limit=1000&offset=${offset}`,
      { headers: H },
    );
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

/** Exact row count, straight from PostgREST's Content-Range header. */
async function exactCount(table) {
  const r = await fetch(`${URL_BASE}/rest/v1/${table}?select=id&limit=1`, {
    headers: { ...H, Prefer: 'count=exact' },
  });
  const range = r.headers.get('content-range') || '';
  return Number(range.split('/')[1] ?? NaN);
}

async function main() {
  const signal = JSON.parse(await readFile(SIGNAL, 'utf8'));
  const tags = await pageAll(
    'unified_tags?select=id,slug,name,status,category_id,description,short_description,long_description,wikidata_id,is_sensitive,verification_status,seo_indexable,image_url',
  );
  const aliases = await pageAll('tag_aliases?select=alias_name,alias_slug,canonical_tag_id,review_status');

  // Fail loudly if pagination lost rows, rather than quietly reporting a smaller
  // corpus and under-reviving. NOTE this only catches PAGINATION loss, not RLS
  // filtering — both sides of the comparison go through the same predicate, so
  // on an anon key it passes vacuously. Refusing the anon key above is what
  // covers the RLS case.
  const expected = await exactCount('unified_tags');
  if (Number.isFinite(expected) && tags.length !== expected) {
    throw new Error(
      `paginated ${tags.length} unified_tags rows but the table holds ${expected} — pagination dropped rows`,
    );
  }

  // A service-role read sees the sensitive rows anon cannot. If none came back,
  // the key is not actually privileged whatever it claims to be.
  const sensitiveUnreviewed = tags.filter(
    (t) => t.is_sensitive && !['reviewed', 'locked'].includes(t.verification_status),
  ).length;
  if (sensitiveUnreviewed === 0) {
    throw new Error(
      'read 0 sensitive-unreviewed tags — this key is being filtered by RLS, so the ' +
        'corpus is incomplete. Use a real SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  const bySlug = new Map();
  const byLoose = new Map();
  for (const t of tags) {
    bySlug.set(t.slug, t);
    for (const k of [loose(t.slug), loose(t.name)]) if (!byLoose.has(k)) byLoose.set(k, t);
  }
  const aliasByLoose = new Map();
  for (const a of aliases) {
    const k = loose(a.alias_name);
    if (!aliasByLoose.has(k)) aliasByLoose.set(k, a);
  }

  const buckets = { active: [], deprecated: [], merged: [], alias: [], absent: [] };

  for (const t of signal.terms) {
    const slug = slugify(t.term);
    const hit = bySlug.get(slug) || byLoose.get(loose(t.term));
    const row = {
      term: t.term,
      section: t.section,
      slug_candidate: slug,
    };
    if (hit) {
      row.slug = hit.slug;
      row.status = hit.status;
      row.has_description =
        Boolean((hit.description || '').trim()) || Boolean((hit.short_description || '').trim());
      row.long_description_len = (hit.long_description || '').length;
      row.wikidata_id = hit.wikidata_id;
      row.category_id = hit.category_id;
      row.image_url = hit.image_url;
      const b = hit.status === 'active' ? 'active' : hit.status === 'merged' ? 'merged' : 'deprecated';
      buckets[b].push(row);
      continue;
    }
    const al = aliasByLoose.get(loose(t.term));
    if (al) {
      row.alias_of = al.canonical_tag_id;
      row.alias_review_status = al.review_status;
      buckets.alias.push(row);
      continue;
    }
    buckets.absent.push(row);
  }

  // A slug can be reached by two Kinktionary terms (e.g. a term and its
  // parenthesised expansion). Migrations act per slug, so de-duplicate here
  // rather than letting a migration update the same row twice.
  const dedupeBySlug = (rows) => {
    const seen = new Map();
    for (const r of rows) if (!seen.has(r.slug)) seen.set(r.slug, r);
    return [...seen.values()];
  };
  buckets.deprecated = dedupeBySlug(buckets.deprecated);
  buckets.active = dedupeBySlug(buckets.active);

  const revivable = buckets.deprecated.filter((r) => r.has_description);
  const needsProse = buckets.deprecated.filter((r) => !r.has_description);

  const summary = {
    terms: signal.terms.length,
    active: buckets.active.length,
    deprecated: buckets.deprecated.length,
    deprecated_revivable_now: revivable.length,
    deprecated_needing_prose: needsProse.length,
    merged: buckets.merged.length,
    alias: buckets.alias.length,
    absent: buckets.absent.length,
    absent_roles: buckets.absent.filter((r) => r.section === 'roles').length,
    deprecated_roles: buckets.deprecated.filter((r) => r.section === 'roles').length,
    // Every one of these would trip a CI zero-invariant if revived blind.
    deprecated_with_image_url: buckets.deprecated.filter((r) => r.image_url).length,
    deprecated_without_category_id: buckets.deprecated.filter((r) => !r.category_id).length,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT, `${JSON.stringify({ _summary: summary, ...buckets }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nwrote ${OUT}`);
}

main().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
