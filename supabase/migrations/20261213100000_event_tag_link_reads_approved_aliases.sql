-- `run_event_tag_link` never read `tag_aliases`, so approving an alias did
-- nothing for event linking.
--
-- The key map was built from `unified_tags` alone:
--
--   select lower(btrim(k)), u.id
--     from unified_tags u, lateral (values (u.slug), (u.name)) v(k)
--
-- No join to `tag_aliases` anywhere in the function. So the entire multilingual
-- alias vocabulary — 12,557 rows — was inert for the 36,219 events carrying
-- free-text `tags[]`. An alias could be written, reviewed and approved, and the
-- linker would still not use it. That is worth fixing on its own: the review
-- workflow existed and had no effect on the surface it was built for.
--
-- APPROVED ONLY, AND THE `auto` SET IS WHY.
--
-- `tag_aliases.review_status` is `approved` (403 rows) or `auto` (12,154).
-- Only `approved` is read here. That is not caution for its own sake — the
-- `auto` rows that would match event tag strings were measured, and they are
-- actively wrong:
--
--   alias           would tag as     uses   what it actually means
--   sex          -> biological-sex    337   German events mean sexuality
--   pan          -> buns               19   pansexual, not bread
--   komödie      -> humor               9   comedy the format, not the trait
--   vater        -> daddy               4   father; `daddy` is a kink term
--   chanson      -> vers                4   a music genre; `vers` is a position
--   liebe        -> snuggling           3   love
--   sexarbeit    -> harlot              1   sex work; the target is slur-adjacent
--   demo         -> demon               1   Demonstration, i.e. a protest
--   ausflug      -> outing              1   a day trip
--
-- `ausflug -> outing` is the one that decides it. An outing is someone being
-- exposed as queer without consent; an Ausflug is a day trip. Auto-tagging
-- family excursions with it would be a real harm, and `sexarbeit -> harlot`
-- and `vater -> daddy` are the same shape. This is the hazard the substance
-- alias work already documented — an approved alias IS an auto-tagging rule —
-- pointed at the reader instead of the row.
--
-- The 8 approved strings that match, by contrast, are all correct:
--   bi -> bisexual (23), nichtbinär -> non-binary (20), fußball -> football (19),
--   nonbinary -> non-binary (10), bears -> bear (4), bären -> bear (3),
--   rock -> rock-music (3), jazz -> jazz-music (2)
--
-- THE TAG MAP WINS; ALIASES ONLY FILL GAPS.
--
-- Unioning aliases in naively made five keys ambiguous that were not before —
-- `gay-friendly`, `lgbt-friendly`, `gbl`, `sildenafil`, `sertraline` — each a
-- real tag whose own name is ALSO an approved alias pointing at a broader
-- concept (`sildenafil` the tag vs `sildenafil -> viagra`). The function DROPS
-- ambiguous keys, so that union would have turned five correctly-linking keys
-- into silently-dropped ones. None of the five appears in `events.tags` today,
-- so nothing would have broken yet — which is exactly why it is worth closing
-- now rather than after it does.
--
-- So an alias is used only where the tag map has no entry for that key at all,
-- and only where the approved aliases agree on a single tag. Measured with this
-- rule: ambiguous keys 14 -> 14 (unchanged), 396 alias keys added, 84 new event
-- links. The 84 is not the point — the point is that approving an alias now has
-- an effect, so the German residue becomes linkable as it is reviewed.
--
-- Everything else is unchanged: the pair work-list from 20261207163000 (the
-- list is its own cursor), the batch cap, the bounded usage_count update from
-- 20261210100000, and the `ambiguous_keys` return value, which still reports
-- ambiguity in the TAG map only so its meaning does not silently change.

