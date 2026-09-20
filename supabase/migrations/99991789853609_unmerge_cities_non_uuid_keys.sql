-- unmerge_cities throws on EVERY schema:1 merge. Three child tables key on bigint.
--
-- `29000101100200` gave merge_cities the moved-row recording this repo's
-- reversibility contract requires, and gave unmerge_cities the replay. The replay
-- compares recorded ids with a hardcoded uuid cast:
--
--     ... and %I in (select v::uuid from jsonb_array_elements_text($3) v)
--
-- Three of the tables it replays do not have a uuid key:
--
--     ingestion_events.id          bigint
--     venue_coord_fixes.id         bigint
--     source_coverage_targets.id   bigint
--
-- so the statement fails to PLAN with
-- `42883 operator does not exist: bigint = uuid`.
--
-- THE CAST FAILS AT PLAN TIME, NOT AT ROW TIME, so an EMPTY recorded array throws
-- exactly as hard as a populated one. merge_cities writes a key for every table it
-- considers, including `[]` when nothing moved, and the replay loop runs every
-- triple unconditionally -- so the throw does not depend on a city having any
-- ingestion_events at all. Measured on prod: 35 of 35 schema:1 city merges would
-- throw, 0 have ever been undone. City unmerge has never once worked.
--
-- WHY THIS SURVIVED THE ORIGINAL CHANGE. `29000101100200` was dry-run for the
-- RECORDING half -- merge_cities writing details.moved + schema:1 -- and the event
-- and venue cores had their full merge/unmerge round trips exercised (events
-- 514 -> 0 -> 514). The city round trip was never run, and every static check
-- passes: the audit row carries `schema:1`, `details.moved` is populated, and
-- `city_merge_audit` looks complete. The flag says reversible and the function
-- throws -- the same "Undo said otherwise" shape that whole change existed to
-- remove, reintroduced one entity over. Found by actually calling
-- unmerge_cities in a rolled-back transaction, not by reading it.
--
-- FIX: compare as TEXT (`%I::text in (select v from ...)`) rather than casting the
-- recorded value to uuid. The recorded side is already text --
-- jsonb_array_elements_text -- so this is type-agnostic across uuid, bigint and
-- anything added later, and cannot break again when a fourth key type appears.
-- The cost is that a ::text comparison cannot use an index; these are
-- `id IN (small list)` lookups on an operation that runs by hand, and correctness
-- beats a plan here.
--
-- TWO SITES, not one. The dynamic triple loop is the obvious one; the STATIC
-- `source_coverage_targets` statement further down carries the same hardcoded
-- `v::uuid` against a bigint id. Fixing only the loop leaves unmerge broken for
-- any city that has a coverage target. The other static statements
-- (news_article_cities, city_favorites, event_coverage_gaps, city_aliases,
-- dup_children, venues/events city_text) are all genuinely uuid and are left
-- alone -- casting them to text too would be a silent, gratuitous deoptimisation.
--
-- The body below is the deployed function with those two lines changed. It is
-- restated in full rather than patched with regexp_replace on the live
-- definition: this repo already paid for that once, when `20260806140000` applied
-- string surgery to a live function and left the committed migration wrong until
-- `20260809100000` re-committed the whole thing.

