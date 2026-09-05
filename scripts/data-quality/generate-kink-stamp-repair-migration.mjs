#!/usr/bin/env node
/**
 * Generate the migration that replaces the 'Toys tag' / 'Philia tag' stamps with
 * the hand-written definitions in `kink-stamp-repair-definitions.mjs`.
 *
 * The definitions live in a reviewable JS file, not inline in SQL, so an editor
 * can read and correct 61 definitions without reading a migration. This script
 * is the only thing that turns them into SQL, so the two cannot drift.
 *
 * Sibling of generate-new-term-migration.mjs, which CREATES rows. This one only
 * ever UPDATEs: every slug below already exists and is active, and creating a
 * second row for any of these concepts is the failure mode both scripts guard
 * against.
 *
 * Usage:
 *   node scripts/data-quality/generate-kink-stamp-repair-migration.mjs <version>
 *   node scripts/data-quality/generate-kink-stamp-repair-migration.mjs <version> \
 *     --defs kink-stamp-repair-2-definitions.mjs \
 *     --stamps "Sexual activity tag,Scene safety tag" --name kink_stamp_repair_2
 *
 * Parameterised rather than copied for the second cohort: the guards, the
 * loop and the assertions are the part that took a dry run against prod to get
 * right, and two files would drift.
 */
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const version = process.argv[2];
if (!/^\d{14}$/.test(version || '')) {
  console.error('usage: generate-kink-stamp-repair-migration.mjs <14-digit-version> [--defs f] [--stamps "A,B"] [--name n]');
  process.exit(2);
}
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const defsFile = argOf('--defs', 'kink-stamp-repair-definitions.mjs');
const STAMPS = argOf('--stamps', 'Toys tag,Philia tag').split(',').map((s) => s.trim());
const migName = argOf('--name', 'kink_stamp_repair');
const actor = `migration:${migName.replace(/_/g, '-')}`;
const mod = await import(`./${defsFile}`);
const { REPAIRS } = mod;
// The cohort narrative lives WITH its data, not in this generator: each
// definitions file knows why its own rows were wrong, and a shared generator
// that hardcoded one cohort's story would put cohort 1's findings on top of
// cohort 2's migration.
let HEADER = mod.MIGRATION_HEADER ?? '-- (no cohort narrative supplied)\n';
const stampList = STAMPS.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const b = (v) => (v ? 'true' : 'false');
const arr = (a) =>
  !a || a.length === 0
    ? 'null'
    : `array[${a.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(', ')}]::text[]`;

// A stamp is only replaced by a definition that is actually different from every
// other one. Two rows sharing a description would recreate the defect at a
// smaller scale, and `placeholder_description_active` counts any short string
// shared by more than five rows.
const seen = new Map();
for (const r of REPAIRS) {
  const key = r.desc.trim().toLowerCase();
  if (seen.has(key)) {
    console.error(`duplicate description: ${r.slug} and ${seen.get(key)}`);
    process.exit(2);
  }
  seen.set(key, r.slug);
  if (!r.desc || r.desc.length < 30) {
    console.error(`${r.slug}: description too short to be a definition`);
    process.exit(2);
  }
  if (r.long !== null && (!r.long || r.long.length < 120)) {
    console.error(`${r.slug}: long_description too short`);
    process.exit(2);
  }
}

// Which rows are EXPECTED to end up 18+. Derived from the module's declared
// DELIBERATELY_UNGATED list rather than assumed, because this repair moves rows
// in BOTH directions: filing a safety term under Consent & Negotiation un-gates
// it on purpose, while a kink state stays gated. An assertion that demanded one
// answer for every row would have to be weakened to nothing to pass.
const ungated = new Set(mod.DELIBERATELY_UNGATED ?? []);
const values = REPAIRS.map(
  (r) =>
    `    (${q(r.slug)}, ${q(r.name ?? null)}, ${q(r.newSlug ?? null)}, ${q(r.cat)}, ${b(r.clearQid)}, ${arr(r.dropAlias)}, ${b(r.publish)}, ${b(!ungated.has(r.slug))},\n` +
    `     ${q(r.desc)},\n     ${q(r.long)})`,
).join(',\n');

const nClear = REPAIRS.filter((r) => r.clearQid).length;
const nKeepLong = REPAIRS.filter((r) => r.long === null).length;
const nAlias = REPAIRS.reduce((n, r) => n + (r.dropAlias?.length ?? 0), 0);
const nRename = REPAIRS.filter((r) => r.newSlug).length;

// The narrative states counts in prose. Substituting them here rather than
// letting the module hardcode numbers means a definitions edit cannot leave the
// header claiming a figure the VALUES no longer support.
for (const [token, value] of [
  ['nClear', nClear], ['nAlias', nAlias], ['nKeepLong', nKeepLong], ['nRename', nRename],
]) HEADER = HEADER.split(`{{${token}}}`).join(String(value));
if (/\{\{\w+\}\}/.test(HEADER)) {
  console.error('unsubstituted token in MIGRATION_HEADER:', HEADER.match(/\{\{\w+\}\}/)[0]);
  process.exit(2);
}

