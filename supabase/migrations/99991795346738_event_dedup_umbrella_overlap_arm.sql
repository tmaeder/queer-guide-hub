-- Event dedup: a REVIEW-ONLY arm for duplicate festival umbrellas.
--
-- Plan: docs/plans/2026-11-22-festival-multi-event-structure-design.md, Phase 1
-- item 5.
--
-- Big festivals exist as several TOP-LEVEL multi-day rows. Measured on prod
-- 2026-11-22: Darklands x4 in Antwerp ("Darklands", "Darklands Antwerp Fetish
-- Festival", "Darklands Antwerp After Parties", "Beyond Darklands"), IML x3 in
-- Chicago, BeefDip x3 in Puerto Vallarta. The event branch of
-- run_dedup_truth_sweep cannot see any of them: every pair it generates is
-- blocked on `a.start_date::date = b.start_date::date`, and an umbrella's
-- duplicate rarely starts on the same calendar day (IML: 26, 27 and 28 May).
--
-- The arm:
--   * both rows span > 20h and <= 31 days (the 31-day ceiling is Phase 1 item 1's
--     fake-umbrella bound -- a 4-year "After work" row is a recurring night, not a
--     festival);
--   * same city_id, and the date spans OVERLAP;
--   * one row's umbrella key contains the other's, where the key is the despaced
--     title with years, standalone numbers/ordinals and the city's own name
--     stripped ("Darklands Antwerp After Parties" -> darklandsafterparties, which
--     contains darklands);
--   * key >= 5 chars on both sides;
--   * at least one side has not ended yet. 106 of the 268 pairs this finds are
--     past editions (mostly 2013 Wayback imports); they cost reviewer time and
--     the sweep's 200-row queue cap for nothing a reader will see;
--   * not already parent and child of each other;
--   * not already produced by one of the existing arms (so their counts cannot
--     move -- asserted below, before vs after, in this transaction).
--
-- A SECOND shape, umbrella_nested_duplicate: the duplicate is not top-level at
-- all but filed as the umbrella's own programme child ("Atlanta Pride 2027" <-
-- "Atlanta Pride 2027", "Folsom Europe 2027" <- "Folsom Europe"), which the
-- containment arm above excludes and the linker created. A linked pair is
-- proposed when the parent spans > 20h and <= 31 days, at least one side has not
-- ended, keys are >= 5 chars, and either the child's key adds nothing to the
-- parent's or the parent's key is inside the child's AND the child spans >= 50%
-- of the parent. "gay" and "weekend" are filler in this key ("Boston Pride
-- Weekend 2027" under "Boston Pride 2027"); "parade" deliberately is not.
-- Measured 2026-11-22: 121 live links, 39 match before the filler words; the miss
-- list ("Pig Week 2026" <- "Mr. Pig Week 2026", "Folsom Europe 2027" <- "PiG The
-- Official Folsom Europe Party", "Leeds Pride 2027" <- "Leeds Pride Parade 2027")
-- is real programme children. _event_merge_core refuses to merge an umbrella
-- with its own child and that guard STAYS; approve_dedup_review clears the link
-- first ONLY for this reason (see the block below).
--
-- NEVER auto. "Darklands" vs "Darklands After Parties" is an umbrella and its
-- child, not a duplicate, and the title alone cannot tell the two apart. The
-- reviewer decides merge vs make-child; the arm only puts the pair in front of
-- them. is_auto is the literal FALSE, and confidence 0.70 sits below every other
-- event arm (lowest is 0.80), so it sorts last under the branch's LIMIT 1200 and
-- the sweep's 200-row queue cap: it can only take capacity the existing arms did
-- not use.
--
-- "Review-only" has a SECOND door, and a threshold does not close it.
-- run_dedup_review_autoapprove (cron 30 6 * * *, called with no arguments)
-- approves every OPEN pair at confidence >= its default 0.80 -- i.e. it merges
-- queued pairs with no human. 0.70 clears that today only because of a default
-- someone could lower. So the autoapprove excludes this reason by NAME (patched
-- below), and the verify block asserts it.
--
-- Measured on prod 2026-11-22 (dry run in a rolled-back transaction, this file
-- executed as written): existing arms unchanged -- title_day_no_venue 337,
-- title_containment_same_instant 94, exact_instant_venue_conflict 4,
-- despace_same_venue_name_exact_ts 2, exact_instant_same_city 1,
-- cross_source_venue_substring_2h 1, before == after -- plus 162 new
-- umbrella_overlap_containment pairs (268 without the not-ended filter) and
-- 40 umbrella_nested_duplicate pairs, 0 auto-eligible. Approving one of the 40
-- ("Atlanta Pride 2027" <- itself) in the same rolled-back run merged it, cleared
-- the link and stamped the old parent id on the dropped row.
--
-- The reviewer payload gains the facts this decision turns on: end_date (the
-- span), programme_children (how many live children each side already holds) and
-- part_of (the parent's title, when a side is already someone's child).
--
-- Function bodies are PATCHED from pg_get_functiondef with exactly-once anchors,
-- never restated: the live body has been rewritten by string surgery before and
-- the newest migration file is not a reliable copy of it.

do $mig$
declare
  v_src text; v_new text; v_n int;
  v_before jsonb; v_after jsonb; v_q text; v_s int; v_e int; v_auto int;
  v_marker constant text := 'when ''event'' then $q$';
  v_anchor_a constant text := 'where not is_showtime and (same_title or same_instant_city))';
  v_anchor_b constant text := 'from armed' || chr(10)
                              || '    order by is_auto desc, conf desc limit 1200';
  v_umbrella constant text := $u$where not is_showtime and (same_title or same_instant_city)),
    -- umbrella_overlap_containment (review only). See migration 99991795346738.
    umb_live as (
      select e.id, e.title, e.start_date, e.end_date, e.city_id, e.parent_event_id,
             e.quality_score::numeric q, e.is_featured::boolean f, e.created_at::timestamptz c,
             public.dedup_despace(regexp_replace(regexp_replace(
               lower(extensions.unaccent(e.title)),
               '\m(19|20)[0-9]{2}\M|\m[0-9]+(st|nd|rd|th)?\M', ' ', 'g'),
               '\m' || regexp_replace(lower(extensions.unaccent(ci.name)), '[^a-z0-9 ]', '', 'g') || '\M',
               ' ', 'g')) uk
      from public.events e join public.cities ci on ci.id = e.city_id
      where e.duplicate_of_id is null and coalesce(e.status,'') <> 'archived'
        and e.end_date - e.start_date > interval '20 hours'
        and e.end_date - e.start_date <= interval '31 days'),
    umbrella as (
      select a.id a_id, b.id b_id, a.title a_title, b.title b_title,
             a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
      from umb_live a join umb_live b
        on a.city_id = b.city_id and a.id < b.id
       and a.start_date < b.end_date and b.start_date < a.end_date
       and greatest(a.end_date, b.end_date) >= now()
      where length(a.uk) >= 5 and length(b.uk) >= 5
        and (a.uk = b.uk or position(a.uk in b.uk) > 0 or position(b.uk in a.uk) > 0)
        and a.parent_event_id is distinct from b.id
        and b.parent_event_id is distinct from a.id
        and not exists (select 1 from armed x where x.a_id = a.id and x.b_id = b.id)),
    -- umbrella_nested_duplicate (review only): an umbrella's duplicate filed as its
    -- own programme child. See migration 99991795346738.
    umb_nested as (
      select c.id a_id, p.id b_id, c.title a_title, p.title b_title,
             c.quality_score::numeric aq, c.is_featured::boolean af, c.created_at::timestamptz ac,
             p.quality_score::numeric bq, p.is_featured::boolean bf, p.created_at::timestamptz bc
      from public.events c
      join public.events p on p.id = c.parent_event_id
      join public.cities ci on ci.id = p.city_id
      cross join lateral (select
        public.dedup_despace(regexp_replace(regexp_replace(
          lower(extensions.unaccent(c.title)),
          '\m(19|20)[0-9]{2}\M|\m[0-9]+(st|nd|rd|th)?\M|\m(gay|weekend)\M', ' ', 'g'),
          '\m' || regexp_replace(lower(extensions.unaccent(ci.name)), '[^a-z0-9 ]', '', 'g') || '\M',
          ' ', 'g')) ck,
        public.dedup_despace(regexp_replace(regexp_replace(
          lower(extensions.unaccent(p.title)),
          '\m(19|20)[0-9]{2}\M|\m[0-9]+(st|nd|rd|th)?\M|\m(gay|weekend)\M', ' ', 'g'),
          '\m' || regexp_replace(lower(extensions.unaccent(ci.name)), '[^a-z0-9 ]', '', 'g') || '\M',
          ' ', 'g')) pk) k
      where c.duplicate_of_id is null and p.duplicate_of_id is null
        and coalesce(c.status,'') <> 'archived' and coalesce(p.status,'') <> 'archived'
        and p.end_date - p.start_date > interval '20 hours'
        and p.end_date - p.start_date <= interval '31 days'
        and greatest(c.end_date, p.end_date) >= now()
        and length(k.ck) >= 5 and length(k.pk) >= 5
        and (position(k.ck in k.pk) > 0
             or (position(k.pk in k.ck) > 0
                 and extract(epoch from c.end_date - c.start_date)
                     >= 0.5 * extract(epoch from p.end_date - p.start_date)))
        and not exists (select 1 from armed x
                        where x.a_id = least(c.id, p.id) and x.b_id = greatest(c.id, p.id)))$u$;
  v_union constant text := 'from armed' || chr(10)
    || '    union all' || chr(10)
    || '    select a_id, b_id, a_title, b_title, false, 0.70::numeric,'
    || ' ''umbrella_overlap_containment'', null::double precision,' || chr(10)
    || '           aq, af, ac, bq, bf, bc' || chr(10)
    || '    from umbrella' || chr(10)
    || '    union all' || chr(10)
    || '    select a_id, b_id, a_title, b_title, false, 0.70::numeric,'
    || ' ''umbrella_nested_duplicate'', null::double precision,' || chr(10)
    || '           aq, af, ac, bq, bf, bc' || chr(10)
    || '    from umb_nested' || chr(10)
    || '    order by is_auto desc, conf desc limit 1200';
begin
  v_src := pg_get_functiondef('api_private.run_dedup_truth_sweep(text,text,integer)'::regprocedure);

  if position('umbrella_overlap_containment' in v_src) > 0 then
    raise notice 'umbrella arm already present; skipping sweep patch';
  else
    -- Both anchors are replaced inside the EVENT branch only. Anchor B also ends
    -- the venue branch, so a whole-function replace would patch both.
    v_s := position(v_marker in v_src) + length(v_marker);
    v_e := position('$q$' in substr(v_src, v_s));
    v_q := substr(v_src, v_s, v_e - 1);

    v_n := (length(v_q) - length(replace(v_q, v_anchor_a, ''))) / length(v_anchor_a);
    if v_n <> 1 then raise exception 'anchor A found % times in the event branch, expected 1', v_n; end if;
    v_n := (length(v_q) - length(replace(v_q, v_anchor_b, ''))) / length(v_anchor_b);
    if v_n <> 1 then raise exception 'anchor B found % times in the event branch, expected 1', v_n; end if;

    -- Per-arm counts of the event candidate query BEFORE the patch ...
    execute format('select coalesce(jsonb_object_agg(reason, n), ''{}'') from'
                   ' (select reason, count(*) n from (%s) z group by reason) g', v_q)
      into v_before;

    v_new := substr(v_src, 1, v_s - 1)
          || replace(replace(v_q, v_anchor_a, v_umbrella), v_anchor_b, v_union)
          || substr(v_src, v_s + v_e - 1);
    execute v_new;

    -- ... and AFTER, from the live function just installed. Every pre-existing arm
    -- must yield exactly what it yielded before; only the new key may appear.
    v_src := pg_get_functiondef('api_private.run_dedup_truth_sweep(text,text,integer)'::regprocedure);
    v_s := position(v_marker in v_src) + length(v_marker);
    v_e := position('$q$' in substr(v_src, v_s));
    v_q := substr(v_src, v_s, v_e - 1);
    execute format('select coalesce(jsonb_object_agg(reason, n), ''{}''), coalesce(sum(n_auto), 0) from'
                   ' (select reason, count(*) n,'
                   '         count(*) filter (where is_auto and reason in (''umbrella_overlap_containment'', ''umbrella_nested_duplicate'')) n_auto'
                   '    from (%s) z group by reason) g', v_q)
      into v_after, v_auto;

    if (v_after - 'umbrella_overlap_containment' - 'umbrella_nested_duplicate') <> v_before then
      raise exception 'P0 failed: existing event arms moved. before=% after=%', v_before, v_after;
    end if;
    -- The arm is review-only: no umbrella pair may ever be auto-eligible.
    if v_auto <> 0 then
      raise exception 'P3 failed: % umbrella pairs are auto-eligible; the arm is review-only', v_auto;
    end if;
    raise notice 'event arms before=% after=%', v_before, v_after;
  end if;
end $mig$;

-- Queue payload written at sweep time.
create or replace function public._dedup_event_cluster_side(p_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'slug', e.slug,
    'start_date', e.start_date, 'end_date', e.end_date,
    'city', e.city, 'venue_name', e.venue_name,
    'programme_children', (select count(*) from public.events k
                           where k.parent_event_id = e.id and k.duplicate_of_id is null),
    'part_of', (select p.title from public.events p where p.id = e.parent_event_id),
    'source', (select s.source_slug from public.event_sources s
               where s.event_id = e.id
               order by s.is_primary desc nulls last, s.first_seen_at limit 1))
  from public.events e where e.id = p_id;
$function$;

-- Live payload the inbox renders (resolved per view read, so the existing
-- backlog gets the new fields too).
do $mig$
declare
  v_src text; v_n int;
  v_anchor constant text := '''start_date'', e.start_date, ''end_date'', e.end_date, ''venue_name'', e.venue_name,';
  v_with constant text := v_anchor || chr(10)
    || '             ''programme_children'', (select count(*) from public.events k'
    || ' where k.parent_event_id = e.id and k.duplicate_of_id is null),' || chr(10)
    || '             ''part_of'', (select p.title from public.events p where p.id = e.parent_event_id),';
begin
  v_src := pg_get_functiondef('public.dedup_pair_side(text,uuid)'::regprocedure);
  if position('programme_children' in v_src) > 0 then
    raise notice 'dedup_pair_side already carries programme_children; skipping';
    return;
  end if;
  v_n := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then raise exception 'dedup_pair_side anchor found % times, expected 1', v_n; end if;
  execute replace(v_src, v_anchor, v_with);
end $mig$;

-- Autoapprove must never take an umbrella pair, whatever its threshold becomes.
do $mig$
declare
  v_src text; v_n int;
  v_anchor constant text := 'AND NOT (q.entity_type = ''city'' AND q.confidence < 0.95)';
begin
  v_src := pg_get_functiondef('public.run_dedup_review_autoapprove(numeric,integer)'::regprocedure);
  if position('umbrella_nested_duplicate' in v_src) > 0 then
    raise notice 'autoapprove already excludes the umbrella arms; skipping';
    return;
  end if;
  v_n := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then raise exception 'autoapprove anchor found % times, expected 1', v_n; end if;
  execute replace(v_src, v_anchor, v_anchor || chr(10)
    || '      AND coalesce(q.reason, '''') NOT IN (''umbrella_overlap_containment'', ''umbrella_nested_duplicate'')');
