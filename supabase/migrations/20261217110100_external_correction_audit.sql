-- Before-image audit + batch rollback for automated corrections from public
-- datasets (OSM, Wikidata, GeoNames, Foursquare, Overture, …).
--
-- WHY THIS HAS TO EXIST BEFORE ANY BULK WRITE:
--
-- `unified_tags` is the ONLY table in this schema with a generic, revertible,
-- field-level audit (`tag_change_log` + `rollback_tag_change`). Everything else
-- has merge audits and provenance, and neither is a before-image:
-- `venue_consensus_audit.winning_value` records what was WRITTEN, never what it
-- replaced, and `field_provenance` records the winner. So a bad automated batch
-- against venues, cities, events or countries is unrevertible today.
--
-- That is not hypothetical here. `20261018094000` had to restore 18 tag rows
-- byte-exact after an LLM judge retracted 16 definitions and 13 of those were
-- correct — recoverable ONLY because `tag_change_log.before_data` existed. The
-- posture for this programme is auto-correct-by-default, which makes the same
-- accident cheaper to have and more likely to happen at scale.
--
-- WHAT IS NEW HERE vs `tag_change_log`: `batch_id`. No existing audit in this
-- repo can undo a RUN — they are per-row. A public-dataset refresh that goes
-- wrong goes wrong uniformly (a bad matcher, an upstream schema change), so the
-- unit of regret is the batch, and that has to be the unit of revert.

create table if not exists public.external_correction_audit (
  id            bigserial primary key,
  batch_id      uuid        not null,
  entity_type   text        not null,
  entity_id     uuid        not null,
  field         text        not null,
  -- NOT NULL on purpose. A row without a before-image cannot be rolled back,
  -- which makes it worse than useless: it looks like coverage and is not. SQL
  -- NULL (the column was empty) is recorded as the jsonb scalar 'null', so
  -- "the value was empty" and "we failed to capture the value" stay distinct.
  before_value  jsonb       not null,
  after_value   jsonb       not null,
  source        text        not null,
  -- The concordance key that justified the write. Null only for deterministic
  -- joins that need no identity (a coordinate → timezone lookup).
  external_id   text,
  confidence    numeric(3,2),
  actor         text        not null,
  reason        text,
  reverted_at   timestamptz,
  reverted_by   text,
  -- Set when a revert attempt declined to touch the row (the live value had
  -- moved on, or the row is gone). It is NOT `reverted_at` — nothing was
  -- restored — but it must take the row out of the work list all the same:
  -- with `order by id limit n`, rows that can never succeed otherwise sit at
  -- the head and are rescanned on every call, and once they outnumber the limit
  -- the drain stops making progress entirely.
  skipped_at    timestamptz,
  skip_reason   text,
  created_at    timestamptz not null default now()
);

comment on table public.external_correction_audit is
  'Before/after images of automated field corrections sourced from public datasets. '
  'batch_id groups one run so it can be reverted as a unit via '
  'rollback_external_correction_batch(). Written by enrichment jobs, never by hand.';
comment on column public.external_correction_audit.before_value is
  'jsonb ''null'' means the column was SQL NULL. NOT NULL so a missing before-image is unrepresentable.';

create index if not exists idx_eca_batch on public.external_correction_audit (batch_id);
create index if not exists idx_eca_entity on public.external_correction_audit (entity_type, entity_id);
create index if not exists idx_eca_created on public.external_correction_audit (created_at desc);
-- Powers the correction-RATE sentinel: a spike per (source, day) means the
-- upstream changed or our matcher broke, which a steady-state check cannot see.
create index if not exists idx_eca_source_created on public.external_correction_audit (source, created_at desc);

alter table public.external_correction_audit enable row level security;
revoke all on public.external_correction_audit from anon, authenticated;
grant select, insert, update on public.external_correction_audit to service_role;
grant usage, select on sequence public.external_correction_audit_id_seq to service_role;

-- Admins read it through the admin surfaces, which run as service_role; there is
-- deliberately no anon/authenticated policy.
drop policy if exists eca_service_all on public.external_correction_audit;
create policy eca_service_all on public.external_correction_audit
  for all to service_role using (true) with check (true);


