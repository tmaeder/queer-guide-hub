-- ============================================================================
-- Self-hosted machine translation (TranslateGemma 4B on the home NAS)
-- ----------------------------------------------------------------------------
-- Scope: venues.description, events.title, events.description,
--        organizations.description → the 10 non-English site locales.
--
-- READ PATH IS UNCHANGED. The frontend already reads `<field>_i18n` jsonb maps
-- through `localizedField()` (src/lib/localizeContent.ts), which falls back to
-- the source column. The NAS worker writes into those same maps, so a row's
-- own RLS (safety_gated, cruising) governs who can read its translations —
-- nothing new is exposed to anon.
--
-- `content_translations` (dormant since 2026-04 apart from milestone overlays)
-- becomes the LEDGER: one row per (table, record, field, language) with the
-- sha256 of the source it was made from, the detected source language and the
-- model. `stale` is added as a status.
--
-- DEMAND-DRIVEN. The NAS cannot keep up with the full intake (measured
-- 2026-11-21: ~55k source tokens/day of new venues + upcoming events × 10
-- locales ≈ 2.5× its 24/7 capacity), so nothing is enqueued just because a row
-- was written. Jobs come from:
--   1. request_translation()  — a non-English page that shows the original
--                               because no translation exists (anon-callable).
--   2. the source-change trigger — re-queues ONLY the locales that already had
--                               a translation, and clears them meanwhile so
--                               readers fall back to the original, never stale.
--   3. enqueue_translation_backfill() — operator, service role.
--
-- The old LLM pipeline (translate-i18n-batch → NVIDIA free tier / Cloudflare)
-- is disabled for these three (table, field) pairs below. Its existing output
-- stays in place and is replaced the next time the source text changes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ledger: content_translations
-- ---------------------------------------------------------------------------
alter table public.content_translations
  drop constraint if exists content_translations_status_check;
alter table public.content_translations
  add constraint content_translations_status_check
  check (status in ('draft', 'published', 'machine', 'human_reviewed', 'stale'));

alter table public.content_translations
  add column if not exists source_hash text,
  add column if not exists source_lang text,
  add column if not exists model text;

alter table public.organizations
  add column if not exists description_i18n jsonb;

-- ---------------------------------------------------------------------------
-- 2. Vocabulary helpers
-- ---------------------------------------------------------------------------
create or replace function public.translation_locales()
returns text[] language sql immutable set search_path = ''
as $$ select array['de','fr','es','it','pt','ru','zh','ja','ko','ar'] $$;

create or replace function public.translation_hash(p_text text)
returns text language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(coalesce(p_text, ''), 'UTF8')), 'hex') $$;

create or replace function public.translation_is_source_field(p_type text, p_field text)
returns boolean language sql immutable set search_path = ''
as $$
  select (p_type, p_field) in (
    ('venues', 'description'), ('events', 'title'), ('events', 'description'),
    ('organizations', 'description'))
$$;

-- Current source text of one field. Whitelisted, so format(%I) is safe.
create or replace function public._translation_source(p_type text, p_id uuid, p_field text)
returns text language plpgsql stable set search_path = public
as $$
declare v text;
begin
  if not public.translation_is_source_field(p_type, p_field) then
    raise exception 'unsupported translation field %.%', p_type, p_field using errcode = '22023';
  end if;
  execute format('select %I from public.%I where id = $1', p_field, p_type) into v using p_id;
  return v;
end $$;

