#!/usr/bin/env node
/**
 * Generate the migration that creates missing glossary terms from
 * `kinktionary-new-term-definitions.mjs`.
 *
 * The definitions live in a reviewable JS file, not inline in SQL, so an editor
 * can read and correct them without touching a migration. This script is the
 * only thing that turns them into SQL, which means the file and the migration
 * cannot drift into disagreeing.
 *
 * Everything is created UNPUBLISHED:
 *   seo_indexable       = false   -> no crawler sees it
 *   human_reviewed      = false   -> truthful; no human has read this prose
 *   verification_status = 'unverified'
 *
 * The rows are usable for tagging, browsing and site search immediately, and
 * become publishable by an editor flipping seo_indexable + human_reviewed.
 * `deprecate_unused_tags` skips human_reviewed rows only, so an unreviewed term
 * that never gets used will eventually be swept — which is the correct outcome
 * for a draft nobody adopted.
 *
 * Provenance goes in `tag_sources` (is_public=false, so it never renders):
 *   editorial:general-knowledge   written from documented, independently
 *                                 attested meaning
 *   editorial:inferred-from-name  a reasoned guess from the term's name and
 *                                 section, because the only other source is the
 *                                 non-commercially-licensed Kinktionary
 *
 * Usage: node scripts/data-quality/generate-new-term-migration.mjs <version> [--only sourced|inferred]
 */
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TERMS } from './kinktionary-new-term-definitions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const version = process.argv[2];
if (!/^\d{14}$/.test(version || '')) {
  console.error('usage: generate-new-term-migration.mjs <14-digit-version> [--only sourced|inferred]');
  process.exit(2);
}
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;
const rows = only
  ? TERMS.filter((t) => (only === 'sourced' ? t.sourced : !t.sourced))
  : TERMS;

if (rows.length === 0) {
  console.error(`no terms matched --only ${only}`);
  process.exit(2);
}

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const b = (v) => (v ? 'true' : 'false');

const values = rows
  .map(
    (t) =>
      `    (${q(t.slug)}, ${q(t.name)}, ${q(t.cat)}, ${q(t.kind || 'concept')}, ${b(t.adult)}, ${b(t.sensitive)}, ${b(t.sourced)},\n` +
      `     ${q(t.desc)},\n     ${q(t.long)})`,
  )
  .join(',\n');

const nSourced = rows.filter((t) => t.sourced).length;
const nInferred = rows.length - nSourced;

