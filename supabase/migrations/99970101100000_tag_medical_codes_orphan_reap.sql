-- Round seventeen — THE CODES A DISOWNED ENTITY LEFT BEHIND.
--
-- Rounds two to sixteen worked the glossary's PROSE. This one is the same
-- failure in a different artifact: `tag_medical_codes`. Six ACTIVE, INDEXABLE
-- tags publish clinical codes derived from a Wikidata entity that has since
-- been disowned (`wikidata_id` nulled), and the weekly sync has never removed
-- them. All six codes were resolved LIVE before this file was written, never
-- inferred from the tag name:
--
--   passing   Expression & Style   ICPC-2 A96          = Q4 "death"
--   seafood   Politics & Activism  ICD-10 U07.1/U07.2  = COVID-19 (+4 more)
--   bearded   Fetishes             ICD-10 L68.0        = hirsutism (+2 more)
--   s-a-m     Orientation          SNOMED 223688001    = Q30 "United States"
--   scat      Fetishes             ICD-11 XA5CS6       = Q30015788 "subcutaneous
--                                                        adipose tissue"
--   whore     Fetishes             SNOMED 137116002    = Q14915751 "prostitute"
--
-- `/tags/passing` — a trans glossary entry — publishes the ICPC-2 code for
-- DEATH. CLAUDE.md already names passing/seafood/bearded as "the sharpest harm"
-- of the 2026-08-29 wrong-entity repair and records their identifiers as nulled.
-- The identifiers were. The CODES were not, and have rendered ever since.
--
-- THE MECHANISM IS THE REPAIR ITSELF. `run_tag_medical_codes_sync` builds its
-- work set as
--     where status = 'active' and wikidata_id ~ '^Q[0-9]+$'
-- so the moment a wrong identifier is cleared the row leaves the work set
-- entirely: the sync can no longer refresh it, and its only DELETE is against a
-- temp table. This is `queerness`'s rule (20360401100300) one artifact class
-- further on — nulling an identifier does not unpublish what it produced — and
-- here the documented remedy is what creates the permanent defect. The admin
-- panel's docblock said so in as many words ("the way to change what appears
-- here is to fix the tag's wikidata_id"); it is corrected in this change.
--
-- THE REAPER'S PREDICATE IS THE EXACT COMPLEMENT OF THE SYNC'S WORK SET, so no
-- row can be both unrefreshable and retained. `source <> 'editorial'` keeps the
-- curated lane the sync already promises never to delete — measured, that lane
-- holds ZERO rows today, so the exclusion is a forward-looking guard and is not
-- doing work in this migration.
--
-- THE NULL TRAP, caught by running the predicate rather than reading it. The
-- obvious spelling
--     not (status = 'active' and wikidata_id ~ '^Q[0-9]+$')
-- is NULL when `wikidata_id` IS NULL, so `not NULL` is not true and ALL SIX
-- defective rows fall out: the reaper would have deleted only the inert merged
-- row, reported success, and left every wrong code rendering. `coalesce(…,
-- false)` is load-bearing, and a postcondition asserts the six are gone by NAME
-- rather than by count.
--
-- THE ONE-SHOT REPAIR IS THE REAPER, called once. The recurring fix and the
-- backfill are therefore the same code path, so applying this file is itself
-- the proof that the scheduled call works.
--
-- Scope: 19 code rows over 7 tags — 14 on the 6 active indexable tags (the live
-- harm) and 5 on `sexual-pain-penetration-disorder`, which is `status='merged'`
-- and so renders nowhere. The merged row is included because it is unreachable
-- by the same mechanism, and nothing is lost: an unmerge restores the tag to
-- the sync's work set and the next Monday re-adds its codes.
--
-- Deliberately NOT done: no identifier is repointed (the weekly sync rebuilds
-- from it, so a plausible-but-wrong QID regenerates wrong codes forever while a
-- null one regenerates nothing), and no prose is touched — `bearded` and
-- `seafood` carry a NULL description, which is a separate seam.

select set_config('app.actor', 'migration:99970101100000', true);

