#!/usr/bin/env node
/**
 * Match the Kinktionary vocabulary signal against unified_tags and write the
 * disposition file the revival/creation migrations are generated from.
 *
 * Reads:  scripts/data-quality/kinktionary-term-index.json   (committed signal)
 *         unified_tags + tag_aliases via PostgREST (anon)
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
 * Usage: SUPABASE_ANON_KEY=... node scripts/data-quality/match-kinktionary-to-tags.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIGNAL = join(HERE, 'kinktionary-term-index.json');
const OUT_DIR = join(HERE, 'out');
const OUT = join(OUT_DIR, 'kinktionary-disposition.json');

const URL_BASE = 'https://xqeacpakadqfxjxjcewc.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY;
if (!KEY) {
  console.error('SUPABASE_ANON_KEY not set');
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

async function pageAll(path) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1/${path}&limit=1000&offset=${offset}`, {
      headers: H,
    });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function main() {
  const signal = JSON.parse(await readFile(SIGNAL, 'utf8'));
  const tags = await pageAll(
    'unified_tags?select=id,slug,name,status,category_id,description,short_description,long_description,wikidata_id,is_sensitive,seo_indexable,image_url',
  );
  const aliases = await pageAll('tag_aliases?select=alias_name,alias_slug,canonical_tag_id,review_status');

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
