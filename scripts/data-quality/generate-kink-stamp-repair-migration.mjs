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
 * Usage: node scripts/data-quality/generate-kink-stamp-repair-migration.mjs <14-digit-version>
 */
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPAIRS } from './kink-stamp-repair-definitions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const version = process.argv[2];
if (!/^\d{14}$/.test(version || '')) {
  console.error('usage: generate-kink-stamp-repair-migration.mjs <14-digit-version>');
  process.exit(2);
}

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

const values = REPAIRS.map(
  (r) =>
    `    (${q(r.slug)}, ${q(r.name ?? null)}, ${q(r.newSlug ?? null)}, ${q(r.cat)}, ${b(r.clearQid)}, ${arr(r.dropAlias)}, ${b(r.publish)},\n` +
    `     ${q(r.desc)},\n     ${q(r.long)})`,
).join(',\n');

const nClear = REPAIRS.filter((r) => r.clearQid).length;
const nKeepLong = REPAIRS.filter((r) => r.long === null).length;
const nAlias = REPAIRS.reduce((n, r) => n + (r.dropAlias?.length ?? 0), 0);
const nRename = REPAIRS.filter((r) => r.newSlug).length;

const sql = `-- Replace the 'Toys tag' / 'Philia tag' import stamps on ${REPAIRS.length} kink glossary rows
-- with hand-written definitions, re-file them into a stop that matches their
-- kind, and publish them.
--
-- GENERATED from scripts/data-quality/kink-stamp-repair-definitions.mjs by
-- scripts/data-quality/generate-kink-stamp-repair-migration.mjs. Edit the
-- definitions there and regenerate; do not hand-edit the VALUES below, or the
-- two will disagree about what was published.
--
-- WHY THE STAMP MATTERS. 41 active rows carried the literal string 'Toys tag'
-- as their description and 20 carried 'Philia tag'. Both are counted by
-- tag_hygiene_stats().placeholder_description_active (121 corpus-wide before
-- this migration, so this cohort is half of a tracked backlog). A stamp is
-- WORSE than a blank: it is non-null, so tag_has_prose() is satisfied,
-- enforce_tag_thin_page_gate does not fire, the fill sweep never selects the
-- row and indexable_without_description cannot see it. The row reads as
-- finished. Identical reasoning to the "No information available" prose nulled
-- by 20261012090000.
--
-- THE STAMP WAS NOT THE WORST PART. long_description on this cohort is
-- frequently prose about a DIFFERENT ENTITY, left by the pre-guard name-lookup
-- enrichment path that 20261008100000 repaired. That repair cleared the wrong
-- identifiers; it did not always clear what they had written, and it never
-- touched aliases. Three limbs survived, all measured on prod 2026-09-05:
--
--   1. PROSE LEFT AFTER THE QID WAS CLEARED — 2 rows. tag_wikidata_repair_audit
--      shows collar -> Q37558810 ("Collar", a family name) and humbler ->
--      Q123735487 ("Humblers", a family name), both disposition='cleared' with
--      previous_long_description NULL: the identifier was retracted and its
--      prose was not. /tags/collar opened "The term Collar can refer to a
--      family name or surname." The six rows in the same audit batch whose
--      prose WAS retracted (bat, hashira, manties, paddle, speculum,
--      st-andrews-cross) are the ones now sitting with an empty body.
--
--   2. QIDs THE REPAIR STRUCTURALLY COULD NOT CATCH — ${nClear} rows, cleared here.
--      Verified live against wbgetentities:
--        crops           Q235352     "crop"             a plant grown for profit
--        pinwheel        Q14371      "Pinwheel Galaxy"  spiral galaxy, Ursa Major
--        impact-tools    Q130321232  US patent 11247321
--        ovipositor      Q868460     insect egg-laying organ
--        inflatable-ball Q97722170   "inflatable ball", a commodity
--        xenophilia      Q144125     "free"/affinity for foreign cultures
--      None is a person, place or journal, so the class arm of the namesake
--      repair passes. This is the wrong-SENSE class that tag-wiki-guard.ts
--      added its third gate ('generic-sense') for, and only a human reading the
--      page can find it.
--
--   3. ALIASES NOBODY REVISITED — ${nAlias} deleted here. flogger carried eight naming
--      the Soviet MiG-23 fighter (NATO reporting name "Flogger"); pinwheel
--      carried "Messier 101" and "Arp 26"; ovipositor carried "Legestachel";
--      crops carried "cosecha agrícola". These were LATENT, NOT LIVE — all
--      alias_type='multilingual', display has been approved-only since
--      20261012090000, and none had a search_synonyms bridge row (measured: 0
--      of 35 across the seven affected slugs). They are removed because they
--      are wrong, not because they were leaking.
--
-- NO QID IS RE-RESOLVED. Every one above is set to NULL and left there. A
-- plausible-but-wrong identifier regenerates wrong data into tag_medical_codes,
-- broader edges and the "Elsewhere" rail every week; a null one regenerates
-- nothing. Prefer NULL to a guess — the rule 20261008100000 established.
--
-- RE-FILING IS HALF THE REPAIR. Gear held 79 tags while 36 of the 41 pieces of
-- equipment sat in Fetishes (23), Dynamics & Roles (6), Sexual Health (4),
-- Events & Parties (spreader-bar) and Slang & Language (fucking-machine) — the
-- same kind mismatch the 2026-08-29 taxonomy rebuild fixed for the rest of the
-- corpus. Category is written as category_id ONLY: the BEFORE trigger derives
-- the category text mirror and the AFTER trigger moves the junction row.
-- Writing the text, or inserting a junction row, propagates nothing.
--
-- THE RE-FILE TIGHTENS THE AGE GATE, IT DOES NOT LOOSEN IT. is_adult is derived
-- from the junction by unified_tags_recompute_is_adult() and is never written
-- by hand here. Every target stop (Gear, Fetishes, Practices & Play) is in that
-- function's adult set, and six rows that were is_adult=false because they were
-- misfiled outside Sex & Kink — ass-fetish, giantess-fetish, pregnancy-fetish,
-- uniform-fetish (Slang & Language), spreader-bar (Events & Parties),
-- fucking-machine (Slang & Language) — become adult-gated. The final assertion
-- checks that no row came out un-gated rather than assuming it.
--
-- PUBLISHING NEEDS FOUR THINGS, NOT ONE. prose present (or
-- enforce_tag_thin_page_gate stamps 'thin'), human_reviewed=true (or
-- enforce_tag_seo_sensitivity_gate forces seo_indexable false, because every
-- row here is adult), verification_status='reviewed' (or
-- unified_tags_public_gated_read hides a sensitive row from anon entirely — it
-- is verification_status, NOT seo_indexable, that shows a sensitive term to a
-- signed-out reader), and seo_indexable=true. All four are set. human_reviewed
-- is truthful: every definition was written by hand for this migration.
--
-- ${nKeepLong} rows keep their existing long_description because it is already correct
-- (nipple-clamps, strap-on, sex-swing); only their stamp is replaced.
--
-- ${nRename} row is renamed: "Crops" -> "Riding Crop", slug crops -> riding-crop. The
-- row was the agriculture article under a kink stop; the object it was always
-- meant to be is on the List of BDSM equipment. The slug write emits a redirect
-- through log_unified_tag_slug_redirect().
--
-- ONE UPDATE PER SLUG, NEVER SET-BASED. The category sync trigger pair raises
-- Postgres 27000 ("tuple to be updated was already modified") on a multi-row
-- UPDATE that touches category_id. The loop below is not a style choice.
--
-- Provenance goes to tag_sources with is_public=false, so it is available to
-- reviewers and never rendered on the page.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:kink-stamp-repair', true);

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
   where status = 'active' and description in ('Toys tag', 'Philia tag');

  create temp table _fix (
    slug text primary key, new_name text, new_slug text, cat text,
    clear_qid boolean, drop_alias text[], publish boolean,
    descr text, longd text
  ) on commit drop;

  insert into _fix (slug, new_name, new_slug, cat, clear_qid, drop_alias, publish, descr, longd) values
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
           'Definition written by hand for migration ${version} (kink stamp repair); replaced a bulk-import stamp.',
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
   where status = 'active' and description in ('Toys tag', 'Philia tag');
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
   where t.is_adult is not true;
  if v_bad <> 0 then
    raise exception 'stamp repair: % row(s) came out NOT adult-gated', v_bad;
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

const out = join(HERE, '..', '..', 'supabase', 'migrations', `${version}_kink_stamp_repair.sql`);
await writeFile(out, sql, 'utf8');
console.log(`wrote ${out}`);
console.log(
  `${REPAIRS.length} rows | ${nClear} QIDs cleared | ${nAlias} aliases dropped | ${nKeepLong} bodies kept | ${nRename} renamed`,
);