-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- Resolution of (entity_type, field) → table.column REUSES `review_field_registry`,
-- which already is that map and is already migration-reviewed. A second
-- whitelist would drift from it.
--
-- `apply_mode` is deliberately IGNORED. It describes how a REVIEW APPROVAL
-- writes a value, and one of its modes is `text_array_union` — merging. A
-- rollback that merged would not restore anything; it would union the bad value
-- back in. Restoration is always a verbatim SET.
--
-- A row is skipped when the live value no longer equals what we wrote: someone
-- (or something) has changed it since, and clobbering that with an older value
-- is a second unwanted write, not a repair. Same rule as the tag wikidata
-- repair, which re-checks the live identifier and skips any row that moved.

create or replace function public.rollback_external_correction_batch(
  p_batch_id uuid,
  p_limit    integer default 300
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_actor      text := coalesce(current_setting('app.actor', true), 'admin:rollback');
  r            record;
  v_tbl        text;
  v_col        text;
  v_type       text;
  v_setexpr    text;
  v_reverted   integer := 0;
  v_moved      integer := 0;
  v_missing    text[]  := '{}';
  v_remaining  integer;
  v_rows       integer;
begin
  perform public.assert_admin_or_internal();

  if p_batch_id is null then
    raise exception 'p_batch_id is required';
  end if;
  -- Cap the write volume: venues and cities still fan out into the search
  -- reindex queue per row. The caller loops on `remaining`.
  p_limit := least(greatest(coalesce(p_limit, 300), 1), 1000);

  -- Refuse the whole batch if ANY field in it cannot be resolved, and name the
  -- offenders. Applying the resolvable subset would leave a half-reverted state
  -- that nobody asked for, and registering the missing field is a one-row fix.
  select coalesce(array_agg(distinct a.entity_type || '.' || a.field), '{}')
    into v_missing
  from public.external_correction_audit a
  left join public.review_field_registry g
    on g.entity_type = a.entity_type and g.field = a.field
  where a.batch_id = p_batch_id
    and a.reverted_at is null
    and (g.target_table is null or g.target_column is null);

  if array_length(v_missing, 1) is not null then
    raise exception
      'cannot revert batch %: no review_field_registry mapping for %. Register these (entity_type, field) rows and retry.',
      p_batch_id, array_to_string(v_missing, ', ');
  end if;

  for r in
    select a.id, a.entity_id, a.before_value, a.after_value,
           g.target_table, g.target_column
    from public.external_correction_audit a
    join public.review_field_registry g
      on g.entity_type = a.entity_type and g.field = a.field
    where a.batch_id = p_batch_id
      and a.reverted_at is null
      and a.skipped_at is null
    order by a.id
    limit p_limit
  loop
    v_tbl := r.target_table;
    v_col := r.target_column;

    select c.data_type into v_type
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = v_tbl and c.column_name = v_col;

    if v_type is null then
      raise exception 'review_field_registry points at public.%.% which does not exist', v_tbl, v_col;
    end if;

    -- Build the restore expression per column shape. Unsupported types RAISE
    -- rather than being coerced: a silently wrong cast here writes damage while
    -- reporting a successful revert.
    v_setexpr := case
      when v_type = 'ARRAY' then
        '(select coalesce(array_agg(e #>> ''{}''), ''{}'') from jsonb_array_elements($2) e)'
      when v_type = 'jsonb' then '$2'
      when v_type in ('text', 'character varying') then '($2 #>> ''{}'')'
      when v_type in ('integer', 'smallint', 'bigint') then '($2 #>> ''{}'')::bigint'
      when v_type in ('numeric', 'double precision', 'real') then '($2 #>> ''{}'')::numeric'
      when v_type = 'boolean' then '($2 #>> ''{}'')::boolean'
      else null
    end;

    if v_setexpr is null then
      raise exception 'rollback does not support column type % on public.%.%', v_type, v_tbl, v_col;
    end if;

    -- Restore only if the live value is still the one we wrote. `$3` is the
    -- after-image; comparing through to_jsonb keeps the test type-agnostic.
    execute format(
      'update public.%I set %I = case when $2 = ''null''::jsonb then null else %s end '
      || 'where id = $1 and coalesce(to_jsonb(%I), ''null''::jsonb) = $3',
      v_tbl, v_col, v_setexpr, v_col
    ) using r.entity_id, r.before_value, r.after_value;

    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_reverted := v_reverted + 1;
      update public.external_correction_audit
        set reverted_at = now(), reverted_by = v_actor
      where id = r.id;
    else
      -- Either the row is gone or the value moved on. Either way this batch no
      -- longer owns it. Stamped rather than left untouched so it leaves the
      -- work list: an unrevertable row at the head of `order by id limit n`
      -- otherwise blocks every later row forever.
      v_moved := v_moved + 1;
      update public.external_correction_audit
        set skipped_at = now(),
            skip_reason = 'live value no longer matches after_value, or row deleted'
      where id = r.id;
    end if;
  end loop;

  -- Genuinely outstanding work: not reverted and not already dispositioned.
  -- Counting skipped rows here would make a caller looping on `remaining` spin
  -- forever on rows it has already refused.
  select count(*) into v_remaining
  from public.external_correction_audit
  where batch_id = p_batch_id and reverted_at is null and skipped_at is null;

  return jsonb_build_object(
    'batch_id',     p_batch_id,
    'reverted',     v_reverted,
    'skipped_moved', v_moved,
    'remaining',    v_remaining
  );
end $$;

revoke all on function public.rollback_external_correction_batch(uuid, integer) from public, anon, authenticated;
grant execute on function public.rollback_external_correction_batch(uuid, integer) to service_role;

comment on function public.rollback_external_correction_batch(uuid, integer) is
  'Undo one enrichment batch. Restores before_value verbatim (never via apply_mode, which can merge). '
  'Skips rows whose live value has changed since the write. Batched: loop while remaining > 0.';


-- ---------------------------------------------------------------------------
-- Sentinel input
-- ---------------------------------------------------------------------------
-- The correction RATE is the signal, not the corpus state: a healthy corrector
-- writes a slow trickle, and a broken matcher or an upstream schema change
-- shows up as a spike long before anyone notices a wrong value on a page.

create or replace function public.external_correction_stats(p_days integer default 7)
returns jsonb
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select jsonb_build_object(
    'window_days', greatest(coalesce(p_days, 7), 1),
    'by_source_day', coalesce((
      select jsonb_agg(x order by x->>'day' desc, x->>'source')
      from (
        select jsonb_build_object(
                 'day',       created_at::date,
                 'source',    source,
                 'entity',    entity_type,
                 'writes',    count(*),
                 -- An overwrite of a non-empty value is the risky kind; filling
                 -- a blank is not. Counted apart so the ratio is visible.
                 'overwrites', count(*) filter (where before_value <> 'null'::jsonb)
               ) x
        from public.external_correction_audit
        where created_at >= now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
        group by created_at::date, source, entity_type
      ) s
    ), '[]'::jsonb),
    'reverted', coalesce((
      select count(*) from public.external_correction_audit
      where reverted_at >= now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
    ), 0)
  );
$$;

revoke all on function public.external_correction_stats(integer) from public, anon;
grant execute on function public.external_correction_stats(integer) to service_role, authenticated;


do $$
begin
  if to_regclass('public.external_correction_audit') is null then
    raise exception 'external_correction_audit was not created';
  end if;
  if to_regprocedure('public.rollback_external_correction_batch(uuid, integer)') is null then
    raise exception 'rollback_external_correction_batch was not created';
  end if;
  if to_regprocedure('public.external_correction_stats(integer)') is null then
    raise exception 'external_correction_stats was not created';
  end if;
  -- The before_value NOT NULL is the property the whole table exists for.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'external_correction_audit'
      and column_name = 'before_value' and is_nullable = 'YES'
  ) then
    raise exception 'before_value must be NOT NULL — a row without a before-image cannot be rolled back';
  end if;
end $$;
