-- Teach the lifecycle dispatchers the three newly-archivable types, give
-- countries an honest refusal, and expire delete snapshots after 30 days.
--
-- Only the branches change; the rest of archive_entity/restore_entity/
-- delete_entity is 20261019100000 verbatim.

-- ---------------------------------------------------------------------------
-- archive_entity
-- ---------------------------------------------------------------------------
create or replace function public.archive_entity(
  p_type   text,
  p_id     uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor      uuid := auth.uid();
  v_result     jsonb;
  v_n          int;
  v_prev_index boolean;
  v_dep        bigint;
begin
  perform public.assert_admin_or_internal();
  if p_id is null then
    raise exception 'p_id is required' using errcode = '22023';
  end if;

  case p_type
    -- Reuse what already exists rather than writing a second way to archive
    -- the same row. Each of these carries its own prior-state snapshot and has
    -- an exact inverse, which restore_entity below calls.
    when 'city' then
      v_result := public.archive_city_as_nonplace(p_id, coalesce(p_reason, 'admin archive'), '{}'::jsonb);
    when 'personality' then
      v_result := public.archive_personality_as_nonperson(p_id, coalesce(p_reason, 'admin archive'), '{}'::jsonb);
    when 'venue' then
      v_result := public.decide_venue_nonvenue(p_id, true, coalesce(p_reason, 'admin archive'));
    when 'event' then
      perform public._existence_apply_archive('event', p_id, coalesce(p_reason, 'admin archive'), '{}'::jsonb, v_actor);
      v_result := jsonb_build_object('archived', true);
    when 'marketplace' then
      perform public._existence_apply_archive('marketplace', p_id, coalesce(p_reason, 'admin archive'), '{}'::jsonb, v_actor);
      v_result := jsonb_build_object('archived', true);

    -- Column and CHECK already admitted the value; nothing had ever written it.
    when 'guide' then
      update public.guides set status = 'archived' where id = p_id and status <> 'archived';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('archived', v_n > 0);
    when 'milestone' then
      update public.milestones set status = 'archived', seo_indexable = false
        where id = p_id and status <> 'archived';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('archived', v_n > 0);
    when 'queer_village' then
      update public.queer_villages set shell_status = 'ghost', seo_indexable = false
        where id = p_id and shell_status is distinct from 'ghost';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('archived', v_n > 0);
    when 'organization' then
      update public.organizations set status = 'archived' where id = p_id and status <> 'archived';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('archived', v_n > 0);

    -- New in 20261024100000. These three carry `archived_at`, and RLS is what
    -- makes it bite across ~65 read call sites.
    --
    -- The pre-archive `seo_indexable` is recorded because restore MUST replay
    -- it rather than assume true: 22,019 of 45,221 news articles are already
    -- seo_indexable=false (the quality gate deindexes thin pieces), so a
    -- restore that set it true would silently re-index half the news corpus.
    when 'hotel' then
      select h.seo_indexable into v_prev_index from public.hotels h where h.id = p_id;
      update public.hotels
         set archived_at = now(), archived_reason = p_reason, seo_indexable = false
       where id = p_id and archived_at is null;
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('archived', v_n > 0, 'prev_seo_indexable', v_prev_index);
    when 'news' then
      select n.seo_indexable into v_prev_index from public.news_articles n where n.id = p_id;
      update public.news_articles
         set archived_at = now(), archived_reason = p_reason, seo_indexable = false
       where id = p_id and archived_at is null;
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('archived', v_n > 0, 'prev_seo_indexable', v_prev_index);
    when 'group' then
      -- community_groups has no seo_indexable; it is not a crawlable surface.
      update public.community_groups
         set archived_at = now(), archived_reason = p_reason
       where id = p_id and archived_at is null;
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('archived', v_n > 0);

    -- Countries are refused with a reason, not a shrug. See
    -- 20261024100000's header: `countries` is a parent, and hiding the row
    -- blanks the `countries(name,code)` embed on every child page while
    -- location_is_high_risk() still resolves the safety gate through it.
    when 'country' then
      select (select count(*) from public.cities  c where c.country_id = p_id)
           + (select count(*) from public.venues  v where v.country_id = p_id)
           + (select count(*) from public.events  e where e.country_id = p_id)
           + (select count(*) from public.hotels  h where h.country_id = p_id)
        into v_dep;
      raise exception
        'countries are not archivable — this one is the parent of % rows (cities/venues/events/hotels), which would keep pointing at a hidden parent. Use seo_indexable to drop a thin country page from the index, or shell_status to mark it a territory.',
        v_dep
        using errcode = '22023';

    else
      raise exception 'unsupported_type: % cannot express an archived state — see the header of 20261019100000', p_type
        using errcode = '22023';
  end case;

  insert into public.admin_lifecycle_audit (entity_type, entity_id, action, actor, reason, details)
  values (p_type, p_id, 'archive', v_actor, p_reason, coalesce(v_result, '{}'::jsonb));

  return coalesce(v_result, jsonb_build_object('archived', true));
end; $function$;

-- ---------------------------------------------------------------------------
-- restore_entity
-- ---------------------------------------------------------------------------
create or replace function public.restore_entity(p_type text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor      uuid := auth.uid();
  v_result     jsonb;
  v_n          int;
  v_prev_index boolean;
begin
  perform public.assert_admin_or_internal();
  if p_id is null then
    raise exception 'p_id is required' using errcode = '22023';
  end if;

  case p_type
    when 'city' then
      v_result := public.unarchive_city(p_id);
    when 'personality' then
      v_result := jsonb_build_object('restored', public.unarchive_personality(p_id));
    when 'venue' then
      v_result := public.restore_venue_from_nonvenue(p_id);
    when 'event' then
      v_result := jsonb_build_object('restored', public._existence_apply_reopen('event', p_id, v_actor));
    when 'marketplace' then
      v_result := jsonb_build_object('restored', public._existence_apply_reopen('marketplace', p_id, v_actor));

    -- These restore to a NON-published state on purpose. An archived row that
    -- comes back straight to 'published' skips whatever review put it there,
    -- and the reason it was archived is rarely "this was fine all along".
    when 'guide' then
      update public.guides set status = 'draft' where id = p_id and status = 'archived';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('restored', v_n > 0, 'status', 'draft');
    when 'milestone' then
      update public.milestones set status = 'draft' where id = p_id and status = 'archived';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('restored', v_n > 0, 'status', 'draft');
    when 'queer_village' then
      -- seo_indexable is left false: run_village_trust_recompute owns that
      -- column and will restore it on the next nightly pass if the village has
      -- real content. Setting it true here would re-index a still-empty
      -- village and fight the engine.
      update public.queer_villages set shell_status = 'real' where id = p_id and shell_status = 'ghost';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('restored', v_n > 0, 'seo_indexable', 'left to run_village_trust_recompute');
    when 'organization' then
      update public.organizations set status = 'active' where id = p_id and status = 'archived';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('restored', v_n > 0);

    -- Replay the seo_indexable this row had BEFORE it was archived. Unlike
    -- villages there is no nightly engine that owns the column for hotels and
    -- news, so leaving it false would make archive a one-way door for the
    -- page's indexability; and defaulting it true would re-index the 22k news
    -- rows the quality gate deliberately deindexed. coalesce(..., true) covers
    -- a row archived before this migration existed, which has no recorded
    -- prior value — true is that column's own default.
    when 'hotel' then
      select (a.details->>'prev_seo_indexable')::boolean into v_prev_index
        from public.admin_lifecycle_audit a
       where a.entity_type = 'hotel' and a.entity_id = p_id and a.action = 'archive'
       order by a.created_at desc limit 1;
      update public.hotels
         set archived_at = null, archived_reason = null,
             seo_indexable = coalesce(v_prev_index, true)
       where id = p_id and archived_at is not null;
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('restored', v_n > 0, 'seo_indexable', coalesce(v_prev_index, true));
    when 'news' then
      select (a.details->>'prev_seo_indexable')::boolean into v_prev_index
        from public.admin_lifecycle_audit a
       where a.entity_type = 'news' and a.entity_id = p_id and a.action = 'archive'
       order by a.created_at desc limit 1;
      update public.news_articles
         set archived_at = null, archived_reason = null,
             seo_indexable = coalesce(v_prev_index, true)
       where id = p_id and archived_at is not null;
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('restored', v_n > 0, 'seo_indexable', coalesce(v_prev_index, true));
    when 'group' then
      update public.community_groups
         set archived_at = null, archived_reason = null
       where id = p_id and archived_at is not null;
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('restored', v_n > 0);

    else
      raise exception 'unsupported_type: %', p_type using errcode = '22023';
  end case;

  insert into public.admin_lifecycle_audit (entity_type, entity_id, action, actor, reason, details)
  values (p_type, p_id, 'restore', v_actor, null, coalesce(v_result, '{}'::jsonb));

  return coalesce(v_result, jsonb_build_object('restored', true));
end; $function$;

-- ---------------------------------------------------------------------------
-- delete_entity — countries join tags and users as an explicit carve-out.
--
-- The generic path snapshots one row and deletes it. For a country that leaves
-- 5,757 cities / 30,887 venues / 48,741 events carrying a country_id that
-- resolves to nothing — and `cities.id` already taught this lesson: after the
-- Geo P2 flips, most of those FKs are gone, so the delete neither cascades nor
-- errors, it silently dangles.
-- ---------------------------------------------------------------------------
create or replace function public.delete_entity(
  p_type   text,
  p_id     uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor  uuid := auth.uid();
  v_table  text;
  v_row    jsonb;
  v_n      int;
begin
  perform public.assert_admin_or_internal();
  if p_id is null then
    raise exception 'p_id is required' using errcode = '22023';
  end if;

  if p_type = 'tag' then
    raise exception 'use admin_delete_tag() for tags — it refuses when the tag is still in use'
      using errcode = '22023';
  end if;
  if p_type = 'user' then
    raise exception 'use admin_delete_user() for accounts' using errcode = '22023';
  end if;
  if p_type = 'country' then
    raise exception 'countries cannot be deleted here — cities, venues, events and hotels reference them by an id with no FK to stop this, so the delete would dangle silently rather than fail'
      using errcode = '22023';
  end if;

  v_table := case p_type
    when 'venue' then 'venues'
    when 'event' then 'events'
    when 'city' then 'cities'
    when 'personality' then 'personalities'
    when 'marketplace' then 'marketplace_listings'
    when 'hotel' then 'hotels'
    when 'organization' then 'organizations'
    when 'news' then 'news_articles'
    when 'milestone' then 'milestones'
    when 'guide' then 'guides'
    when 'queer_village' then 'queer_villages'
    when 'group' then 'community_groups'
    else null
  end;

  if v_table is null then
    raise exception 'unsupported_type: %', p_type using errcode = '22023';
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
    into v_row using p_id;
  if v_row is null then
    raise exception 'no % with id %', p_type, p_id using errcode = 'P0002';
  end if;

  -- Audit BEFORE the delete. If the delete then fails on a foreign key the
  -- transaction rolls the audit row back with it, so the log cannot claim a
  -- deletion that did not happen — and if it succeeds, the snapshot is
  -- guaranteed to exist rather than depending on a second statement.
  insert into public.admin_lifecycle_audit (entity_type, entity_id, action, actor, reason, row_snapshot, details)
  values (p_type, p_id, 'delete', v_actor, p_reason, v_row,
          jsonb_build_object('table', v_table));

  execute format('delete from public.%I where id = $1', v_table) using p_id;
  get diagnostics v_n = row_count;

  return jsonb_build_object('deleted', v_n > 0, 'type', p_type, 'id', p_id);
end; $function$;

-- ---------------------------------------------------------------------------
-- Snapshot retention.
--
-- The admin UI promises a 30-day restore window and nothing enforced it, so
-- whole-row copies of every deleted venue, listing and article would have
-- accumulated forever on a disk-constrained instance — including whatever
-- personal data a `community_groups` row or an authored record happens to
-- carry.
--
-- It expires the SNAPSHOT, not the audit row: who deleted what and why is a
-- permanent record, the recovery payload is the part with a shelf life. That
-- is also why this cannot be a plain DELETE.
-- ---------------------------------------------------------------------------
create or replace function public.prune_admin_lifecycle_snapshots(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_days int := greatest(1, coalesce(p_days, 30));
  v_n    int;
begin
  update public.admin_lifecycle_audit
     set row_snapshot = null,
         details = coalesce(details, '{}'::jsonb)
                   || jsonb_build_object('snapshot_expired_at', now(), 'retention_days', v_days)
   where row_snapshot is not null
     and created_at < now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;

  return jsonb_build_object('expired', v_n, 'retention_days', v_days, 'ran_at', now());
end; $function$;

revoke all on function public.prune_admin_lifecycle_snapshots(integer) from public, anon;
grant execute on function public.prune_admin_lifecycle_snapshots(integer) to service_role;

comment on function public.prune_admin_lifecycle_snapshots(integer) is
  'Nulls admin_lifecycle_audit.row_snapshot past the retention window, keeping the audit row itself permanently. Enforces the 30-day Trash promise the admin UI makes.';

-- Registry row first, then the cron — the registry is the record of record and
-- a retirement disables the row rather than deleting it. Pure-SQL command
-- (family C), so it needs no run_begin wrapper: the projector records it from
-- cron.job_run_details. Shape mirrors the sibling `admin_automation_runs_purge`.
insert into public.admin_automations (slug, name, description, trigger, action, schedule, enabled, managed_by)
values (
  'admin_lifecycle_snapshot_purge',
  'Expire admin Trash snapshots',
  'Nulls admin_lifecycle_audit.row_snapshot older than 30 days. The audit row (who/what/why) is kept forever; only the restorable copy expires.',
  jsonb_build_object('type', 'schedule'),
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'admin_lifecycle_snapshot_purge',
    'command', 'SELECT public.prune_admin_lifecycle_snapshots(30);'
  ),
  '45 2 * * *',
  true,
  'system'
)
on conflict (slug) do update
  set enabled = true,
      schedule = excluded.schedule,
      action = excluded.action,
      description = excluded.description;

select cron.schedule(
  'admin_lifecycle_snapshot_purge',
  '45 2 * * *',
  'SELECT public.prune_admin_lifecycle_snapshots(30);'
);