const sql = `-- Replace the ${STAMPS.map((x) => `'${x}'`).join(' / ')} import stamps on ${REPAIRS.length} kink glossary rows
-- with hand-written definitions, re-file them into a stop that matches their
-- kind, and publish them.
--
-- GENERATED from scripts/data-quality/${defsFile} by
-- scripts/data-quality/generate-kink-stamp-repair-migration.mjs. Edit the
-- definitions there and regenerate; do not hand-edit the VALUES below, or the
-- two will disagree about what was published.
--
${HEADER}-- ONE UPDATE PER SLUG, NEVER SET-BASED. The category sync trigger pair raises
-- Postgres 27000 ("tuple to be updated was already modified") on a multi-row
-- UPDATE that touches category_id. The loop below is not a style choice.
--
-- Provenance goes to tag_sources with is_public=false, so it is available to
-- reviewers and never rendered on the page.

set local statement_timeout = '600s';

select set_config('app.actor', '${actor}', true);

do $mig$
declare
  r          record;
  v_bad      int;
  v_cat      uuid;
  v_updated  int := 0;
  v_alias    int := 0;
  v_src      int := 0;
  v_before   int;
  v_after    int;
begin
  select count(*) into v_before from public.unified_tags
   where status = 'active' and description in (${stampList});

  create temp table _fix (
    slug text primary key, new_name text, new_slug text, cat text,
    clear_qid boolean, drop_alias text[], publish boolean, expect_adult boolean,
    descr text, longd text
  ) on commit drop;

  insert into _fix (slug, new_name, new_slug, cat, clear_qid, drop_alias, publish, expect_adult, descr, longd) values
${values};

  -- Every category must resolve, or the row lands uncategorized and
  -- tag_hygiene_stats counts it with nothing to explain why.
  select count(*) into v_bad from _fix f
   where not exists (select 1 from public.tag_categories c where c.slug = f.cat);
  if v_bad > 0 then
    raise exception 'stamp repair: % row(s) name a category that does not exist', v_bad;
  end if;

  -- This migration only ever UPDATEs. A slug that is missing or not active
  -- means the committed definitions have drifted from prod, which is a fact to
  -- report rather than paper over by inserting a fresh row under that slug.
  select count(*) into v_bad from _fix f
   where not exists (select 1 from public.unified_tags t where t.slug = f.slug and t.status = 'active');
  if v_bad > 0 then
    raise exception 'stamp repair: % slug(s) are missing or not active — definitions have drifted from prod', v_bad;
  end if;

  -- A rename must not land on an occupied slug, and must not land on a slug
  -- held as an alias of some other tag: trg_tag_reject_alias_shadow raises on
  -- the second case, and it is better to say so here than to fail mid-loop.
  select count(*) into v_bad from _fix f
   where f.new_slug is not null
     and (exists (select 1 from public.unified_tags t where t.slug = f.new_slug)
       or exists (select 1 from public.tag_aliases a where a.alias_slug = f.new_slug));
  if v_bad > 0 then
    raise exception 'stamp repair: % rename target(s) collide with an existing tag or alias', v_bad;
  end if;

  for r in select * from _fix order by slug loop
    select c.id into v_cat from public.tag_categories c where c.slug = r.cat;

    update public.unified_tags t set
      name                = coalesce(r.new_name, t.name),
      slug                = coalesce(r.new_slug, t.slug),
      description         = r.descr,
      long_description    = coalesce(r.longd, t.long_description),
      category_id         = v_cat,
      wikidata_id         = case when r.clear_qid then null else t.wikidata_id end,
      wikipedia_url       = case when r.clear_qid then null else t.wikipedia_url end,
      human_reviewed      = case when r.publish then true else t.human_reviewed end,
      verification_status = case when r.publish then 'reviewed' else t.verification_status end,
      seo_indexable       = case when r.publish then true else t.seo_indexable end,
      seo_deindex_reason  = case when r.publish then null else t.seo_deindex_reason end,
      last_verified_at    = now(),
      prose_reviewed_at   = now()
    where t.slug = r.slug;
    v_updated := v_updated + 1;

    -- Delete junction rows for any OTHER category. The AFTER trigger demotes the
    -- old primary but does not remove it, and unified_tags_recompute_is_adult()
    -- matches ANY assignment, not the primary one — so a row moved OUT of a kink
    -- stop keeps its 18+ flag from the junction it left behind.
    --
    -- This is not hypothetical: it aborted this migration's first apply on
    -- "rope-compatibility-checks", the only one of the eight deliberately
    -- un-gated safety terms that was moving out of an ADULT stop (Practices &
    -- Play). The prod dry run had probed "after-scene-drop", which came from
    -- Slang & Language and is not adult, so the case went untested. Same trap as
    -- 20261230113700 and the six venue descriptors that stayed 18+ after being
    -- "moved" in the taxonomy v3 cutover.
    delete from public.tag_category_assignments a
     using public.unified_tags t
     where t.slug = coalesce(r.new_slug, r.slug)
       and a.tag_id = t.id
       and a.category_id <> v_cat;

    if r.drop_alias is not null then
      delete from public.tag_aliases a
       using public.unified_tags t
       where t.slug = coalesce(r.new_slug, r.slug)
         and a.canonical_tag_id = t.id
         and a.alias_name = any(r.drop_alias);
      get diagnostics v_bad = row_count;
      v_alias := v_alias + v_bad;
    end if;

    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    select t.id, 'editorial:general-knowledge',
           'Definition written by hand for migration ${version} (${migName.replace(/_/g, ' ')}); replaced a bulk-import stamp.',
           false
      from public.unified_tags t
     where t.slug = coalesce(r.new_slug, r.slug)
       and not exists (
         select 1 from public.tag_sources s
          where s.tag_id = t.id and s.source_type = 'editorial:general-knowledge'
            and s.claim_summary like '%kink stamp repair%');
    get diagnostics v_bad = row_count;
    v_src := v_src + v_bad;
  end loop;

  -- ── Assertions ───────────────────────────────────────────────────────────
  -- Not "zero stamps remain": that also passes if the rows were deleted. Assert
  -- the rows are still here, carry real prose, and that no two of them share a
  -- description — a shared short string is what the metric counts in the first
  -- place.
  select count(*) into v_after from public.unified_tags
   where status = 'active' and description in (${stampList});
  if v_after <> 0 then
    raise exception 'stamp repair: % stamped row(s) remain', v_after;
  end if;

  select count(*) into v_bad from _fix f
    join public.unified_tags t on t.slug = coalesce(f.new_slug, f.slug)
   where t.status <> 'active'
      or coalesce(length(btrim(t.description)), 0) < 30
      or coalesce(length(btrim(t.long_description)), 0) < 120;
  if v_bad <> 0 then
    raise exception 'stamp repair: % row(s) are missing, inactive or thin after the repair', v_bad;
  end if;

  select count(*) into v_bad from (
    select 1 from _fix f
      join public.unified_tags t on t.slug = coalesce(f.new_slug, f.slug)
     group by lower(btrim(t.description)) having count(*) > 1) d;
  if v_bad <> 0 then
    raise exception 'stamp repair: % description(s) are shared by more than one row', v_bad;
  end if;

  if v_updated <> ${REPAIRS.length} then
    raise exception 'stamp repair: updated % rows, expected ${REPAIRS.length}', v_updated;
  end if;

  -- Every repaired row must be adult-gated. The re-file is supposed to TIGHTEN
  -- this (six rows were is_adult=false only because they were misfiled outside
  -- Sex & Kink); asserting it is what makes that a fact rather than an
  -- expectation, and catches a target stop being dropped from
  -- unified_tags_recompute_is_adult()'s name list.
  select count(*) into v_bad from _fix f
    join public.unified_tags t on t.slug = coalesce(f.new_slug, f.slug)
   where coalesce(t.is_adult, false) is distinct from f.expect_adult;
  if v_bad <> 0 then
    raise exception 'stamp repair: % row(s) came out with the WRONG age gate (expected per the definitions file)', v_bad;
  end if;

  -- Publishing must have actually taken. seo_indexable is forced false by three
  -- separate BEFORE gates, so setting it is not the same as achieving it.
  select count(*) into v_bad from _fix f
    join public.unified_tags t on t.slug = coalesce(f.new_slug, f.slug)
   where f.publish and (t.seo_indexable is not true
      or t.human_reviewed is not true
      or t.verification_status <> 'reviewed');
  if v_bad <> 0 then
    raise exception 'stamp repair: % row(s) did not publish', v_bad;
  end if;

  -- No cleared identifier may have been re-adopted within this transaction.
  select count(*) into v_bad from _fix f
    join public.unified_tags t on t.slug = coalesce(f.new_slug, f.slug)
   where f.clear_qid and t.wikidata_id is not null;
  if v_bad <> 0 then
    raise exception 'stamp repair: % cleared QID(s) are not null', v_bad;
  end if;

  raise notice 'kink stamp repair: % stamps before, % after; % rows updated, % aliases deleted, % provenance rows',
    v_before, v_after, v_updated, v_alias, v_src;
end
$mig$;
`;

const out = join(HERE, '..', '..', 'supabase', 'migrations', `${version}_${migName}.sql`);
await writeFile(out, sql, 'utf8');
console.log(`wrote ${out}`);
console.log(
  `${REPAIRS.length} rows | ${nClear} QIDs cleared | ${nAlias} aliases dropped | ${nKeepLong} bodies kept | ${nRename} renamed`,
);