-- ---------------------------------------------------------------- the reaper
create or replace function public.run_tag_medical_codes_reap_orphans()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $reap$
declare
  v_deleted int;
  v_tags    int;
begin
  perform public.assert_admin_or_internal();

  with doomed as (
    select m.id, m.tag_id
      from public.tag_medical_codes m
      join public.unified_tags t on t.id = m.tag_id
     -- The curated lane the sync promises never to delete.
     where m.source is distinct from 'editorial'
       -- Exact complement of run_tag_medical_codes_sync's `_map`. The coalesce
       -- is load-bearing: wikidata_id IS NULL makes the regex NULL, and a bare
       -- NOT over that is NULL, which silently retains every row this exists
       -- to remove.
       and not coalesce(t.status = 'active' and t.wikidata_id ~ '^Q[0-9]+$', false)
  ), gone as (
    delete from public.tag_medical_codes c
     using doomed d
     where c.id = d.id
    returning d.tag_id
  )
  select count(*), count(distinct tag_id) into v_deleted, v_tags from gone;

  return jsonb_build_object('deleted_codes', v_deleted, 'tags', v_tags);
end;
$reap$;

revoke all on function public.run_tag_medical_codes_reap_orphans() from public, anon, authenticated;
grant execute on function public.run_tag_medical_codes_reap_orphans() to service_role;

comment on function public.run_tag_medical_codes_reap_orphans() is
  'Deletes clinical codes the weekly sync can no longer see. Its predicate is the exact complement of run_tag_medical_codes_sync''s work set, so a code whose tag lost its Wikidata identifier cannot outlive the entity it came from. Never touches source=''editorial''.';

-- ------------------------------------------------------------- the sentinel
create or replace function public.tag_medical_code_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $sig$
  with scoped as (
    select m.id, m.source, t.slug, t.status, t.seo_indexable,
           coalesce(t.status = 'active' and t.wikidata_id ~ '^Q[0-9]+$', false) as syncable
      from public.tag_medical_codes m
      join public.unified_tags t on t.id = m.tag_id
  )
  select jsonb_build_object(
    'probe_ok', true,
    -- Coverage FIRST: zero orphans over an empty table is not a clean corpus.
    'code_rows_total', (select count(*) from scoped),
    'tags_total',      (select count(distinct slug) from scoped),
    -- Zero-invariant. A code on a tag the sync cannot refresh is frozen prose
    -- of the clinical kind — it can only ever be stale, never corrected.
    'orphan_code_rows', (select count(*) from scoped where not syncable and source is distinct from 'editorial'),
    'orphan_tags',      (select count(distinct slug) from scoped where not syncable and source is distinct from 'editorial'),
    -- Named, not merely counted, so a NEW one is distinguishable at a glance.
    'orphan_examples', (
      select coalesce(jsonb_agg(distinct slug), '[]'::jsonb)
        from scoped where not syncable and source is distinct from 'editorial'),
    -- Reported separately: the editorial lane is exempt from the reaper by
    -- design, so it must never be folded into the invariant above.
    'editorial_rows', (select count(*) from scoped where source = 'editorial')
  );
$sig$;

revoke all on function public.tag_medical_code_signals() from public, anon, authenticated;
grant execute on function public.tag_medical_code_signals() to service_role;

comment on function public.tag_medical_code_signals() is
  'Clinical-code hygiene. orphan_code_rows is a zero-invariant: a code whose tag is not in the sync work set can never be refreshed or retracted, so it outlives the entity that produced it.';