const sql = `-- Create ${rows.length} glossary terms that exist in the Kinktionary index and in no
-- row of \`unified_tags\` under any status.
--
-- GENERATED from scripts/data-quality/kinktionary-new-term-definitions.mjs by
-- scripts/data-quality/generate-new-term-migration.mjs. Edit the definitions
-- there and regenerate; do not hand-edit the VALUES below, or the two will
-- disagree about what was published.
--
-- ${nSourced} written from independently documented meaning, ${nInferred} inferred from the term's name.
--
-- NOTHING HERE IS PUBLISHED. Every row is created with seo_indexable=false,
-- human_reviewed=false and verification_status='unverified': usable for
-- tagging, browsing and site search, invisible to crawlers until a human
-- approves it. A machine-written definition of an identity or role term is a
-- draft, and this program spent its life retracting prose that reached
-- production as though it were not — 44 chimera pages, then five wrong-sense
-- revivals created while cleaning them up.
--
-- LICENCE. The Kinktionary is licensed NON-COMMERCIAL and queer.guide is
-- commercial, so NOT ONE WORD OF THEIR PROSE IS COPIED OR ADAPTED. Only their
-- TERM LIST was used, as a signal for which entries are absent. Every
-- definition below is original text. For the terms marked
-- \`editorial:inferred-from-name\`, the Kinktionary is the only place the term is
-- attested at all — so rather than reproduce their definition, the row records
-- that its meaning is a reasoned guess and waits for a human who knows the
-- vocabulary.
--
-- Provenance is written to \`tag_sources\` with is_public=false, so it is
-- available to reviewers and never rendered on the page.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:kinktionary-new-terms', true);

do $mig$
declare
  r        record;
  v_bad    int;
  v_made   int := 0;
  v_src    int := 0;
begin
  create temp table _new (
    slug text primary key, name text, cat text, kind text,
    adult boolean, sensitive boolean, sourced boolean,
    descr text, longd text
  ) on commit drop;

  insert into _new (slug, name, cat, kind, adult, sensitive, sourced, descr, longd) values
${values};

  -- Every category must resolve. A typo would otherwise create an uncategorized
  -- row, which tag_hygiene_stats counts and nothing else would explain.
  select count(*) into v_bad from _new n
   where not exists (select 1 from public.tag_categories c where c.slug = n.cat);
  if v_bad > 0 then
    raise exception 'new terms: % row(s) name a category that does not exist', v_bad;
  end if;

  -- An ACTIVE or MERGED slug aborts: a live tag must never be silently
  -- overwritten by a bulk import, and a merged one is a redirect whose target
  -- this migration knows nothing about.
  --
  -- A DEPRECATED slug is revived instead. The original guard here refused every
  -- existing slug under any status while telling the reader to "revive them
  -- instead of creating duplicates" — advice it gave no way to follow — so it
  -- aborted \`db push\` on main and stranded seven later migrations behind it.
  -- db push applies in version order and stops at the first failure.
  --
  -- The colliding rows are the same concepts this migration authors: femdom,
  -- voyeur and pretzel were deprecated by the orphan sweep for having "no
  -- entity assignments, relations, synonyms, or aliases", with merged_into_id
  -- NULL. A glossary term has no entity assignments by nature, so that sweep
  -- culled vocabulary rather than junk.
  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug
   where t.status <> 'deprecated';
  if v_bad > 0 then
    raise exception 'new terms: % slug(s) already exist and are not deprecated — resolve by hand', v_bad;
  end if;

  for r in select * from _new order by slug loop
    insert into public.unified_tags (
      name, slug, description, long_description,
      category_id, category, entity_kind,
      is_adult, is_sensitive,
      status, seo_indexable, human_reviewed, verification_status
    )
    select r.name, r.slug, r.descr, r.longd,
           c.id, c.name, r.kind::tag_entity_kind,
           r.adult, r.sensitive,
           'active', false, false, 'unverified'
      from public.tag_categories c where c.slug = r.cat
    -- status, deprecated_at and deprecation_reason are cleared TOGETHER, which
    -- is the whole difference between a revive and a resurrection. An upsert
    -- that wrote status='active' and left deprecated_at set is what stranded
    -- 297 tags in a state where the page rendered but search refused to index
    -- them (lgbtiq, sauna, kink unreachable for three months). Since
    -- 20261007100000 that state is unrepresentable, so getting this wrong now
    -- fails loudly here rather than silently in production.
    on conflict (slug) do update set
      name                = excluded.name,
      description         = excluded.description,
      long_description    = excluded.long_description,
      category_id         = excluded.category_id,
      category            = excluded.category,
      entity_kind         = excluded.entity_kind,
      is_adult            = excluded.is_adult,
      is_sensitive        = excluded.is_sensitive,
      status              = 'active',
      deprecated_at       = null,
      deprecation_reason  = null,
      seo_indexable       = false,
      human_reviewed      = false,
      verification_status = 'unverified';
    v_made := v_made + 1;

    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    select t.id,
           case when r.sourced then 'editorial:general-knowledge'
                else 'editorial:inferred-from-name' end,
           case when r.sourced
                then 'Definition written from independently documented meaning. Not derived from the Kinktionary, whose licence is non-commercial.'
                else 'Term is attested only in the FetLife Kinktionary. This definition is INFERRED from the term name and its section, and is a reasoned guess pending review by someone who knows the vocabulary.'
           end,
           false
      from public.unified_tags t where t.slug = r.slug;
    v_src := v_src + 1;
  end loop;

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _new n
   where not exists (select 1 from public.unified_tags t where t.slug = n.slug);
  if v_bad > 0 then
    raise exception 'new terms: % row(s) were not created', v_bad;
  end if;

  -- Not one of them may be publishable. This is the whole safety property.
  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug
   where t.seo_indexable or coalesce(t.human_reviewed, false) or t.verification_status <> 'unverified';
  if v_bad > 0 then
    raise exception 'new terms: % row(s) are publishable — they must be created unreviewed and unindexed', v_bad;
  end if;

  -- Every row carries a provenance record saying where its prose came from.
  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug
   where not exists (select 1 from public.tag_sources s
                      where s.tag_id = t.id and s.source_type like 'editorial:%');
  if v_bad > 0 then
    raise exception 'new terms: % row(s) have no provenance record', v_bad;
  end if;

  -- The CI zero-invariant, corpus-wide.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and seo_indexable
     and coalesce(nullif(btrim(description), ''), short_description) is null;
  if v_bad > 0 then
    raise exception 'new terms: % indexable row(s) corpus-wide have no description', v_bad;
  end if;

  raise notice 'new terms: % created, % provenance row(s)', v_made, v_src;
end
$mig$;
`;

const out = join(HERE, '..', '..', 'supabase', 'migrations', `${version}_kinktionary_new_terms${only ? `_${only}` : ''}.sql`);
await writeFile(out, sql);
console.log(`wrote ${out}`);
console.log(`  ${rows.length} terms (${nSourced} sourced, ${nInferred} inferred)`);