create or replace function public.run_event_tag_link(p_batch integer default 2000)
returns table(events_scanned integer, links_created integer, ambiguous_keys integer, tags_recounted integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_scanned int := 0; v_created int := 0; v_amb int := 0; v_recount int := 0;
  v_tag_ids uuid[];
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'job:event_tag_link', true);

  -- `on commit drop` drops these at COMMIT, not at function exit, so a second
  -- call inside one transaction hits 42P07. The seed block below loops in a
  -- single transaction, so this is load-bearing exactly when there is a backlog.
  drop table if exists _raw, _amb, _map, _todo;

  -- Small side, built once. `distinct` because a tag whose slug and name
  -- normalize to the same string would otherwise appear twice.
  create temp table _raw on commit drop as
    select lower(btrim(k)) as key, u.id as tag_id
      from unified_tags u, lateral (values (u.slug), (u.name)) v(k)
     where u.status = 'active' and u.merged_into_id is null and btrim(k) <> '';

  -- Ambiguity is still measured over the TAG map alone. Aliases cannot create
  -- an ambiguous key, because they are only consulted for keys the tag map does
  -- not have, and only when they agree on one tag.
  create temp table _amb on commit drop as
    select key from _raw group by key having count(distinct tag_id) > 1;
  select count(*) into v_amb from _amb;

  create temp table _map on commit drop as
    select distinct r.key, r.tag_id
      from _raw r
     where not exists (select 1 from _amb a where a.key = r.key)
    union
    -- `(array_agg(...))[1]` rather than `max()`: there is no max(uuid) in
    -- Postgres, and the HAVING below already guarantees exactly one distinct
    -- tag_id per key, so any element of the aggregate is the element.
    select al.key, (array_agg(distinct al.tag_id))[1]
      from (
        select lower(btrim(x.alias_name)) as key, x.canonical_tag_id as tag_id
          from tag_aliases x
          join unified_tags u2 on u2.id = x.canonical_tag_id
         where x.review_status = 'approved'
           and u2.status = 'active' and u2.merged_into_id is null
           and btrim(x.alias_name) <> ''
      ) al
     where not exists (select 1 from _raw r2 where r2.key = al.key)
     group by al.key
    having count(distinct al.tag_id) = 1;
  create index on _map(key);
  analyze _map;

  -- The work-list is the MISSING PAIRS, not the unprocessed events. Inserting a
  -- pair is what removes it from this list, so the list is its own cursor: no
  -- watermark, no scan marker, and no column on `events`. An event whose strings
  -- all resolve to nothing (or only to ambiguous keys) contributes no rows at
  -- all, so it can never accumulate into a wall the way it did under the
  -- event-level anti-join.
  create temp table _todo on commit drop as
    select w.entity_id, w.tag_id
      from (
        select distinct e.id as entity_id, m.tag_id
          from events e
          cross join lateral unnest(e.tags) as t
          join _map m on m.key = lower(btrim(t))
         where coalesce(array_length(e.tags, 1), 0) > 0
      ) w
     where not exists (
       select 1 from unified_tag_assignments a
        where a.entity_id = w.entity_id
          and a.tag_id = w.tag_id
          and a.entity_type = 'event')
     order by w.entity_id, w.tag_id
     limit greatest(p_batch, 0);

  select count(distinct entity_id) into v_scanned from _todo;
  if v_scanned = 0 then
    events_scanned := 0; links_created := 0; ambiguous_keys := v_amb; tags_recounted := 0;
    return next; return;
  end if;

  with ins as (
    insert into unified_tag_assignments (tag_id, entity_id, entity_type)
    select d.tag_id, d.entity_id, 'event' from _todo d
    on conflict (tag_id, entity_id, entity_type) do nothing
    returning tag_id
  )
  select count(*)::int, array_agg(distinct tag_id) into v_created, v_tag_ids from ins;

  -- usage_count is the ASSIGNMENT count — same quantity the nightly
  -- recount_all_tag_usage maintains. `recount_unified_tag_usage_for` computes a
  -- different, lossier number (three arrays, no events) and was overwriting this
  -- column with it on every batch. Bounded to the tags this batch touched, and
  -- skipping rows whose value would not change, so the audit + search triggers on
  -- unified_tags only fire where there is a real delta.
  if v_tag_ids is not null and array_length(v_tag_ids, 1) > 0 then
    update unified_tags u
       set usage_count = coalesce(
             (select count(*)::int from unified_tag_assignments a where a.tag_id = u.id), 0),
           updated_at = now()
     where u.id = any(v_tag_ids)
       and u.usage_count is distinct from coalesce(
             (select count(*)::int from unified_tag_assignments a where a.tag_id = u.id), 0);
    get diagnostics v_recount = row_count;
  end if;

  events_scanned := v_scanned; links_created := coalesce(v_created, 0);
  ambiguous_keys := v_amb; tags_recounted := v_recount;
  return next;
