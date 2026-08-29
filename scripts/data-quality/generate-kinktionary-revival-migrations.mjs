#!/usr/bin/env node
/**
 * Generate the Kinktionary revival migrations from the committed disposition
 * file. Deterministic: same disposition in, byte-identical SQL out, so the
 * migrations can be regenerated and diffed rather than hand-maintained.
 *
 * Usage: node scripts/data-quality/generate-kinktionary-revival-migrations.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DISPOSITION = join(HERE, 'out', 'kinktionary-disposition.json');
const MIGRATIONS = join(HERE, '..', '..', 'supabase', 'migrations');

/**
 * Slugs held back from the revival, with the reason. Each is a decision, not an
 * oversight — the assertions below re-check that none of them went live.
 */
const HOLD_BACK = {
  // A false match, not a Roles decision. Our `staff` row is a generic
  // "Support personnel" tag that happens to share a label with a Kinktionary
  // Roles entry. Reviving it would publish an unrelated junk page and hand the
  // nightly reconciler an ordinary English word as a tagging rule.
  staff: 'false match: generic "Support personnel", unrelated to the Kinktionary role sense',
  // Spelling variants of tags that are ALREADY ACTIVE. Reviving these creates
  // two live tags for one concept, which is a duplicate_active_name defect.
  // They belong in tag_aliases / merge_tag_concept, not here.
  genderfluid: 'duplicate spelling of the active tag gender-fluid — belongs in a merge, not a revival',
  boytoy: 'duplicate spelling of the active tag boy-toy — belongs in a merge, not a revival',
  'gun-play': 'duplicate spelling of the active tag gunplay — belongs in a merge, not a revival',
  gloryhole: 'duplicate spelling of the active tag glory-hole — belongs in a merge, not a revival',
};

/**
 * The 8 revival rows that carry no category_id. Everything else keeps the
 * category it already has: this program restores visibility, it does not
 * re-file the taxonomy. Category corrections are a separate reviewed pass.
 */
const CATEGORY_FIXES = {
  'questioning-sexuality-and-gender': 'questioning-labels',
  'bear-chaser': 'body-types-archetypes',
  'muscle-daddy': 'body-types-archetypes',
  'emotional-support': 'mental-health',
  'submissive-sub': 'bdsm-power-exchange',
  'topping-from-the-bottom': 'bdsm-power-exchange',
  butterfly: 'slang-terminology',
  chaser: 'slang-terminology',
};

/** Migration waves: which Kinktionary sections land in which file. */
const WAVES = [
  {
    n: 1,
    version: '20261004110000',
    title: 'kink activities, sexual activities, philia/fetish, toys, porn, play spaces',
    sections: [
      'kink-activities',
      'sexual-activities',
      'philia-fetish',
      'toys-equipment',
      'pornography',
      'play-spaces',
      'pop-culture',
    ],
  },
  {
    n: 2,
    version: '20261004110100',
    title: 'roles (A–L)',
    sections: ['roles'],
    filter: (r) => r.slug < 'm',
  },
  {
    n: 3,
    version: '20261004110200',
    title: 'roles (M–Z)',
    sections: ['roles'],
    filter: (r) => r.slug >= 'm',
  },
  {
    n: 4,
    version: '20261004110300',
    title: 'identity, relationships, slang, health, safety, events',
    sections: [
      'genders',
      'sexual-orientations',
      'romantic-orientations',
      'relationships',
      'gay-culture',
      'sex-slang',
      'glossary',
      'events',
      'holidays',
      'sexual-health',
      'mental-health',
      'scene-safety',
      'safety-resources',
      'consent',
    ],
  },
];

const q = (s) => `'${s.replace(/'/g, "''")}'`;

