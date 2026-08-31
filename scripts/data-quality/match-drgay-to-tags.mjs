#!/usr/bin/env node
/**
 * Match the drgay.ch topic signal against unified_tags, and census the health
 * subtree the corrections will act on. Writes the disposition file the drgay
 * migrations are generated from.
 *
 * Reads:  scripts/data-quality/drgay-topic-index.json      (committed signal)
 *         unified_tags + tag_aliases + tag_category_assignments + tag_categories
 *         via PostgREST (SERVICE ROLE — see below)
 * Writes: scripts/data-quality/out/drgay-disposition.json  (committed)
 *
 * WHY THE MATCH IS LOOSE, NOT SLUG-EXACT
 *
 * An exact-slug probe of this corpus reported 18 drgay concepts as absent. Loose
 * matching against ALL statuses cut that to 9: `dark-room`, `internalized-
 * homophobia` (US spelling), `amphetamine`, `benzodiazepines`, `anabolic-
 * steroids`, `3-mmc`, `sex-toy` (singular, deprecated) and `piss-play`
 * (deprecated, 452 chars of finished prose) all already exist under a different
 * slug or a different status. Every one of those nine would have been minted a
 * second time by a migration generated from the strict probe.
 *
 * So: normalized-slug arm first, loose arm second, alias arm third, and the
 * comparison runs against active AND deprecated AND merged. A deprecated row
 * with prose is a revival, not a creation, and the two are not interchangeable.
 *
 * Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/data-quality/match-drgay-to-tags.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIGNAL = join(HERE, 'drgay-topic-index.json');
const OUT_DIR = join(HERE, 'out');
const OUT = join(OUT_DIR, 'drgay-disposition.json');

const URL_BASE = 'https://xqeacpakadqfxjxjcewc.supabase.co';

/**
 * THIS SCRIPT MUST NOT RUN ON THE ANON KEY, AND THAT IS NOT A CONVENIENCE.
 *
 * `unified_tags_public_gated_read` lets anon read a row only when
 *   NOT is_sensitive  OR  verification_status IN ('reviewed','locked')
 * and this corpus marks health and kink vocabulary is_sensitive. An anon run
 * cannot see those rows, so it reports them ABSENT — and the generated migration
 * inserts a duplicate of a tag that already exists.
 *
 * That already happened once here: kinktionary waves 1-4 were generated from an
 * anon run and silently skipped 111 corroborated tags. A row-count assertion
 * does NOT catch it, because a paginated read and a COUNT taken through the same
 * predicate are filtered identically and the check passes vacuously. Refusing
 * the anon key up front is the only guard that works.
 */
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY not set.\n' +
      'This script must bypass RLS: unified_tags_public_gated_read hides sensitive\n' +
      'unreviewed tags from anon, and sexual-health vocabulary is exactly what this\n' +
      'matcher exists to find. Running on the anon key silently under-reports the corpus.',
  );
  process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

/** The level-1 categories the correction sweep is scoped to (user decision). */
const SUBTREE = new Set([
  'sexual-health',
  'substances-harm-reduction',
  'mental-health',
  'physical-reproductive',
  'care-access',
  'consent-negotiation',
  'physical-digital-safety',
]);

/** Mirror of public.normalize_tag_slug(). */
const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Looser key — hyphens removed, parentheticals dropped, trailing plural 's'. */
const loose = (s) =>
  slugify(s.replace(/\(.*?\)/g, ' '))
    .replace(/-/g, '')
    .replace(/s$/, '');

/**
 * ORDER IS NOT OPTIONAL. PostgREST paginates limit/offset over an unordered
 * result set and Postgres guarantees no ordering between two such queries, so
 * rows drift between pages and some are never returned. Measured on the
 * kinktionary run: `figging`, `bastinado` and `omorashi` were classified ABSENT
 * while all three existed with full prose.
 */
