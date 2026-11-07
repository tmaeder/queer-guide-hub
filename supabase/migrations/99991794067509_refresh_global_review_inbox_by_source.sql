begin;
set local lock_timeout = '3s';

-- Record one invalidation per source and writing transaction. Separate
-- transactions never contend for a shared per-source counter.
create table api_private.review_inbox_dirty (
  source_key text not null,
  transaction_id xid8 not null,
  primary key (source_key, transaction_id)
);
create table api_private.review_inbox_tracked_sources (
  source_key text primary key,
  dependency_stamp text not null
);
create table api_private.review_inbox_source_state (
  source_key text primary key,
  signature text not null,
  refreshed_at timestamptz not null,
  next_sla_at timestamptz
);
create table api_private.review_inbox_source_top (
  like public.admin_review_queue_top including defaults,
  source_key text not null references api_private.review_inbox_source_state(source_key) on delete cascade,
  confidence_score numeric,
  overdue boolean,
  primary key (source_key, scope, sort, rank)
);
create index review_inbox_source_top_scope_sort on api_private.review_inbox_source_top(scope, sort);

alter table api_private.review_inbox_dirty enable row level security;
alter table api_private.review_inbox_tracked_sources enable row level security;
alter table api_private.review_inbox_source_state enable row level security;
alter table api_private.review_inbox_source_top enable row level security;
revoke all on api_private.review_inbox_dirty, api_private.review_inbox_tracked_sources,
  api_private.review_inbox_source_state, api_private.review_inbox_source_top
  from public, anon, authenticated, service_role;

create function api_private.review_inbox_dependencies(p_view oid)
returns setof oid language sql stable set search_path = '' as $$
  with recursive relations(relation_id) as (
    select p_view
    union
    select d.refobjid
    from relations x
    join pg_rewrite r on r.ev_class = x.relation_id
    join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid
      and d.refclassid = 'pg_class'::regclass and d.refobjid <> x.relation_id
  )
  select relation_id from relations;
$$;

create function api_private.review_inbox_dependency_stamp(p_view oid)
returns table(stamp text, trackable boolean)
language sql stable set search_path = '' as $$
  with definitions as (
    select c.oid, c.relkind, case when c.relkind = 'v' then pg_get_viewdef(c.oid) end as body
    from api_private.review_inbox_dependencies(p_view) x(oid)
    join pg_class c on c.oid = x.oid
  )
  select md5(string_agg(oid::text || ':' || coalesce(body, ''), '|' order by oid)),
    coalesce(bool_or(relkind = 'r'), false) and bool_and(
      relkind in ('r', 'v')
      and not exists (select 1 from pg_inherits i where i.inhparent = definitions.oid or i.inhrelid = definitions.oid)
      and (
        body is null or (
          body !~* '\m(now|current_date|current_timestamp|current_time|clock_timestamp|statement_timestamp|transaction_timestamp|localtimestamp|localtime|timeofday|random|age)\M'
          and not exists (
            select 1 from pg_rewrite r
            join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid
            where r.ev_class = definitions.oid and d.refclassid = 'pg_proc'::regclass
          )
        )
      )
    )
  from definitions;
$$;
revoke all on function api_private.review_inbox_dependencies(oid),
  api_private.review_inbox_dependency_stamp(oid) from public, anon, authenticated;

create function api_private.mark_review_inbox_dirty()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into api_private.review_inbox_dirty(source_key, transaction_id)
  select source_key, pg_current_xact_id() from unnest(tg_argv[0]::text[]) x(source_key)
  on conflict do nothing;
  return null;
end
$$;
revoke all on function api_private.mark_review_inbox_dirty() from public, anon, authenticated;

-- Freeze the dependencies covered by these triggers. A new source or changed
-- view definition falls back to rebuilding every tick until tracked explicitly.
insert into api_private.review_inbox_tracked_sources(source_key, dependency_stamp)
select r.queue_key, d.stamp
from public.admin_review_sources r
cross join lateral api_private.review_inbox_dependency_stamp(
  to_regclass(format('public.%I', r.view_name))
) d
where r.active and d.trackable;

do $install$
declare
  v_relation record;
begin
  for v_relation in
    select c.oid::regclass as relation, array_agg(distinct r.queue_key order by r.queue_key) sources
    from api_private.review_inbox_tracked_sources t
    join public.admin_review_sources r on r.queue_key = t.source_key
    cross join lateral api_private.review_inbox_dependencies(to_regclass(format('public.%I', r.view_name))) d(oid)
    join pg_class c on c.oid = d.oid and c.relkind = 'r'
    group by c.oid order by c.oid
  loop
    execute format(
      'create trigger mark_review_inbox_dirty after insert or update or delete or truncate on %s '
      'for each statement execute function api_private.mark_review_inbox_dirty(%L)',
      v_relation.relation, v_relation.sources
    );
  end loop;
