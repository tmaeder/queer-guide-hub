-- DRAFT — NOT APPLIED. Deliberately parked in docs/audits/, not supabase/migrations/,
-- because a file in the migrations directory auto-applies on merge to main via CI `db push`.
-- Move + renumber only after docs/audits/2026-09-04-tag-glossary-triage.md §7 passes.
--
-- IF YOU MOVE THIS INTO supabase/migrations/, STRIP TWO THINGS FIRST:
--   1. The `begin;` / `rollback;` wrapper. `db push` runs each file in its own transaction;
--      an explicit COMMIT breaks schema_migrations bookkeeping, and an explicit ROLLBACK
--      silently applies nothing while reporting success.
--   2. `set local statement_timeout` — a no-op under `db push`.
--
-- WHAT THIS DOES
-- Deindexes Destination tags that duplicate a live city or country page, stamping
-- seo_deindex_reason = 'place-duplicate' instead of 'thin'.
--
-- WHY THE REASON STRING IS THE POINT
-- seo_deindex_reason is default-deny: run_tag_thin_page_reindex() re-indexes a row when prose
-- arrives ONLY if it deindexed that row itself, i.e. only for reason 'thin'. Measured on prod
-- 2026-09-04: of 322 Destination tags, 98 are indexable, 224 are deindexed with reason 'thin',
-- and ZERO are held by any other reason. So the entire cohort is held out of the index solely
-- by having no description, and a description backfill over this category would re-index 224
-- pages into competition with /city/:slug and /country/:slug. Restamping the reason turns an
-- accident into a decision.
--
-- SCOPE: buckets A + B + C ONLY (136 tags). See the audit §2.2.
--   A  39  country tag -> country page                      unambiguous
--   B   1  luxembourg: country AND city, both correct        unambiguous
--   C  96  exactly one real city                             unambiguous
--   D  13  matches 2+ real cities        EXCLUDED - must be resolved by content mass first;
--          3,579 usages, includes `berlin`. A wrong call here is unrecoverable.
--   E   8  region/state, matches only a tmp- shell city      EXCLUDED - not duplicates at all;
--          california/pennsylvania/wales/queensland have no geo entity to duplicate.
--   F 165  no geo match (travel, europe, coastal, ...)       EXCLUDED - real glossary terms.
--
-- WHY THE AMBIGUITY TEST IS A PREDICATE, NOT A SLUG LIST
-- Measured: in 3 of 12 ambiguous cases the plain un-suffixed city slug belongs to the WRONG
-- city (/city/zurich is Zurich US, not Zürich CH; /city/san-jose is Costa Rica; /city/san-juan
-- is Argentina). A first pass at this audit matched tags to geo by slug and silently paired
-- /tags/zurich with the US city. Slug equality is not evidence of identity.
--
-- WHY tmp- SLUGS ARE EXCLUDED FROM THE MATCH
-- `tmp-` is the personality-birth-place shell cohort (1,832 rows, no wikidata_qid, many not
-- places at all). Counting them as real cities turns region tags into false duplicates.
--
-- WHAT IT DOES NOT DO
-- No merges. No writes to wikidata_id, description, tags[], unified_tag_assignments,
-- usage_count or status. The denormalized events.tags / venues.tags arrays are untouched, so
-- ?tags=<slug> and every browse filter keep working. Reversible (bottom of file).

begin;

set local statement_timeout = '120s';

-- Attribute the write: log_unified_tag_change() RAISEs when an undeclared `system:%` actor
-- modifies a human_reviewed row, and much of this corpus is bulk-stamped human_reviewed.
select set_config('app.actor', 'migration:tag_place_duplicate_deindex', true);