create or replace function public._translation_current(p_type text, p_id uuid, p_field text, p_locale text)
returns text language plpgsql stable set search_path = public
as $$
declare v text;
begin
  if not public.translation_is_source_field(p_type, p_field) then
    raise exception 'unsupported translation field %.%', p_type, p_field using errcode = '22023';
  end if;
  execute format('select nullif(btrim(%I ->> $2), '''') from public.%I where id = $1',
                 p_field || '_i18n', p_type) into v using p_id, p_locale;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Queue
-- ---------------------------------------------------------------------------
create table if not exists public.translation_jobs (
  id          bigint generated always as identity primary key,
  entity_type text not null,
  entity_id   uuid not null,
  field       text not null,
  target_lang text not null,
  source_hash text not null,
  status      text not null default 'pending'
              check (status in ('pending', 'running', 'done', 'failed')),
  priority    int  not null default 0,
  attempts    int  not null default 0,
  last_error  text,
  locked_at   timestamptz,
  not_before  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint translation_jobs_field_check
    check (public.translation_is_source_field(entity_type, field)),
  constraint translation_jobs_locale_check
    check (target_lang = any (public.translation_locales()))
);

-- At most one PENDING job per key. A running job may coexist with a new pending
-- one (the source changed mid-translation); commit_translation() rejects the
-- running one by hash, so the pending one wins.
create unique index if not exists translation_jobs_pending_key
  on public.translation_jobs (entity_type, entity_id, field, target_lang)
  where status = 'pending';
create index if not exists translation_jobs_claim
  on public.translation_jobs (priority desc, created_at)
  where status = 'pending';
create index if not exists translation_jobs_status_updated
  on public.translation_jobs (status, updated_at);

alter table public.translation_jobs enable row level security;
-- No policies: service role only. New public tables inherit anon/authenticated
-- grants in this project, so revoke them explicitly.
revoke all on public.translation_jobs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Demand: request_translation (anon-callable)
-- ---------------------------------------------------------------------------
-- Returns how many fields were queued; returns nothing about the row itself,
-- so calling it for a row the caller cannot read reveals nothing. The
-- visibility predicates mirror the tables' SELECT policies so we don't spend
-- NAS time on rows the caller could not see anyway.
create or replace function public.request_translation(p_entity_type text, p_entity_id uuid, p_locale text)
returns int language plpgsql security definer set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_visible boolean;
  v_field   text;
  v_src     text;
  v_hash    text;
  v_n       int := 0;
begin
  if p_entity_id is null or not (coalesce(p_locale, '') = any (public.translation_locales())) then
    return 0;
  end if;

  if p_entity_type = 'venues' then
    select true into v_visible from public.venues
    where id = p_entity_id and duplicate_of_id is null and closed_at is null
      and ((not safety_gated and category is distinct from 'cruising') or v_uid is not null);
  elsif p_entity_type = 'events' then
    -- Upcoming only: past events are ~90% of the corpus and not worth NAS time.
    select true into v_visible from public.events
    where id = p_entity_id and duplicate_of_id is null
      and coalesce(end_date, start_date) >= now() - interval '1 day'
      and (not safety_gated or v_uid is not null);
  elsif p_entity_type = 'organizations' then
    select true into v_visible from public.organizations
    where id = p_entity_id and status = 'active' and (not safety_gated or v_uid is not null);
  end if;
  if v_visible is not true then
    return 0;
  end if;

  for v_field in
    select f from unnest(array['title', 'description']) f
    where public.translation_is_source_field(p_entity_type, f)
  loop
    v_src := public._translation_source(p_entity_type, p_entity_id, v_field);
    continue when btrim(coalesce(v_src, '')) = '';
    continue when public._translation_current(p_entity_type, p_entity_id, v_field, p_locale) is not null;
    v_hash := public.translation_hash(v_src);
    continue when exists (
      select 1 from public.translation_jobs
      where entity_type = p_entity_type and entity_id = p_entity_id and field = v_field
        and target_lang = p_locale and status = 'running' and source_hash = v_hash);
    -- Failed for this exact source already: don't retry on every page view.
    continue when exists (
      select 1 from public.translation_jobs
      where entity_type = p_entity_type and entity_id = p_entity_id and field = v_field
        and target_lang = p_locale and status = 'failed' and source_hash = v_hash);

    insert into public.translation_jobs (entity_type, entity_id, field, target_lang, source_hash, priority)
    values (p_entity_type, p_entity_id, v_field, p_locale, v_hash, 100)
    on conflict (entity_type, entity_id, field, target_lang) where status = 'pending'
    do update set priority    = least(public.translation_jobs.priority + 1, 1000),
                  source_hash = excluded.source_hash,
                  updated_at  = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Source changed → stale + re-queue the locales that had a translation
-- ---------------------------------------------------------------------------
create or replace function public.trg_translation_source_changed()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_field   text;
  v_col     text;
  v_new     text;
  v_locales text[];
begin
  for v_field in
    select f from unnest(array['title', 'description']) f
    where public.translation_is_source_field(TG_TABLE_NAME, f)
  loop
    continue when (to_jsonb(old) ->> v_field) is not distinct from (to_jsonb(new) ->> v_field);
    v_col := v_field || '_i18n';
    v_new := to_jsonb(new) ->> v_field;

    select coalesce(array_agg(distinct l), '{}') into v_locales from (
      select k as l from jsonb_object_keys(
        case when jsonb_typeof(to_jsonb(old) -> v_col) = 'object' then to_jsonb(old) -> v_col else '{}'::jsonb end) k
      union
      select language from public.content_translations
      where table_name = TG_TABLE_NAME and record_id = new.id and field_name = v_field
    ) s where l = any (public.translation_locales());

    -- Readers fall back to the new original immediately; the old text survives
    -- in the ledger as `stale`.
    new := jsonb_populate_record(new, jsonb_build_object(v_col, '{}'::jsonb));
    update public.content_translations
       set status = 'stale', updated_at = now()
     where table_name = TG_TABLE_NAME and record_id = new.id and field_name = v_field
       and status <> 'stale';

    if btrim(coalesce(v_new, '')) <> '' and cardinality(v_locales) > 0 then
      insert into public.translation_jobs (entity_type, entity_id, field, target_lang, source_hash, priority)
      select TG_TABLE_NAME, new.id, v_field, l, public.translation_hash(v_new), 90
      from unnest(v_locales) l
      on conflict (entity_type, entity_id, field, target_lang) where status = 'pending'
      do update set source_hash = excluded.source_hash, updated_at = now();
    end if;
  end loop;
  return new;
end $$;

-- `zz_` so it fires after every other BEFORE trigger (they fire in name order)
-- and sees the final source value.
drop trigger if exists trg_zz_translation_source on public.venues;
create trigger trg_zz_translation_source
  before update of description on public.venues
  for each row when (old.description is distinct from new.description)
  execute function public.trg_translation_source_changed();

drop trigger if exists trg_zz_translation_source on public.events;
create trigger trg_zz_translation_source
  before update of title, description on public.events
  for each row when (old.title is distinct from new.title or old.description is distinct from new.description)
  execute function public.trg_translation_source_changed();

drop trigger if exists trg_zz_translation_source on public.organizations;
create trigger trg_zz_translation_source
  before update of description on public.organizations
  for each row when (old.description is distinct from new.description)
  execute function public.trg_translation_source_changed();

-- ---------------------------------------------------------------------------
-- 6. Worker RPCs (service role only)
-- ---------------------------------------------------------------------------
-- Claims up to p_limit jobs atomically. Returns the CURRENT source text and its
-- hash (the source may have changed since enqueue). `context_text` is the
-- longest text on the row, for source-language detection (titles are too short
-- to detect on their own); `protected_name` is the venue/organization name, or
-- an event's venue name, for the worker to mask.
create or replace function public.claim_translation_jobs(p_limit int default 1, p_min_priority int default 0)
returns table (job_id bigint, entity_type text, entity_id uuid, field text, target_lang text,
               attempts int, source_hash text, source_text text, context_text text, protected_name text)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
begin
  -- Abandoned (worker died mid-job): back to pending, or failed after 3 tries.
  update public.translation_jobs j
     set status = case when j.attempts >= 3 then 'failed' else 'pending' end,
         last_error = 'abandoned', locked_at = null, updated_at = now()
   where j.status = 'running' and j.locked_at < now() - interval '30 minutes';

  return query
  with c as (
    select j.id from public.translation_jobs j
    where j.status = 'pending' and j.not_before <= now() and j.priority >= p_min_priority
    order by j.priority desc, j.created_at
    limit greatest(1, least(coalesce(p_limit, 1), 20))
    for update skip locked
  ), u as (
    update public.translation_jobs j
       set status = 'running', locked_at = now(), attempts = j.attempts + 1, updated_at = now()
      from c where j.id = c.id
    returning j.id, j.entity_type, j.entity_id, j.field, j.target_lang, j.attempts
  ), s as (
    select u.*, public._translation_source(u.entity_type, u.entity_id, u.field) as src from u
  )
  select s.id, s.entity_type, s.entity_id, s.field, s.target_lang, s.attempts,
         public.translation_hash(s.src), s.src,
         case when s.entity_type = 'events'
              then coalesce(nullif(btrim((select e.description from public.events e where e.id = s.entity_id)), ''), s.src)
              else s.src end,
         case s.entity_type
              when 'venues' then (select v.name from public.venues v where v.id = s.entity_id)
              when 'organizations' then (select o.name from public.organizations o where o.id = s.entity_id)
              when 'events' then (select e.venue_name from public.events e where e.id = s.entity_id)
         end
  from s;
end $$;

-- Writes the ledger row and the *_i18n map in one transaction. Rejects the
-- result if the source changed while the NAS was translating.
create or replace function public.commit_translation(p_job_id bigint, p_text text, p_source_hash text,
                                                     p_source_lang text, p_model text)
returns text language plpgsql security definer set search_path = public
as $$
declare j public.translation_jobs%rowtype;
begin
  select * into j from public.translation_jobs where id = p_job_id and status = 'running' for update;
  if not found then
    return 'missing';
  end if;
  if btrim(coalesce(p_text, '')) = '' then
    raise exception 'empty translation' using errcode = '22023';
  end if;

  if public.translation_hash(public._translation_source(j.entity_type, j.entity_id, j.field)) <> p_source_hash then
    update public.translation_jobs set status = 'done', last_error = 'source changed during translation',
           locked_at = null, updated_at = now() where id = j.id;
    return 'stale';
  end if;

  if exists (select 1 from public.content_translations
             where table_name = j.entity_type and record_id = j.entity_id and field_name = j.field
               and language = j.target_lang and status = 'human_reviewed' and source_hash = p_source_hash) then
    update public.translation_jobs set status = 'done', last_error = 'kept human_reviewed',
           locked_at = null, updated_at = now() where id = j.id;
    return 'kept';
  end if;

  insert into public.content_translations
    (table_name, record_id, field_name, language, value, status, machine_source, source_hash, source_lang, model)
  values (j.entity_type, j.entity_id, j.field, j.target_lang, p_text, 'machine', 'nas', p_source_hash, p_source_lang, p_model)
  on conflict (table_name, record_id, field_name, language) do update
     set value = excluded.value, status = 'machine', machine_source = 'nas', translated_by = null,
         source_hash = excluded.source_hash, source_lang = excluded.source_lang,
         model = excluded.model, updated_at = now();

  execute format('update public.%1$I set %2$I = (case when jsonb_typeof(%2$I) = ''object'' then %2$I else ''{}''::jsonb end)'
                 ' || jsonb_build_object($1, $2) where id = $3',
                 j.entity_type, j.field || '_i18n')
    using j.target_lang, p_text, j.entity_id;

  update public.translation_jobs set status = 'done', last_error = null, locked_at = null, updated_at = now()
   where id = j.id;
  return 'committed';
end $$;

-- p_error must be a short code, never content text.
create or replace function public.fail_translation_job(p_job_id bigint, p_error text, p_retryable boolean)
returns text language sql security definer set search_path = public
as $$
  update public.translation_jobs
     set status     = case when p_retryable and attempts < 3 then 'pending' else 'failed' end,
         not_before = now() + make_interval(mins => 5 * power(2, greatest(attempts - 1, 0))::int),
         last_error = left(p_error, 300), locked_at = null, updated_at = now()
   where id = p_job_id and status = 'running'
  returning status
$$;

create or replace function public.skip_translation_job(p_job_id bigint, p_reason text)
returns void language sql security definer set search_path = public
as $$
  update public.translation_jobs set status = 'done', last_error = left(p_reason, 300),
         locked_at = null, updated_at = now()
   where id = p_job_id and status = 'running'
$$;

-- Operator backfill. Lower priority than any demand job. Skips rows that
-- already have a translation for the locale or a pending job.
create or replace function public.enqueue_translation_backfill(p_entity_type text, p_locales text[],
                                                              p_limit int default 500, p_priority int default 10)
returns int language plpgsql security definer set search_path = public
as $$
declare v_n int := 0; v_k int; v_locale text; v_field text;
begin
  if p_entity_type not in ('venues', 'events', 'organizations') then
    raise exception 'unsupported entity type %', p_entity_type using errcode = '22023';
  end if;
  foreach v_locale in array p_locales loop
    if not (v_locale = any (public.translation_locales())) then
      raise exception 'unsupported locale %', v_locale using errcode = '22023';
    end if;
    for v_field in
      select f from unnest(array['title', 'description']) f
      where public.translation_is_source_field(p_entity_type, f)
    loop
      execute format($q$
        insert into public.translation_jobs (entity_type, entity_id, field, target_lang, source_hash, priority)
        select %1$L, t.id, %2$L, $1, public.translation_hash(t.%2$I), $2
        from public.%1$I t
        where btrim(coalesce(t.%2$I, '')) <> ''
          and nullif(btrim(t.%3$I ->> $1), '') is null
          and %4$s
        order by %5$s
        limit $3
        on conflict (entity_type, entity_id, field, target_lang) where status = 'pending' do nothing$q$,
        p_entity_type, v_field, v_field || '_i18n',
        case p_entity_type
          when 'venues' then 't.duplicate_of_id is null and t.closed_at is null'
          when 'events' then 't.duplicate_of_id is null and coalesce(t.end_date, t.start_date) >= now()'
          else 't.status = ''active''' end,
        case p_entity_type
          when 'venues' then 't.quality_score desc nulls last, t.created_at desc'
          when 'events' then 't.start_date asc'
          else 't.created_at desc' end)
      using v_locale, p_priority, greatest(1, least(coalesce(p_limit, 500), 50000));
      get diagnostics v_k = row_count;
      v_n := v_n + v_k;
    end loop;
  end loop;
  return v_n;