const header = (w, rows, fixes) => `-- Kinktionary-corroborated revival, wave ${w.n} of ${WAVES.length} — ${w.title}.
--
-- WHAT THIS FIXES
--
-- A one-off data-quality audit on 2026-06-05 set status='deprecated' on 4,355
-- tags whose only fault was being "orphan (no entity assignments, relations,
-- synonyms, or aliases)", and a separate "auto: zero usage" pass took 717 more.
-- That is a USAGE test applied to a GLOSSARY. A glossary term's worth does not
-- depend on whether a venue happens to be tagged with it.
--
-- Measured on prod before this migration: 4,130 of the orphan-deprecated rows
-- still carry >200 characters of finished prose and 1,150 carry a wikidata_id.
-- fetchTagWithCategories (src/hooks/usePageFetchers.ts) filters
-- .eq('status','active'), so every one of them answers "No such term" today.
-- /tags/felching, /tags/figging, /tags/bastinado and /tags/omorashi are each a
-- finished page with 300-550 characters of prose and a Wikidata ID, serving a
-- 404. Same shape as 20261002100200: the corrected pages do not exist.
--
-- WHY THE KINKTIONARY, AND WHAT IS AND IS NOT TAKEN FROM IT
--
-- FetLife's Kinktionary (https://fetlife.com/kinktionary) is a public,
-- community-curated glossary of 1,892 terms. It is used here as INDEPENDENT
-- CORROBORATION that a term is live kink vocabulary — that is what makes
-- reviving these rows a measured decision rather than an arbitrary one.
--
-- NOT ONE WORD OF THEIR PROSE IS COPIED OR ADAPTED. Their licence
-- (https://fetlife.com/kinktionary/license-zcfzz) is non-commercial only —
-- "You may not use any material from the Kinktionary for commercial purposes
-- without the express written consent of FetLife" — and queer.guide is
-- commercial (marketplace, affiliate_partners, Stripe). The NC term binds
-- adaptations too, so paraphrase is equally out. What is used is the term list
-- and the section a term sits in: facts and short phrases, used only to decide
-- WHICH of our own already-written rows deserve to be live. Every sentence on
-- these pages is prose this project wrote. Same posture, and the same reason, as
-- the "THE PROSE IS OURS" section of 20260907100000.
--
-- STATUS ONLY. CATEGORY IS DELIBERATELY NOT REWRITTEN.
--
-- 952 of the 961 corroborated rows already carry a category_id, and a
-- section-by-category cross-tab showed them broadly consistent with the
-- Kinktionary's own sectioning. Re-filing 961 rows on the strength of a foreign
-- taxonomy would be a second, unreviewed change riding along with this one.
-- Only the ${fixes} row(s) in this wave that carry NO category at all are
-- assigned, by hand, below. Genuine disagreements (26 gender terms filed under
-- Sexual Orientation) are recorded for the separate correction pass.
--
-- category_id IS WRITTEN ON unified_tags, NOT INTO tag_category_assignments.
-- tag_hygiene_stats().uncategorized_active counts unified_tags.category_id;
-- 20260907100000 and 20260910171943 wrote only the junction, and their tags
-- still read as uncategorized on prod today (444 such rows measured).
-- trg_sync_tag_category_after owns the junction and fires on category_id.
--
-- NAME IS NEVER WRITTEN. normalize_tag_input() re-derives the slug from name on
-- any UPDATE that changes it — 20260910171943 records 'Pride Flag' ->
-- 'Rainbow Pride Flag' silently MOVING the row to a new slug. Across 961 rows
-- that would be unrecoverable, so name does not appear in the UPDATE at all.
--
-- seo_indexable IS COMPUTED FROM THE PROSE, NOT SET BLIND.
-- indexable_without_description is a zero-invariant in check-tag-hygiene.mjs,
-- which measures PROD — a blanket true would red every open PR in the repo
-- until run_tag_thin_page_reindex drained it at 400 rows/night. All rows in
-- this wave were measured to have description or short_description, so the
-- expression below evaluates true for all of them; it is written as an
-- expression anyway so a drifted row degrades to deindexed instead of to red CI.
--
-- human_reviewed = true IS LOAD-BEARING TWICE: deprecate_unused_tags() skips
-- human-reviewed rows (it is currently scheduled in no cron and no
-- admin_automations row, but that is a fact about today, not a guarantee), and
-- enforce_tag_seo_sensitivity_gate() forces seo_indexable := false on a
-- sensitive or adult row that is not human-reviewed. 575 of these rows are
-- is_adult, so without the flag most of this wave would revive deindexed.
--
-- KNOWN AND ACCEPTED CONSEQUENCE. run_tag_assignment_reconcile (nightly) builds
-- its auto-tagging map from lower(name)/lower(slug) of every ACTIVE tag. 51 of
-- the revived slugs match free-text tags on existing content and will attach to
-- 503 rows on the next run. Most are correct (asexual, femme, chosen-family,
-- abroromantic). ~15 are ordinary English words whose kink sense differs from
-- the content's (teacher, queen, priest, lion, camp) and are recorded in
-- docs/audits/ for the correction pass. This is a restoration of the state that
-- held before 2026-06-05, not a new hazard, which is why it is accepted here
-- rather than blocked — but it is named, because the same function's own
-- comment records tagging 2,609 'culture' articles as Crops.

set local statement_timeout = '600s';

-- log_unified_tag_change() raises on any change to a human_reviewed row when
-- app.actor is unset (it defaults to 'system:trigger'). Top level, not inside
-- the DO block.
select set_config('app.actor', 'migration:kinktionary-revival-w${w.n}', true);
`;