end $mig$;

-- Approving a NESTED pair must work. _event_merge_core refuses an umbrella and
-- its own child BY DESIGN ("structure, never duplicates"), and that guard stays:
-- for every other reason a linked pair still cannot be merged. Only when the
-- reviewer approves an umbrella_nested_duplicate pair -- i.e. a human has just
-- said the two rows are ONE event -- is the link cleared first, and the cleared
-- parent id is stamped on the child so it can be restored by hand.
do $mig$
declare
  v_src text; v_n int;
  v_anchor constant text := '  if q.entity_type = ''venue'' then v_result := public.merge_venues(v_keep, v_drop);';
  v_pre constant text := $p$  if q.entity_type = 'event' and q.reason = 'umbrella_nested_duplicate' then
    perform set_config('app.programme_link_source', 'admin', true);
    update public.events e
       set parent_event_id = null,
           enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
             || jsonb_build_object('event_programme_link',
                  coalesce(e.enrichment_status->'event_programme_link', '{}'::jsonb)
                  || jsonb_build_object('unlinked_for_merge', jsonb_build_object(
                       'parent_event_id', e.parent_event_id, 'review_id', q.id, 'at', now())))
     where e.id in (v_keep, v_drop) and e.parent_event_id in (v_keep, v_drop);
  end if;
