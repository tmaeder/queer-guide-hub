-- Destination tags that duplicate a live city or country page: deindex with a stamped reason.
--
-- WHY THE REASON STRING IS THE WHOLE POINT
-- `unified_tags.seo_deindex_reason` is default-deny: `run_tag_thin_page_reindex()` re-indexes a
-- row when prose arrives ONLY if it deindexed that row itself, i.e. only for reason 'thin'.
-- Measured on prod 2026-09-04: of 322 Destination tags, 98 are indexable, 224 are deindexed
-- with reason 'thin', and ZERO are held by any other reason. So the entire cohort is held out
-- of the index solely by having no description — and `tag-enrichment-sweep` runs nightly
-- selecting exactly `description is null`. The first time it reaches these rows it writes
-- Wikipedia geography onto them and `run_tag_thin_page_reindex()` puts all 224 back into the
-- index, competing with /city/:slug and /country/:slug. Restamping the reason converts an
-- accident into a decision, with one column value instead of a policy someone has to remember.
--
-- The 98 already-indexable ones publish verbatim encyclopaedic geography — "Brighton is a
-- seaside resort in the unitary authority area and city of Brighton and Hove…" — with no
-- queer content at all, duplicating Wikipedia and the city page at the same time.
--
-- SCOPE: buckets A + B + C only. Full classification in
-- docs/audits/2026-09-04-tag-glossary-triage.md §2.2.
--   A  39  country tag -> country page                unambiguous
--   B   1  luxembourg: country AND city, both real     unambiguous
--   C  95  exactly one real city (96 minus cuauhtemoc) unambiguous
--   D  13  matches 2+ real cities        EXCLUDED. 3,579 usages incl. `berlin`. Deindexing is
--          arguably target-independent (every candidate is a real city page), but the audit
--          recommended blocking pending review and this migration does not overrule it.
--   E   8  region/state; only a tmp- shell matches     EXCLUDED. california/pennsylvania/wales/
--          queensland have NO geo entity to duplicate — the only name match is a junk shell.
--   F 165  no geo match (travel, europe, coastal, …)   EXCLUDED. Real glossary terms; these are
--          the ones the description backfill SHOULD fill.
--
-- WHY THE AMBIGUITY TEST IS A PREDICATE, NOT A SLUG LIST
-- Measured: in 3 of 12 ambiguous cases the plain un-suffixed city slug belongs to the WRONG
-- city — /city/zurich is Zurich US (9 venues) while Zürich CH (380 venues, 3,270 events) lives
-- at /city/zuerich; /city/san-jose is Costa Rica; /city/san-juan is Argentina with 0 venues.
-- A first pass at this audit resolved tags to geo by slug and silently paired /tags/zurich with
-- the US city. Slug equality is not evidence of identity.
--
-- WHY tmp- SLUGS ARE EXCLUDED FROM THE MATCH
-- `tmp-` is the personality-birth-place shell cohort (1,832 rows, none with a wikidata_qid,
-- many not places at all). Counting them as real cities turns region tags into false duplicates.
--
-- WHY `cuauhtemoc` IS EXCLUDED BY NAME
-- It is filed entity_kind='place' AND primary-category travel-destinations AND matches exactly
-- one real city, so no structural predicate here can exclude it — but its description is the
-- Aztec ruler Cuauhtémoc, not the Mexico City borough. Those two "independent" filing signals
-- are written by the SAME statement in 20261006140100_tag_refile_deterministic.sql, so they are
-- one signal read twice and can never disagree. Deindexing it happens to be the right outcome,
-- but stamping it 'place-duplicate' would mislead a future audit of that reason, so it goes to
-- the wrong-sense flow instead.
--
-- WHAT THIS DOES NOT DO
-- No merges. No writes to wikidata_id, description, tags[], unified_tag_assignments, usage_count
-- or status. The denormalized events.tags / venues.tags arrays are untouched, so ?tags=<slug>
-- and every browse filter keep working. Reverse with:
--   update public.unified_tags set seo_indexable=false, seo_deindex_reason='thin'
--    where seo_deindex_reason='place-duplicate';

do $$
declare
  v_a int; v_b int; v_c int; v_total int;
  v_amb text[]; v_bad text[]; v_written int; v_leak int;
begin
  -- log_unified_tag_change() RAISEs when an undeclared `system:%` actor modifies a
  -- human_reviewed row, and much of this corpus is bulk-stamped human_reviewed.
  perform set_config('app.actor', 'migration:tag_place_duplicate_deindex', true);

  create temporary table _place_dupes on commit drop as
  with d as (
    select t.id, t.slug, t.name, t.seo_indexable, t.seo_deindex_reason
      from public.unified_tags t
     where t.status = 'active'
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
   where (n_country > 0 or n_city_real = 1)
     and n_city_real <= 1
     and j.slug <> 'cuauhtemoc';

  select count(*) filter (where bucket='A'), count(*) filter (where bucket='B'),
         count(*) filter (where bucket='C'), count(*)
    into v_a, v_b, v_c, v_total from _place_dupes;
  raise notice 'place-duplicate buckets: A=% B=% C=% total=%', v_a, v_b, v_c, v_total;

  -- Guard 1: the classification must reproduce. If the corpus moved, the audit's hand-reading
  -- no longer describes these rows and this must not act on a stale classification.
  if (v_a, v_b, v_c) is distinct from (39, 1, 95) then
    raise exception 'bucket split moved: got A=% B=% C=%, audit measured A=39 B=1 C=95', v_a, v_b, v_c;
  end if;

  -- Guard 2: no ambiguous tag may have leaked in. Re-derives the candidate count rather than
  -- trusting the bucket label computed above.
  select array_agg(p.slug) into v_amb
    from _place_dupes p
   where (select count(*) from public.cities ci
           where ci.duplicate_of_id is null and ci.slug not like 'tmp-%'
             and public.dedup_despace(ci.name) = public.dedup_despace(p.name)) > 1;
  if v_amb is not null then
    raise exception 'ambiguous same-name tags selected, resolve by content mass first: %', v_amb;
  end if;

  -- Guard 3: the known excluded cohort must be absent.
  select array_agg(slug) into v_bad from _place_dupes
   where slug in ('male','cuauhtemoc','california','pennsylvania','wales','queensland',
                  'manhattan','usa','rotorua','santurce','berlin','zurich','san-jose','san-juan');
  if v_bad is not null then
    raise exception 'excluded-cohort tags selected: %', v_bad;
  end if;

  -- The write. Two cohorts, one reason: already-indexable rows are deindexed now, and rows
  -- already down for 'thin' are restamped so a future description cannot silently re-index
  -- them. A row deindexed for some OTHER reason is left alone — that reason is someone else's
  -- decision and default-deny already protects it. (Measured: zero such rows today.)
  update public.unified_tags t
     set seo_indexable      = false,
         seo_deindex_reason = 'place-duplicate',
         updated_at         = now()
    from _place_dupes d
   where t.id = d.id
     and (t.seo_indexable is true or t.seo_deindex_reason = 'thin')
     and t.seo_deindex_reason is distinct from 'place-duplicate';
  get diagnostics v_written = row_count;
  raise notice 'place-duplicate rows written: %', v_written;

  -- Guard 4: assert the postcondition as a PROPERTY, not a count. No tag this migration
  -- classified as a place duplicate may remain indexable.
  select count(*) into v_leak
    from public.unified_tags t join _place_dupes d on d.id = t.id
   where t.seo_indexable is true;
  if v_leak > 0 then
    raise exception 'postcondition failed: % place-duplicate tags still indexable', v_leak;
  end if;
end $$;