async function main() {
  const d = JSON.parse(await readFile(DISPOSITION, 'utf8'));
  const all = d.deprecated.filter((r) => !(r.slug in HOLD_BACK));
  const assigned = new Set();
  let written = 0;

  for (const w of WAVES) {
    let rows = all.filter((r) => w.sections.includes(r.section));
    if (w.filter) rows = rows.filter(w.filter);
    rows = rows.filter((r) => !assigned.has(r.slug));
    rows.forEach((r) => assigned.add(r.slug));
    rows.sort((a, b) => a.slug.localeCompare(b.slug));

    const fixes = rows.filter((r) => CATEGORY_FIXES[r.slug]);
    const sql = [];
    sql.push(header(w, rows, fixes.length));
    sql.push(`
do $mig$
declare
  r      record;
  v_bad  int;
  v_live int;
begin
  create temp table _rev (slug text primary key) on commit drop;
  insert into _rev (slug) values
${rows.map((r) => `    (${q(r.slug)})`).join(',\n')};

  -- Every slug must already exist as a non-active row. A miss means the
  -- committed disposition file has drifted from prod; report it rather than
  -- inserting a fresh empty tag under that slug.
  select count(*) into v_bad
    from _rev k left join public.unified_tags t on t.slug = k.slug
   where t.id is null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w${w.n}: % slug(s) absent from unified_tags — disposition file is stale', v_bad;
  end if;

  -- One statement per slug. Cheap at this size and the reviewed convention.
  for r in select slug from _rev order by slug loop
    update public.unified_tags set
      status              = 'active',
      deprecated_at       = null,
      deprecation_reason  = null,
      merged_into_id      = null,
      verification_status = 'reviewed',
      human_reviewed      = true,
      seo_indexable       = (coalesce(nullif(btrim(description), ''), short_description) is not null),
      last_verified_at    = now(),
      updated_at          = now()
    where slug = r.slug
      and status <> 'active';
  end loop;
${
  fixes.length
    ? `
  -- The rows in this wave that carried no category at all. Assigned by hand;
  -- every other row keeps the category it already had.
  for r in select * from (values
${fixes.map((f) => `      (${q(f.slug)}, ${q(CATEGORY_FIXES[f.slug])})`).join(',\n')}
  ) as v(slug, cat) loop
    update public.unified_tags u set category_id = c.id
      from public.tag_categories c
     where u.slug = r.slug and c.slug = r.cat
       and u.category_id is distinct from c.id;
  end loop;
`
    : ''
}
  -- Repair category_id <-> junction drift on the rows this wave revives.
  --
  -- trg_sync_tag_category_after fires only when category_id CHANGES, so a row
  -- whose junction already disagreed with its category_id is never corrected by
  -- flipping status alone. Measured on prod: rows exist with category_id = X and
  -- exactly one is_primary junction row pointing at Y. The first deploy of this
  -- wave failed on precisely that ("3 row(s) have no primary junction row"),
  -- which is the assertion doing its job — a half-written taxonomy is what it
  -- exists to refuse.
  --
  -- unified_tags.category_id is the canonical side (it is what
  -- tag_hygiene_stats().uncategorized_active reads and what has an FK), so the
  -- junction is moved to agree with it, not the other way round. This does
  -- exactly what the AFTER trigger would have done, and is idempotent.
  for r in select t.id, t.category_id from _rev k
             join public.unified_tags t on t.slug = k.slug
            where t.category_id is not null
              and not exists (
                select 1 from public.tag_category_assignments a
                 where a.tag_id = t.id and a.category_id = t.category_id and a.is_primary)
  loop
    update public.tag_category_assignments
       set is_primary = false
     where tag_id = r.id and is_primary and category_id <> r.category_id;

    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (r.id, r.category_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
  end loop;

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where t.status <> 'active' or t.human_reviewed is not true
      or t.verification_status <> 'reviewed'
      or t.deprecated_at is not null or t.deprecation_reason is not null
      or t.merged_into_id is not null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w${w.n}: % row(s) did not reach the live state', v_bad;
  end if;

  -- The CI zero-invariant, asserted where it is caused rather than discovered
  -- on an unrelated PR two hours later.
  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where t.seo_indexable
     and coalesce(nullif(btrim(t.description), ''), t.short_description) is null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w${w.n}: % indexable row(s) carry no description', v_bad;
  end if;

  -- Zero-invariant since the 2026-08-28 photo retirement.
  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where t.image_url is not null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w${w.n}: % row(s) carry a retired image_url', v_bad;
  end if;

  -- Nothing in this wave may be left uncategorized: it would land straight in
  -- tag_hygiene_stats().uncategorized_active.
  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where t.category_id is null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w${w.n}: % revived row(s) have no category_id', v_bad;
  end if;

  -- Both sides of the category write. Asserting only category_id is how the
  -- junction silently stayed empty in the migrations named in the header.
  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where not exists (
     select 1 from public.tag_category_assignments a
      where a.tag_id = t.id and a.category_id = t.category_id and a.is_primary);
  if v_bad > 0 then
    raise exception 'kinktionary revive w${w.n}: % row(s) have no primary junction row', v_bad;
  end if;

  -- Held back on purpose; see HOLD_BACK in the generator. If one of these is
  -- live, something outside this migration revived it and the reason it was
  -- held back needs re-reading.
  select count(*) into v_bad from public.unified_tags
   where slug in (${Object.keys(HOLD_BACK).map(q).join(', ')}) and status = 'active';
  if v_bad > 0 then
    raise exception 'kinktionary revive w${w.n}: % held-back slug(s) are active', v_bad;
  end if;

  select count(*) into v_live from _rev k
    join public.unified_tags t on t.slug = k.slug where t.status = 'active';
  raise notice 'kinktionary revive w${w.n}: % of % now active', v_live, (select count(*) from _rev);
end
$mig$;
`);

    const file = join(MIGRATIONS, `${w.version}_kinktionary_revival_w${w.n}.sql`);
    await writeFile(file, sql.join(''));
    written += rows.length;
    console.log(`w${w.n} ${w.version}: ${rows.length} slugs (${fixes.length} category fixes) -> ${file.split('/').pop()}`);
  }

  const missed = all.filter((r) => !assigned.has(r.slug));
  console.log(`\ntotal revived: ${written} of ${d.deprecated.length} corroborated`);
  console.log(`held back: ${Object.keys(HOLD_BACK).length}`);
  if (missed.length) {
    console.log(`!! ${missed.length} slug(s) in no wave: ${missed.map((r) => `${r.slug}[${r.section}]`).join(', ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