end $$;

create or replace function public.prune_translation_jobs()
returns int language sql security definer set search_path = public
as $$
  with d as (
    delete from public.translation_jobs
    where (status = 'done' and updated_at < now() - interval '7 days')
       or (status = 'failed' and updated_at < now() - interval '30 days')
    returning 1)
  select count(*)::int from d
$$;

create or replace function public.translation_queue_signals()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'pending',             count(*) filter (where status = 'pending'),
    'running',             count(*) filter (where status = 'running'),
    'failed_24h',          count(*) filter (where status = 'failed' and updated_at > now() - interval '24 hours'),
    'done_24h',            count(*) filter (where status = 'done' and updated_at > now() - interval '24 hours'),
    'oldest_pending_at',   min(created_at) filter (where status = 'pending'),
    'last_done_at',        max(updated_at) filter (where status = 'done'),
    'top_errors',          (select coalesce(jsonb_object_agg(e, n), '{}') from (
                              select coalesce(last_error, 'unknown') e, count(*) n from public.translation_jobs
                              where status = 'failed' and updated_at > now() - interval '7 days'
                              group by 1 order by 2 desc limit 5) x))
  from public.translation_jobs
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants. CREATE FUNCTION grants EXECUTE to PUBLIC; take it back.
-- ---------------------------------------------------------------------------
revoke execute on function public._translation_source(text, uuid, text) from public, anon, authenticated;
revoke execute on function public._translation_current(text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.trg_translation_source_changed() from public, anon, authenticated;
revoke execute on function public.claim_translation_jobs(int, int) from public, anon, authenticated;
revoke execute on function public.commit_translation(bigint, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.fail_translation_job(bigint, text, boolean) from public, anon, authenticated;
revoke execute on function public.skip_translation_job(bigint, text) from public, anon, authenticated;
revoke execute on function public.enqueue_translation_backfill(text, text[], int, int) from public, anon, authenticated;
revoke execute on function public.prune_translation_jobs() from public, anon, authenticated;
revoke execute on function public.translation_queue_signals() from public, anon, authenticated;
revoke execute on function public.request_translation(text, uuid, text) from public;

grant execute on function public.claim_translation_jobs(int, int) to service_role;
grant execute on function public.commit_translation(bigint, text, text, text, text) to service_role;
grant execute on function public.fail_translation_job(bigint, text, boolean) to service_role;
grant execute on function public.skip_translation_job(bigint, text) to service_role;
grant execute on function public.enqueue_translation_backfill(text, text[], int, int) to service_role;
grant execute on function public.prune_translation_jobs() to service_role;
grant execute on function public.translation_queue_signals() to service_role;
grant execute on function public.request_translation(text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Retire the third-party LLM pipeline for these fields
-- ---------------------------------------------------------------------------
update public.i18n_translation_targets
   set enabled = false
 where (table_name, field) in (('venues', 'description'), ('events', 'title'), ('events', 'description'))
   and enabled;

-- ---------------------------------------------------------------------------
-- 9. Postconditions
-- ---------------------------------------------------------------------------
do $verify$
declare v int;
begin
  select count(*) into v from pg_trigger
  where tgname = 'trg_zz_translation_source' and not tgisinternal
    and tgrelid in ('public.venues'::regclass, 'public.events'::regclass, 'public.organizations'::regclass);
  if v <> 3 then raise exception 'P1 failed: expected 3 translation triggers, found %', v; end if;

  if has_table_privilege('anon', 'public.translation_jobs', 'select')
     or has_table_privilege('authenticated', 'public.translation_jobs', 'select') then
    raise exception 'P2 failed: translation_jobs is readable by anon/authenticated';
  end if;

  if has_function_privilege('anon', 'public.claim_translation_jobs(int, int)', 'execute')
     or has_function_privilege('anon', 'public.commit_translation(bigint, text, text, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.enqueue_translation_backfill(text, text[], int, int)', 'execute') then
    raise exception 'P3 failed: a worker RPC is callable by anon/authenticated';
  end if;

  if not has_function_privilege('anon', 'public.request_translation(text, uuid, text)', 'execute') then
    raise exception 'P4 failed: request_translation is not callable by anon';
  end if;

  select count(*) into v from public.i18n_translation_targets
  where enabled and (table_name, field) in (('venues', 'description'), ('events', 'title'), ('events', 'description'));
  if v <> 0 then raise exception 'P5 failed: % old-pipeline targets still enabled', v; end if;
end
$verify$;