create temporary table _place_dupes on commit drop as
with d as (
  select t.id, t.slug, t.name, t.usage_count, t.seo_indexable, t.seo_deindex_reason
    from public.unified_tags t
   where t.status = 'active'
     -- filed as a place. NOTE: entity_kind and the travel-destinations junction are written by
     -- the SAME statement in 20261006140100, so they are one signal read twice, not two
     -- independent signals. They gate the obvious non-places (`male` is entity_kind='concept')
     -- but cannot catch a wrong-sense tag that was filed as a place -- see the cuauhtemoc
     -- exclusion below.
     and (t.entity_kind = 'place' or exists (
            select 1 from public.tag_category_assignments a
              join public.tag_categories c on c.id = a.category_id
             where a.tag_id = t.id and a.is_primary and c.slug = 'travel-destinations'))
),
j as (
  select d.*,
         (select count(*) from public.countries co
           where public.dedup_despace(co.name) = public.dedup_despace(d.name)) as n_country,
         (select count(*) from public.cities ci
           where ci.duplicate_of_id is null and ci.slug not like 'tmp-%'
             and public.dedup_despace(ci.name) = public.dedup_despace(d.name)) as n_city_real
    from d
)
select j.*,
       case when n_country > 0 and n_city_real = 0 then 'A'
            when n_country > 0 and n_city_real > 0 then 'B'
            when n_city_real = 1                   then 'C'
       end as bucket
  from j
 where (n_country > 0 or n_city_real = 1)   -- buckets A, B, C
   and n_city_real <= 1                     -- excludes D (2+ real cities) explicitly
   -- Wrong-sense tag that IS filed as a place and DOES match exactly one real city, so no
   -- structural predicate here can exclude it. Its prose is the Aztec ruler Cuauhtémoc, not
   -- the Mexico City borough. Deindexing it is the right outcome for the wrong reason, so it
   -- goes to the wrong-sense flow instead of being stamped 'place-duplicate' and misleading a
   -- future audit of that reason. Independent signal that would catch it: the QID's P31 class.
   and j.slug <> 'cuauhtemoc';

-- Guard 1: the bucket split must reproduce the audit exactly. If any number moved, the corpus
-- changed under the audit and the whole classification needs re-reading before this runs.
do $$
declare a int; b int; c int; n int;
begin
  select count(*) filter (where bucket='A'), count(*) filter (where bucket='B'),
         count(*) filter (where bucket='C'), count(*)
    into a, b, c, n from _place_dupes;
  raise notice 'buckets A=% B=% C=% total=%', a, b, c, n;
  if (a, b, c) is distinct from (39, 1, 95) then      -- C is 96 minus the cuauhtemoc exclusion
    raise exception 'bucket split moved: got A=% B=% C=%, audit measured A=39 B=1 C=95(+cuauhtemoc)', a, b, c;
  end if;
end $$;

-- Guard 2: no ambiguous tag may have leaked in. Independent of the predicate above -- it
-- re-derives the candidate count rather than trusting the bucket label.
do $$
declare v_bad text[];
begin
  select array_agg(p.slug) into v_bad
    from _place_dupes p
   where (select count(*) from public.cities ci
           where ci.duplicate_of_id is null and ci.slug not like 'tmp-%'
             and public.dedup_despace(ci.name) = public.dedup_despace(p.name)) > 1;
  if v_bad is not null then
    raise exception 'ambiguous same-name tags selected, must be resolved by content mass first: %', v_bad;
  end if;
end $$;

-- Guard 3: the known non-place tags must be absent.
do $$
declare v_bad text[];
begin
  select array_agg(slug) into v_bad from _place_dupes
   where slug in ('male','cuauhtemoc','california','pennsylvania','wales','queensland',
                  'manhattan','usa','rotorua','santurce','berlin','zurich','san-jose','san-juan');
  if v_bad is not null then
    raise exception 'excluded-cohort tags selected: %', v_bad;
  end if;
end $$;

-- The write. Two cohorts, one reason:
--   already indexable -> deindex now
--   deindexed 'thin'  -> restamp so a future description cannot silently re-index it
-- A row deindexed for some OTHER reason is left alone: that reason is someone else's decision
-- and default-deny already protects it. (Measured: zero such rows today.)
update public.unified_tags t
   set seo_indexable      = false,
       seo_deindex_reason = 'place-duplicate',
       updated_at         = now()
  from _place_dupes d
 where t.id = d.id
   and (t.seo_indexable is true or t.seo_deindex_reason = 'thin')
   and t.seo_deindex_reason is distinct from 'place-duplicate';

-- Guard 4: assert the postcondition as a PROPERTY, not a count.
do $$
declare v_leak int;
begin
  select count(*) into v_leak
    from public.unified_tags t join _place_dupes d on d.id = t.id
   where t.seo_indexable is true;
  if v_leak > 0 then
    raise exception 'postcondition failed: % place-duplicate tags still indexable', v_leak;
  end if;
end $$;

-- REHEARSE FIRST: run everything above, read the notices, ROLLBACK. Diff
-- public.tag_hygiene_stats() before and after inside this same transaction -- several of its
-- metrics are read from PROD on every pull_request, so a move here reds every open PR in the
-- repo, not just this one. Do not predict which ones move; measure.
rollback;
-- commit;

-- ROLLBACK OF THE APPLIED CHANGE (restores the prior, self-healing state):
--   update public.unified_tags
--      set seo_indexable = false, seo_deindex_reason = 'thin', updated_at = now()
--    where seo_deindex_reason = 'place-duplicate';
-- The rows that were indexable before this ran had a description, so the thin gate will not
-- re-deindex them; re-index explicitly with run_tag_thin_page_reindex() if that is wanted.
