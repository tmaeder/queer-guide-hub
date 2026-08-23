-- Tag DQ Phase 4 — connect events to the unified tag system.
--
-- `events` was the one content type entirely outside it: 35,131 events carry a
-- free-text `tags[]` array and `unified_tag_assignments` held ZERO rows with
-- entity_type='event'. Every other type (news 58k, venues 42k, marketplace 37k,
-- personality 3k, hotel 766) is linked; events were not linked at all.
--
-- 20260921110000 recorded this as a scope marker rather than fixing it, on the
-- grounds that the 363 unresolved strings need Phase 1.3's hand review. That is
-- still true for the 363. It is NOT true for the strings that already resolve
-- exactly to a curated, active, canonical tag — those need no judgement, only a
-- join, and they are the majority of the volume.
--
-- ## Why the first attempt at measuring this timed out
--
-- The obvious query joins `unnest(events.tags)` against
-- `lower(unified_tags.slug)`/`lower(name)` directly. There is no functional
-- index on either, so it seq-scans the tag table per string across 35k events
-- and dies at the 2-minute statement timeout. The shape that works builds a
-- 5,640-row keyed temp map ONCE and hash-joins against it; that completes in
-- seconds. Same trick as `tag_medical_codes_sync`'s `_ent` table: parse/scan the
-- small side once, not once per pair.
--
-- ## The ambiguity guard is load-bearing
--
-- Measured: 9 keys resolve to MORE than one active canonical tag —
-- denim, gym, lace, leather, metal, rubber, spandex (the deliberate mat-*
-- sense splits kept by 20260916110000), `mavie hörbiger` (a person twin), and
-- `pride`, which matches BOTH news-pride and occ-pride.
--
-- Without the guard, all 7,373 `pride` events would be linked to two different
-- tags at once, and every leather event to both `leather` and `mat-leather`.
-- 14,750 of the 75,401 candidate pairs are ambiguous — 20% of the volume,
-- concentrated on the single highest-traffic key. They are BLOCKED, not guessed:
-- CLAUDE.md's rule from the same-name city collisions is that you never resolve
-- by name alone when the reference table cannot express the ambiguity. A missing
-- link is recoverable; a wrong one is not.
--
-- Net: 60,651 pairs across the unambiguous keys.
--
-- No search storm: `unified_tag_assignments` carries only the entity_type
-- normalizer trigger (20260916113000), no search sync. The usage recount is the
-- part that touches `unified_tags`, so it is bounded to the tags this batch
-- actually changed.

create or replace function public.run_event_tag_link(p_batch int default 2000)
returns table (events_scanned int, links_created int, ambiguous_keys int, tags_recounted int)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_scanned int := 0; v_created int := 0; v_amb int := 0; v_recount int := 0;
  v_tag_ids uuid[];
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'job:event_tag_link', true);

  -- `on commit drop` drops at COMMIT, not at RETURN, so a SECOND call inside
  -- one transaction finds the tables still standing and dies with 42P07
  -- "relation _raw already exists". The cron never hits it — each tick is its
  -- own transaction — but the seed block at the bottom of this migration loops
  -- up to three times, so it aborted on pass 2, and because a failed statement
  -- aborts the whole `db push`, EVERY migration queued behind this one stopped
  -- reaching prod as well.
  drop table if exists _raw, _amb, _map, _batch;

  -- Small side, built once. `distinct` because a tag whose slug and name
  -- normalize to the same string would otherwise appear twice.
  create temp table _raw on commit drop as
    select lower(btrim(k)) as key, u.id as tag_id
      from unified_tags u, lateral (values (u.slug), (u.name)) v(k)
     where u.status = 'active' and u.merged_into_id is null and btrim(k) <> '';

  create temp table _amb on commit drop as
    select key from _raw group by key having count(distinct tag_id) > 1;
  select count(*) into v_amb from _amb;

  create temp table _map on commit drop as
    select distinct r.key, r.tag_id from _raw r
     where not exists (select 1 from _amb a where a.key = r.key);
  create index on _map(key);
  analyze _map;

  -- Resume by absence: an event with no event-type assignment has not been
  -- processed. Cheap via idx_unified_tag_assignments_entity, and it needs no
  -- new column on `events` — which matters, because every write to that table
  -- costs a search reindex (13.8s per 300 rows, per 20260807100000).
  create temp table _batch on commit drop as
    select e.id, e.tags
      from events e
     where coalesce(array_length(e.tags, 1), 0) > 0
       and not exists (
         select 1 from unified_tag_assignments a
          where a.entity_id = e.id and a.entity_type = 'event')
     order by e.id
     limit greatest(p_batch, 0);
  select count(*) into v_scanned from _batch;
  if v_scanned = 0 then
    events_scanned := 0; links_created := 0; ambiguous_keys := v_amb; tags_recounted := 0;
    return next; return;
  end if;

  with pairs as (
    select distinct b.id as entity_id, m.tag_id
      from _batch b, unnest(b.tags) t
      join _map m on m.key = lower(btrim(t))
  ), ins as (
    insert into unified_tag_assignments (tag_id, entity_id, entity_type)
    select p.tag_id, p.entity_id, 'event' from pairs p
    on conflict (tag_id, entity_id, entity_type) do nothing
    returning tag_id
  )
  select count(*)::int, array_agg(distinct tag_id) into v_created, v_tag_ids from ins;

  -- Only the tags this batch actually touched. A blanket recount would rewrite
  -- usage_count on all 2,820 active tags and drag the audit + search triggers
  -- on unified_tags along with it.
  if v_tag_ids is not null and array_length(v_tag_ids, 1) > 0 then
    perform recount_unified_tag_usage_for(v_tag_ids);
    v_recount := array_length(v_tag_ids, 1);
  end if;

  events_scanned := v_scanned; links_created := coalesce(v_created, 0);
  ambiguous_keys := v_amb; tags_recounted := v_recount;
  return next;