end;
$function$;

do $verify$
declare
  v_amb_before int;
  v_amb_after  int;
  v_alias_keys int;
  v_bad        int;
begin
  -- 1. Aliases must not introduce ambiguity. Compare the tag-map-only ambiguity
  --    against the ambiguity of the map this function now builds.
  select count(*) into v_amb_before from (
    select lower(btrim(k)) as key
      from unified_tags u, lateral (values (u.slug),(u.name)) v(k)
     where u.status='active' and u.merged_into_id is null and btrim(k) <> ''
     group by 1 having count(distinct u.id) > 1) a;

  select count(*) into v_amb_after from (
    select key from (
      select lower(btrim(k)) as key, u.id as tag_id
        from unified_tags u, lateral (values (u.slug),(u.name)) v(k)
       where u.status='active' and u.merged_into_id is null and btrim(k) <> ''
      union all
      select al.key, al.tag_id from (
        select lower(btrim(x.alias_name)) as key, x.canonical_tag_id as tag_id
          from tag_aliases x join unified_tags u2 on u2.id = x.canonical_tag_id
         where x.review_status='approved' and u2.status='active'
           and u2.merged_into_id is null and btrim(x.alias_name) <> ''
      ) al
      where not exists (
        select 1 from unified_tags u3, lateral (values (u3.slug),(u3.name)) v3(k3)
         where u3.status='active' and u3.merged_into_id is null
           and lower(btrim(k3)) = al.key)
    ) m group by key having count(distinct tag_id) > 1) b;

  if v_amb_after > v_amb_before then
    raise exception 'alias linking: aliases introduced % new ambiguous key(s) — gap-fill rule is not holding',
      v_amb_after - v_amb_before;
  end if;

  -- 2. The alias source must actually be reachable. A gap-fill that resolves to
  --    zero keys would make this migration a no-op that still reads as shipped —
  --    the exact failure this is repairing.
  select count(distinct al.key) into v_alias_keys from (
    select lower(btrim(x.alias_name)) as key
      from tag_aliases x join unified_tags u2 on u2.id = x.canonical_tag_id
     where x.review_status='approved' and u2.status='active'
       and u2.merged_into_id is null and btrim(x.alias_name) <> ''
  ) al
  where not exists (
    select 1 from unified_tags u3, lateral (values (u3.slug),(u3.name)) v3(k3)
     where u3.status='active' and u3.merged_into_id is null
       and lower(btrim(k3)) = al.key);

  if v_alias_keys = 0 then
    raise exception 'alias linking: no approved alias contributes a key — the join is inert';
  end if;

  -- 3. The function must genuinely read tag_aliases now. Guards against a future
  --    edit silently reverting to the tag-map-only build.
  select count(*) into v_bad from pg_proc
   where proname = 'run_event_tag_link'
     and pg_get_functiondef(oid) not ilike '%tag_aliases%';
  if v_bad > 0 then
    raise exception 'alias linking: run_event_tag_link does not reference tag_aliases';
  end if;

  -- 4. `auto` aliases must NOT be consulted. This is the safety property, not a
  --    style preference — see the ausflug -> outing case in the header.
  select count(*) into v_bad from pg_proc
   where proname = 'run_event_tag_link'
     and pg_get_functiondef(oid) not ilike '%review_status%=%approved%';
  if v_bad > 0 then
    raise exception 'alias linking: the approved-only gate is missing';
  end if;
end
$verify$;