-- ------------------------------------- fold the reap into the existing cron
-- THE REGISTRY IS THE WRONG LEVER HERE, and the first draft of this migration
-- reached for it by reflex. `tag_medical_codes_sync` is an
-- `action->>'type' = 'rpc'` row and carries NO `action.command` key at all, so
-- sync_automations_to_cron() branch (d) structurally cannot schedule it —
-- CLAUDE.md records that every rpc automation is scheduled by its OWN
-- migration, which is why editing the registry here would have changed a row
-- nothing reads while the live job kept running the old command.
--
-- It also failed SILENTLY: the guard was `action->>'command' not ilike
-- '%reap_orphans%'`, and that column is NULL on this row, so the predicate is
-- NULL, the UPDATE matched zero rows, and only the postcondition caught it.
-- Second instance of the same NULL trap in one file.
--
-- So the cron is edited directly, which for an rpc row is the convention and
-- not the `detect_stale_venues` mistake: there is no reconciler branch that can
-- overwrite it. cron.schedule() upserts by jobname, and the schedule is
-- restated unchanged so the job is not silently moved.
select cron.schedule(
  'tag_medical_codes_sync',
  '30 5 * * 1',
  ' set statement_timeout = ''600s''; select public.run_tag_medical_codes_sync(); select public.run_tag_medical_codes_reap_orphans(); '
);

-- ---------------------------------------------------------------- the repair
-- Same code path as the scheduled call, so this IS the proof it works.
select public.run_tag_medical_codes_reap_orphans();

do $verify$
declare
  v_bad     int;
  v_total   int;
  v_healthy int;
  v_slugs   text;
begin
  -- 1. The six named rows no longer publish a clinical code. BY NAME, because
  --    a count is equally satisfied by a slug that left the corpus entirely.
  select count(*), coalesce(string_agg(distinct t.slug, ', ' order by t.slug), '')
    into v_bad, v_slugs
    from public.tag_medical_codes m
    join public.unified_tags t on t.id = m.tag_id
   where t.slug in ('passing', 'seafood', 'bearded', 's-a-m', 'scat', 'whore');
  if v_bad <> 0 then
    raise exception 'round seventeen: % code row(s) still published on disowned tags (%)', v_bad, v_slugs;
  end if;

  -- 2. The invariant, corpus-wide and through the sentinel's own definition.
  select count(*) into v_bad
    from public.tag_medical_codes m
    join public.unified_tags t on t.id = m.tag_id
   where m.source is distinct from 'editorial'
     and not coalesce(t.status = 'active' and t.wikidata_id ~ '^Q[0-9]+$', false);
  if v_bad <> 0 then
    raise exception 'round seventeen: % orphan clinical code row(s) survive the reap', v_bad;
  end if;

  -- 3. THE MIRROR. The reap must not have taken the working corpus with it;
  --    "zero orphans" is equally satisfied by an empty table.
  select count(*) into v_healthy
    from public.tag_medical_codes m
    join public.unified_tags t on t.id = m.tag_id
   where t.status = 'active' and t.wikidata_id ~ '^Q[0-9]+$';
  if v_healthy < 380 then
    raise exception 'round seventeen: only % code rows remain on syncable tags — the reap over-reached', v_healthy;
  end if;

  select count(*) into v_total from public.tag_medical_codes;
  if v_total <> v_healthy then
    raise exception 'round seventeen: % total code rows but only % syncable — residue survives', v_total, v_healthy;
  end if;

  -- 4. The LIVE cron carries the reap, so the fix is recurring and not
  --    one-shot. Asserted against cron.job rather than the registry, because
  --    this rpc row has no action.command for the registry to carry — and
  --    because CLAUDE.md's rule is to verify a rescheduled cron live rather
  --    than assume it from the migration file.
  select count(*) into v_bad
    from cron.job
   where jobname = 'tag_medical_codes_sync'
     and command ilike '%run_tag_medical_codes_reap_orphans%'
     and command ilike '%run_tag_medical_codes_sync%'
     and schedule = '30 5 * * 1'
     and active;
  if v_bad <> 1 then
    raise exception 'round seventeen: the live cron does not run sync-then-reap on its original schedule';
  end if;

  -- 5. The sentinel answers and reports its own coverage.
  if coalesce((public.tag_medical_code_signals()->>'orphan_code_rows')::int, -1) <> 0 then
    raise exception 'round seventeen: sentinel does not report a clean corpus';
  end if;
  if coalesce((public.tag_medical_code_signals()->>'code_rows_total')::int, 0) < 380 then
    raise exception 'round seventeen: sentinel reports a near-empty table — it is measuring nothing, not passing';
  end if;
end
$verify$;