async function pageAll(path, orderBy = 'id') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1/${path}&order=${orderBy}.asc&limit=1000&offset=${offset}`, {
      headers: H,
    });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function exactCount(table) {
  const r = await fetch(`${URL_BASE}/rest/v1/${table}?select=id&limit=1`, {
    headers: { ...H, Prefer: 'count=exact' },
  });
  return Number((r.headers.get('content-range') || '').split('/')[1] ?? NaN);
}

async function main() {
  const signal = JSON.parse(await readFile(SIGNAL, 'utf8'));
  const tags = await pageAll(
    'unified_tags?select=id,slug,name,status,category_id,category,description,short_description,' +
      'long_description,is_sensitive,is_adult,human_reviewed,verification_status,seo_indexable,usage_count',
  );
  const aliases = await pageAll('tag_aliases?select=id,alias_name,alias_slug,canonical_tag_id,alias_type,review_status');
  const assignments = await pageAll('tag_category_assignments?select=tag_id,category_id,is_primary');
  const categories = await pageAll('tag_categories?select=id,slug,name,level,parent_id');

  const expected = await exactCount('unified_tags');
  if (Number.isFinite(expected) && tags.length !== expected) {
    throw new Error(`paginated ${tags.length} unified_tags rows but the table holds ${expected} — pagination dropped rows`);
  }
  // Proof the key is genuinely privileged. Both sides of a count comparison go
  // through the same RLS predicate, so only an absolute check works.
  const sensitiveUnreviewed = tags.filter(
    (t) => t.is_sensitive && !['reviewed', 'locked'].includes(t.verification_status),
  ).length;
  if (sensitiveUnreviewed === 0) {
    throw new Error('read 0 sensitive-unreviewed tags — this key is being filtered by RLS. Use a real service-role key.');
  }

  const catById = new Map(categories.map((c) => [c.id, c]));
  const junction = new Map(); // tag_id -> [{slug,name,is_primary}]
  for (const a of assignments) {
    const c = catById.get(a.category_id);
    if (!c) continue;
    if (!junction.has(a.tag_id)) junction.set(a.tag_id, []);
    junction.get(a.tag_id).push({ slug: c.slug, name: c.name, is_primary: a.is_primary });
  }

  /**
   * PLACEHOLDER DESCRIPTIONS, DETECTED RATHER THAN LISTED.
   *
   * A short description shared by many tags is not a definition, it is a
   * category stamp left by a bulk import. Computing the set means a fifth string
   * appearing later is caught without editing this file. Measured on prod: four
   * strings cover 182 rows — "Toys tag" (83), "Sexual activity tag" (63),
   * "Philia tag" (24), "Scene safety tag" (12).
   *
   * These are invisible to run_tag_thin_page_reindex(), which deindexes only
   * when description AND short_description are both empty. A placeholder
   * satisfies neither test, so /tags/anal-sex publishes "Sexual activity tag"
   * as its definition and stays indexable.
   */
  const descCount = new Map();
  for (const t of tags) {
    const d = (t.description || '').trim();
    if (d && d.length <= 40) descCount.set(d, (descCount.get(d) ?? 0) + 1);
  }
  const placeholders = new Set([...descCount].filter(([, n]) => n > 5).map(([d]) => d));

  const isPlaceholder = (t) => placeholders.has((t.description || '').trim());
  const inSubtree = (t) => (junction.get(t.id) ?? []).some((c) => SUBTREE.has(c.slug));
  const descLen = (t) => (t.description || '').trim().length;

  const flagsFor = (t) => {
    const f = [];
    if (isPlaceholder(t)) f.push('placeholder_description');
    if (!t.category_id && (junction.get(t.id) ?? []).length) f.push('null_category_id_with_junction');
    if (descLen(t) < 30 && t.seo_indexable && t.status === 'active') f.push('thin_and_indexed');
    if (t.is_adult && (junction.get(t.id) ?? []).some((c) => c.slug === 'venues-nightlife')) {
      f.push('adult_venue_term');
    }
    return f;
  };

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
  const slugById = new Map(tags.map((t) => [t.id, t.slug]));

  const buckets = { active: [], deprecated: [], merged: [], alias: [], absent: [] };
  for (const topic of signal.topics) {
    const slug = slugify(topic.label);
    const hit = bySlug.get(slug) || byLoose.get(loose(topic.label));
    const row = { label: topic.label, section: topic.section, kind: topic.kind, slug_candidate: slug };
    if (hit) {
      Object.assign(row, {
        slug: hit.slug,
        status: hit.status,
        description_len: descLen(hit),
        long_description_len: (hit.long_description || '').length,
        usage_count: hit.usage_count,
        categories: (junction.get(hit.id) ?? []).map((c) => c.slug),
        in_subtree: inSubtree(hit),
        flags: flagsFor(hit),
      });
      buckets[hit.status === 'active' ? 'active' : hit.status === 'merged' ? 'merged' : 'deprecated'].push(row);
      continue;
    }
    const al = aliasByLoose.get(loose(topic.label));
    if (al) {
      row.alias_of = slugById.get(al.canonical_tag_id) ?? al.canonical_tag_id;
      row.alias_review_status = al.review_status;
      buckets.alias.push(row);
      continue;
    }
    buckets.absent.push(row);
  }

  const dedupe = (rows, key) => {
    const seen = new Map();
    for (const r of rows) if (!seen.has(r[key])) seen.set(r[key], r);
    return [...seen.values()];
  };
  buckets.active = dedupe(buckets.active, 'slug');
  buckets.deprecated = dedupe(buckets.deprecated, 'slug');
  buckets.merged = dedupe(buckets.merged, 'slug');
  buckets.absent = dedupe(buckets.absent, 'slug_candidate');

  // The correction sweep is subtree-scoped and is NOT limited to what drgay
  // happens to mention — so it is censused independently of the buckets above.
  const subtree = tags.filter(inSubtree);
  const census = (rows) => ({
    tags: rows.length,
    placeholder_description: rows.filter(isPlaceholder).length,
    thin_desc: rows.filter((t) => descLen(t) < 30).length,
    thin_and_indexed: rows.filter((t) => descLen(t) < 30 && t.seo_indexable).length,
    null_category_id: rows.filter((t) => !t.category_id).length,
    no_long_description: rows.filter((t) => !(t.long_description || '').length).length,
  });

  const summary = {
    signal_topics: signal.topics.length,
    signal_pages: signal._pages,
    matched_active: buckets.active.length,
    matched_deprecated: buckets.deprecated.length,
    matched_merged: buckets.merged.length,
    matched_alias: buckets.alias.length,
    absent: buckets.absent.length,
    placeholder_strings: [...placeholders].sort(),
    placeholder_rows_corpus: tags.filter(isPlaceholder).length,
    placeholder_rows_active_indexed: tags.filter((t) => isPlaceholder(t) && t.status === 'active' && t.seo_indexable)
      .length,
    null_category_id_with_junction_corpus: tags.filter((t) => !t.category_id && (junction.get(t.id) ?? []).length)
      .length,
    subtree: {
      active: census(subtree.filter((t) => t.status === 'active')),
      deprecated: census(subtree.filter((t) => t.status === 'deprecated')),
      merged: census(subtree.filter((t) => t.status === 'merged')),
    },
  };

  const subtreeDefects = subtree
    .filter((t) => flagsFor(t).length)
    .map((t) => ({
      slug: t.slug,
      name: t.name,
      status: t.status,
      description: t.description,
      description_len: descLen(t),
      usage_count: t.usage_count,
      categories: (junction.get(t.id) ?? []).map((c) => c.slug),
      flags: flagsFor(t),
    }))
    .sort((a, b) => b.usage_count - a.usage_count || a.slug.localeCompare(b.slug));

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT, `${JSON.stringify({ _summary: summary, ...buckets, subtree_defects: subtreeDefects }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nwrote ${OUT}`);
}

main().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