end
$install$;

create function public.refresh_admin_review_queue_top_if_changed()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_source record;
  v_state api_private.review_inbox_source_state%rowtype;
  v_source_sql text;
  v_union text;
  v_signature text;
  v_codes_signature text;
  v_dirty text[];
  v_next_sla_at timestamptz;
  v_as_of timestamptz := now();
  v_started timestamptz := clock_timestamp();
  v_depth integer := public.admin_review_queue_top_depth();
  v_refreshed integer := 0;
  v_reused integer := 0;
  v_removed integer;
  v_rows integer;
  v_full_after_cache boolean;
  -- Both stages must apply the same total order. A row below the per-source
  -- cutoff already has N rows ahead of it in the global order.
  v_order constant text :=
    'case when o.sort=''priority'' then t.urgency_rank else 0 end desc, '
    'case when o.sort=''priority'' then t.overdue else false end desc, '
    'case when o.sort=''priority'' then t.priority_weight else 0 end desc, '
    'case when o.sort=''confidence'' then t.confidence_score end asc nulls last, '
    't.created_at asc nulls last, t.queue_type, t.id';
begin
  if not pg_try_advisory_xact_lock(hashtext('admin_review_queue_top')) then
    return jsonb_build_object('ok', true, 'skipped', 'another refresh holds the lock');
  end if;
  if not exists (select 1 from public.admin_review_sources where active) then
    return jsonb_build_object('ok', false, 'reason', 'no active review sources');
  end if;

  -- A manual full refresh may have repaired an invalidation we missed. Rebuild
  -- the slices before they can replace a newer full snapshot.
  select coalesce(
    (select max(computed_at) from public.admin_review_queue_top) >
    (select max(refreshed_at) from api_private.review_inbox_source_state), false
  ) into v_full_after_cache;

  -- Delete only the visible invalidations. A concurrent writer commits a
  -- different transaction ID for the next tick. Failure rolls these deletes back.
  with consumed as (
    delete from api_private.review_inbox_dirty returning source_key
  )
  select coalesce(array_agg(distinct source_key), '{}'::text[]) into v_dirty from consumed;

  delete from api_private.review_inbox_source_state s
  where not exists (select 1 from public.admin_review_sources r where r.active and r.queue_key = s.source_key);
  get diagnostics v_removed = row_count;

  select md5(coalesce(jsonb_agg(to_jsonb(f) order by f.queue_key, f.subtitle_match)::text, '[]'))
  into v_codes_signature from public.admin_review_finding_codes f;

  for v_source in select r.* from public.admin_review_sources r where r.active order by r.queue_key loop
    v_source_sql := format(
      'select u.id,u.queue_type,u.content_type,u.title,u.subtitle,u.created_at,u.confidence_score,'
      ' case u.risk_flags->>''severity'' when ''critical'' then 4 when ''high'' then 3'
      ' else case coalesce(u.risk_flags->>''risk'',%L) when ''safety'' then 2'
      ' when ''integrity'' then 1 else 0 end end urgency_rank,'
      ' %L::text source_label,coalesce(u.risk_flags->>''risk'',%L)::text risk,'
      ' %L::boolean public_impact,%L::integer sla_hours,%L::integer priority_weight,'
      ' %L::boolean can_reopen from public.%I u',
      v_source.risk, v_source.label, v_source.risk, v_source.public_impact,
      v_source.sla_hours, v_source.priority_weight, v_source.can_reopen, v_source.view_name
    );
    v_union := concat_ws(' union all ', v_union, v_source_sql);
    v_signature := md5(to_jsonb(v_source)::text || ':' || v_depth || ':' || v_codes_signature);

    select s.* into v_state from api_private.review_inbox_source_state s
    where s.source_key = v_source.queue_key;

    if not v_full_after_cache and v_state.signature = v_signature
      and not (v_source.queue_key = any(v_dirty))
      and (v_state.next_sla_at is null or v_state.next_sla_at > v_as_of)
      and v_state.refreshed_at + make_interval(mins => 10 + get_byte(decode(md5(v_source.queue_key), 'hex'), 0) % 5) > v_as_of
      and exists (
        select 1 from api_private.review_inbox_tracked_sources t
        cross join lateral api_private.review_inbox_dependency_stamp(to_regclass(format('public.%I', v_source.view_name))) d
        where t.source_key = v_source.queue_key and d.trackable and d.stamp = t.dependency_stamp
      ) then
      v_reused := v_reused + 1;
      continue;
    end if;

    insert into api_private.review_inbox_source_state(source_key, signature, refreshed_at)
    values (v_source.queue_key, v_signature, v_as_of)
    on conflict (source_key) do update set signature = excluded.signature, refreshed_at = excluded.refreshed_at;

    delete from api_private.review_inbox_source_top where source_key = v_source.queue_key;
    execute format($q$
      with authorized as materialized (
        select a.*, a.created_at + make_interval(hours => a.sla_hours) as sla_at,
          a.sla_hours is not null and a.created_at < $3 - make_interval(hours => a.sla_hours) as overdue,
          (f.queue_key is not null) as is_finding
        from (%1$s) a
        left join public.admin_review_finding_codes f on f.queue_key = a.queue_type and f.subtitle_match = a.subtitle
      ), saved as (
        insert into api_private.review_inbox_source_top
          (source_key, scope, sort, rank, queue_type, id, urgency_rank, source_label, risk, public_impact,
           sla_hours, priority_weight, can_reopen, is_finding, created_at, computed_at, confidence_score, overdue)
        select $1, s.scope, o.sort, r.rank, r.queue_type, r.id, r.urgency_rank, r.source_label, r.risk, r.public_impact,
               r.sla_hours, r.priority_weight, r.can_reopen, r.is_finding, r.created_at, $3, r.confidence_score, r.overdue
        from (values ('all'),('safety'),('overdue'),('public'),('decisions')) s(scope)
        cross join (values ('priority'),('age'),('confidence')) o(sort)
        cross join lateral (
          select t.*, row_number() over (order by %2$s) as rank
          from (
            select t.* from authorized t
            where case s.scope when 'all' then true when 'safety' then t.risk = 'safety'
              when 'public' then t.public_impact when 'overdue' then t.overdue else not t.is_finding end
            order by %2$s
            limit $2
          ) t
        ) r
      )
      select min(sla_at) from authorized where sla_at >= $3
    $q$, v_source_sql, v_order) into v_next_sla_at using v_source.queue_key, v_depth, v_as_of;

    update api_private.review_inbox_source_state set next_sla_at = v_next_sla_at
    where source_key = v_source.queue_key;
    v_refreshed := v_refreshed + 1;
  end loop;

  -- Retain the full-projection UNION type canary without reading source rows.
  execute 'select * from (' || v_union || ') as source_contract limit 0';

  if v_refreshed = 0 and v_removed = 0 and exists (select 1 from public.admin_review_queue_top) then
    return jsonb_build_object('ok', true, 'skipped', 'sources unchanged', 'sources_reused', v_reused);
  end if;

  delete from public.admin_review_queue_top;
  execute format($q$
    insert into public.admin_review_queue_top
      (scope, sort, rank, queue_type, id, urgency_rank, source_label, risk, public_impact,
       sla_hours, priority_weight, can_reopen, is_finding, created_at, computed_at)
    select s.scope, o.sort, r.global_rank, r.queue_type, r.id, r.urgency_rank, r.source_label, r.risk, r.public_impact,
           r.sla_hours, r.priority_weight, r.can_reopen, r.is_finding, r.created_at, $2
    from (values ('all'),('safety'),('overdue'),('public'),('decisions')) s(scope)
    cross join (values ('priority'),('age'),('confidence')) o(sort)
    cross join lateral (
      select t.*, row_number() over (order by %1$s) as global_rank
      from (
        select t.* from api_private.review_inbox_source_top t
        where t.scope = s.scope and t.sort = o.sort
        order by %1$s
        limit $1
      ) t
    ) r
  $q$, v_order) using v_depth, v_as_of;
  get diagnostics v_rows = row_count;

  return jsonb_build_object('ok', true, 'rows', v_rows, 'depth', v_depth,
    'sources_refreshed', v_refreshed, 'sources_reused', v_reused,
    'elapsed_ms', round(extract(epoch from clock_timestamp() - v_started) * 1000));
end
$$;

revoke all on function public.refresh_admin_review_queue_top_if_changed() from public, anon, authenticated;
grant execute on function public.refresh_admin_review_queue_top_if_changed() to service_role;

-- Keep the existing full refresh callable for diagnostics and recovery. Only
-- switch the existing schedule, preserving its cadence and activation state.
do $schedule$
declare
  v_job record;
begin
  select jobid, command into v_job from cron.job where jobname = 'admin_review_queue_top_refresh';
  if found then
    if btrim(v_job.command, E' \r\n\t;') <> 'select public.refresh_admin_review_queue_top()' then
      raise exception 'Review inbox refresh cron command changed';
    end if;
    perform cron.alter_job(v_job.jobid, command := 'select public.refresh_admin_review_queue_top_if_changed()');
  end if;
end
$schedule$;

commit;