end;
$fn$;

comment on function public.run_event_tag_link(int) is
  'Links events.tags[] free text to unified_tag_assignments where the string resolves EXACTLY to one active canonical tag. Keys matching more than one tag (pride -> news-pride/occ-pride, leather -> leather/mat-leather, ...) are blocked, never guessed. Resumes by absence of an event-type assignment; adds no column to events, because writes there cost a search reindex.';

revoke all on function public.run_event_tag_link(int) from public, anon;
grant execute on function public.run_event_tag_link(int) to authenticated, service_role;

-- Registry row FIRST — admin_automations is the record of record and
-- sync_automations_to_cron() recreates any enabled row whose job is missing.
-- Retiring this means disabling the row, never deleting it.
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('event_tag_link', 'Event tag link',
        'Every 10 min: links events.tags[] strings that resolve to exactly one active canonical tag into unified_tag_assignments. Ambiguous keys are blocked. Drains the 35,131-event backlog, then costs one anti-join per run.',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"run_event_tag_link"}'::jsonb, '*/10 * * * *')
on conflict (slug) do update set schedule = excluded.schedule, enabled = excluded.enabled,
  description = excluded.description, name = excluded.name, action = excluded.action,
  trigger = excluded.trigger;

select cron.schedule('event_tag_link', '*/10 * * * *',
  $cron$ select public.run_event_tag_link(2000); $cron$);

-- Seed the drain rather than waiting 10 minutes for the first tick. ONE pass,
-- not three: every call in this block shares the migration's single
-- transaction, and the drop guard above is the only thing that makes a repeat
-- call survive at all. Keeping the seed to one pass means the guard never has
-- to work here — it is insurance for a future caller, not the mechanism — so
-- this migration cannot be re-broken by a plpgsql plan-cache subtlety in a
-- code path nobody can rehearse before `db push` runs it against prod. The
-- cost is that the 35,131-event backlog starts draining 20 minutes later on a
-- job that runs every 10 minutes.
do $$
declare r record;
begin
  select * into r from public.run_event_tag_link(2000);
  raise notice 'event tag link seed: % events scanned, % links created', r.events_scanned, r.links_created;
end $$;

-- Coverage counter, so the remaining backlog is visible rather than assumed
-- drained. Replaces the Phase 4 scope marker's silence with a number that goes
-- to zero on its own.
create or replace function public.tag_hygiene_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare v jsonb;
begin
  perform assert_admin_or_internal();

  with active as (
    select * from unified_tags where status = 'active' and merged_into_id is null
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'active_tags', (select count(*) from active),
      'categories',  (select count(*) from tag_categories),
      'assignments', (select count(*) from unified_tag_assignments)
    ),
    'uncategorized_active', (
      select count(*) from active where category_id is null
        and slug !~ '^(mat|vibe|occ|dept|attr|own|rating)-'),
    'dangling_category_id', (
      select count(*) from unified_tags u where u.category_id is not null
        and not exists (select 1 from tag_categories c where c.id = u.category_id)),
    'image_without_license', (
      select count(*) from active where image_url is not null and image_license is null),
    'commons_image_without_license', (
      select count(*) from active
       where image_url like 'https://upload.wikimedia.org/%' and image_license is null),
    'image_alt_column_empty', (
      select count(*) from active where image_url is not null
        and nullif(btrim(image_alt), '') is null),
    'assignment_to_non_active_tag', (
      select count(*) from unified_tag_assignments a
       where not exists (select 1 from active t where t.id = a.tag_id)),
    'nonclean_entity_type', (
      select count(*) from unified_tag_assignments
       where entity_type <> lower(btrim(entity_type))),
    'duplicate_active_name', (
      select count(*) from (
        select 1 from active group by lower(btrim(name)) having count(*) > 1) d),
    'redirect_to_non_canonical', (
      select count(*) from tag_slug_redirects r
        join unified_tags t on t.id = r.tag_id
       where t.status <> 'active' or t.merged_into_id is not null),
    'merged_but_not_status_merged', (
      select count(*) from unified_tags
       where merged_into_id is not null and status <> 'merged'),
    'sensitive_without_description', (
      select count(*) from active
       where (is_sensitive or is_adult)
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    'indexable_without_description', (
      select count(*) from active
       where seo_indexable
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    'event_tag_strings_unresolved', (
      select count(*) from (
        select distinct lower(btrim(t)) as s
          from events, unnest(coalesce(tags, '{}'::text[])) t
         where btrim(t) <> ''
      ) e
      where not exists (
        select 1 from unified_tags u
         where lower(u.name) = e.s or lower(u.slug) = e.s)),
    -- Drains to 0 as the cron works through the backlog. Non-zero after that
    -- means the job stopped running.
    'events_with_tags_unlinked', (
      select count(*) from events e
       where coalesce(array_length(e.tags, 1), 0) > 0
         and not exists (
           select 1 from unified_tag_assignments a
            where a.entity_id = e.id and a.entity_type = 'event'))
  ) into v;

  return v;
end;
$fn$;