$p$;
begin
  v_src := pg_get_functiondef('api_private.approve_dedup_review(uuid,uuid)'::regprocedure);
  if position('umbrella_nested_duplicate' in v_src) > 0 then
    raise notice 'approve_dedup_review already handles nested pairs; skipping';
    return;
  end if;
  v_n := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then raise exception 'approve anchor found % times, expected 1', v_n; end if;
  execute replace(v_src, v_anchor, v_pre || v_anchor);
end $mig$;

do $verify$
declare
  v_src text; v_sql text; v_s int; v_e int;
begin
  -- Text checks only: the two candidate scans in the patch block above already
  -- executed the new query (P0, P3); each scan costs ~27s on prod.
  v_src := pg_get_functiondef('api_private.run_dedup_truth_sweep(text,text,integer)'::regprocedure);
  v_s := position('when ''event'' then $q$' in v_src) + length('when ''event'' then $q$');
  v_e := position('$q$' in substr(v_src, v_s));
  v_sql := substr(v_src, v_s, v_e - 1);
  if position('''umbrella_overlap_containment''' in v_sql) = 0 then
    raise exception 'P1 failed: umbrella arm is not inside the event branch';
  end if;
  -- Anchor B also ends another branch; the union must exist exactly once, and
  -- it is inside the event branch (P1), so nothing else was patched.
  if (length(v_src) - length(replace(v_src, 'from umbrella', ''))) / length('from umbrella') <> 1 then
    raise exception 'P2 failed: the umbrella union is not present exactly once';
  end if;
  if position('programme_children' in pg_get_functiondef('public.dedup_pair_side(text,uuid)'::regprocedure)) = 0 then
    raise exception 'P4 failed: dedup_pair_side does not carry programme_children';
  end if;
  if position('programme_children' in pg_get_functiondef('public._dedup_event_cluster_side(uuid)'::regprocedure)) = 0 then
    raise exception 'P5 failed: _dedup_event_cluster_side does not carry programme_children';
  end if;
  if position('NOT IN (''umbrella_overlap_containment'', ''umbrella_nested_duplicate'')'
              in pg_get_functiondef('public.run_dedup_review_autoapprove(numeric,integer)'::regprocedure)) = 0 then
    raise exception 'P6 failed: run_dedup_review_autoapprove can approve umbrella pairs';
  end if;
  if position('''umbrella_nested_duplicate''' in v_sql) = 0
     or (length(v_src) - length(replace(v_src, 'from umb_nested', ''))) / length('from umb_nested') <> 1 then
    raise exception 'P7 failed: the nested arm is not in the event branch exactly once';
  end if;
  if position('q.reason = ''umbrella_nested_duplicate'''
              in pg_get_functiondef('api_private.approve_dedup_review(uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'P8 failed: approve_dedup_review cannot merge a nested pair';
  end if;
end $verify$;