create or replace function public.unmerge_cities(p_audit_id uuid, p_force boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  a public.city_merge_audit;
  v_moved jsonb; v_restored boolean := false; v_counts jsonb := '{}'::jsonb; n int;
  v_pre_schema boolean; v_key text; i int; v_rec jsonb;
  v_triples text[] := array[
    'venues','city_id','id', 'events','city_id','id', 'festivals','city_id','id',
    'hotels','city_id','id', 'queer_villages','city_id','id', 'organizations','city_id','id',
    'milestones','city_id','id', 'trip_places','city_id','id', 'trips','primary_city_id','id',
    'guides','city_id','id', 'geo_sources','city_id','id', 'reservations','city_id','id',
    'intimate_cruising_mode','city_id','user_id',
    'intimate_profiles','discovery_city_id','id',
    'user_travel_preferences','home_city_id','user_id',
    'ingestion_events','city_id','id', 'flyer_scans','matched_city_id','id',
    'trip_geo_review_queue','resolved_city_id','id', 'venue_coord_fixes','city_id','id',
    'venue_event_staging','city_id','id', 'user_place_marks','city_id','id',
    'personalities','city_id','id', 'personalities','death_city_id','id'
  ];
begin
  if auth.uid() is not null
     and not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  select * into a from public.city_merge_audit where id = p_audit_id;
  if not found then raise exception 'audit % not found', p_audit_id; end if;
  if a.undone_at is not null then raise exception 'merge already undone'; end if;

  v_pre_schema := coalesce((a.details->>'schema')::int, 0) < 1;
  if v_pre_schema and not p_force then
    raise exception 'city merge audit % predates moved-row recording; its reparenting cannot be restored. Re-run with p_force => true to clear duplicate_of_id only, leaving content on the keep row.', p_audit_id;
  end if;
  v_moved := a.details->'moved';

  if not v_pre_schema then
    -- plain FK repoints, scoped to the keep id so a row that was always on the survivor
    -- is never dragged across.
    --
    -- `%I::text in (select v from ...)` rather than `%I in (select v::uuid ...)`:
    -- ingestion_events.id and venue_coord_fixes.id are bigint, and the uuid cast
    -- fails to plan even for an empty array.
    i := 1;
    while i < array_length(v_triples, 1) loop
      v_key := v_triples[i] || '.' || v_triples[i+1];
      execute format(
        'update public.%I set %I = $1 where %I = $2 and %I::text in (select v from jsonb_array_elements_text($3) v)',
        v_triples[i], v_triples[i+1], v_triples[i+1], v_triples[i+2])
        using a.drop_id, a.keep_id, coalesce(v_moved->v_key, '[]'::jsonb);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object(v_key, n);
      i := i + 3;
    end loop;

    -- TEXT: these ids held the dropped city's name before the merge overwrote it.
    update public.venues set city = a.details->>'drop_name'
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'venues_city_text','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venues_city_text', n);

    update public.events set city = a.details->>'drop_name'
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'events_city_text','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events_city_text', n);

    -- the array: restore the stored original wholesale rather than replacing keep with
    -- drop, which would not recover a collapsed pair.
    n := 0;
    for v_rec in select * from jsonb_array_elements(coalesce(v_moved->'news_articles_city_ids','[]'::jsonb)) loop
      update public.news_articles
         set city_ids = (select array_agg(x::uuid) from jsonb_array_elements_text(v_rec->'city_ids') x)
       where id = (v_rec->>'id')::uuid;
      n := n + 1;
    end loop;
    v_counts := v_counts || jsonb_build_object('news_articles_city_ids', n);

    update public.news_article_cities set city_id = a.drop_id
      where city_id = a.keep_id
        and id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'news_article_cities','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_cities', n);

    -- the destroyed rows come back from their stored bodies.
    insert into public.news_article_cities
    select * from jsonb_populate_recordset(null::public.news_article_cities,
             coalesce(v_moved->'news_article_cities_deleted_rows','[]'::jsonb))
    on conflict do nothing;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_cities_restored', n);

    update public.city_favorites set city_id = a.drop_id
      where city_id = a.keep_id
        and id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'city_favorites','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('city_favorites', n);

    -- source_coverage_targets.id is BIGINT -- the second broken site, and the one a
    -- fix confined to the loop above would miss.
    update public.source_coverage_targets set city_id = a.drop_id
      where city_id = a.keep_id
        and id::text in (select v from jsonb_array_elements_text(coalesce(v_moved->'source_coverage_targets','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('source_coverage_targets', n);

    update public.event_coverage_gaps set city_id = a.drop_id
      where city_id = a.keep_id
        and id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'event_coverage_gaps','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('event_coverage_gaps', n);

    update public.city_aliases set city_id = a.drop_id
      where city_id = a.keep_id
        and id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'city_aliases','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('city_aliases', n);

    update public.cities set duplicate_of_id = a.drop_id, updated_at = now()
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'dup_children','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

    v_restored := true;
  end if;

  update public.cities set duplicate_of_id = null, updated_at = now()
    where id = a.drop_id and duplicate_of_id = a.keep_id;

  -- Only remove the minted alias if THIS merge minted it. The pre-schema path keeps the
  -- old unconditional behaviour, which is the best it can do without a record.
  if v_pre_schema or coalesce((a.details->>'alias_minted')::boolean, false) then
    delete from public.city_aliases where city_id = a.keep_id
      and alias_key = lower(coalesce(a.details->>'drop_name',
                            (select name from public.cities where id = a.drop_id)));
  end if;

  update public.city_merge_audit set undone_at = now() where id = p_audit_id;

  return jsonb_build_object('unmerged', a.drop_id, 'keep_id', a.keep_id,
    'reparenting_restored', v_restored,
    'restored', case when v_restored then v_counts else null end);
end; $function$;

revoke all on function public.unmerge_cities(uuid, boolean) from public, anon, authenticated;
grant execute on function public.unmerge_cities(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Postconditions. The check that matters is a real round trip, not a string scan:
-- the previous version passed every structural test that existed.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_audit   uuid;
  v_keep    uuid;
  v_drop    uuid;
  v_before  int;
  v_after   int;
  v_res     jsonb;
  v_uuid_casts int;
begin
  -- 1. Neither broken site may survive. Counting is deliberate: asserting "the
  --    text form is present" passes while the other site still casts to uuid.
  -- pg_proc must precede the lateral that reads p.oid; the comma form put the
  -- set-returning function first and failed 42P01.
  select count(*) into v_uuid_casts
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral regexp_matches(
      -- pg_get_functiondef returns the body INCLUDING its own comments, and this
      -- function's body quotes `v::uuid` in a comment explaining why the bigint
      -- sites use the text form instead. Counting the raw definition therefore
      -- reports 8 and the postcondition aborts db push for the whole repo on a
      -- CORRECT rewrite. Strip line comments so the count measures what it
      -- claims to measure: actual cast sites.
      regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
      'v::uuid', 'g') m
   where n.nspname = 'public' and p.proname = 'unmerge_cities';
  -- 7 legitimate uuid sites remain: venues/events city_text, news_article_cities,
  -- city_favorites, event_coverage_gaps, city_aliases, dup_children.
  if v_uuid_casts <> 7 then
    raise exception 'expected exactly 7 remaining v::uuid sites, found % -- a bigint key may still be cast, or a uuid site was needlessly changed', v_uuid_casts;
  end if;

  -- 2. Round trip a real merge and put it back. Any schema:1 audit will do; this
  --    is the exact call that threw 42883 before.
  select a.id, a.keep_id, a.drop_id into v_audit, v_keep, v_drop
    from public.city_merge_audit a
   where (a.details->>'schema')::int >= 1 and a.undone_at is null
   order by a.created_at desc limit 1;

  if v_audit is null then
    raise notice 'no schema:1 city merge available to round-trip; structural check only';
    return;
  end if;

  select count(*) into v_before from public.venues where city_id = v_keep;

  v_res := public.unmerge_cities(v_audit);
  if not coalesce((v_res->>'reparenting_restored')::boolean, false) then
    raise exception 'unmerge reported reparenting_restored=false on a schema:1 audit';
  end if;

  -- put it straight back: this migration proves the path works, it does not
  -- undo somebody's merge as a side effect.
  perform public.merge_cities(v_keep, v_drop, true);

  select count(*) into v_after from public.venues where city_id = v_keep;
  if v_after <> v_before then
    raise exception 'round trip lost rows: venues on keep went % -> %', v_before, v_after;
  end if;

  raise notice 'verify ok: unmerge/merge round trip clean on audit %, venues % -> %',
    v_audit, v_before, v_after;
end
$verify$;
