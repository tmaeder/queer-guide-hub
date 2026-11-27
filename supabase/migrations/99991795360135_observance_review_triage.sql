-- Observances phase 2.1: the linker's `review` rows become an inbox queue.
--
-- run_observance_link parks every name match it cannot auto-link (description-only name hits,
-- title hits outside the date window) at status='review'. 157 sat there with no reader.
-- This registers them in the unified inbox:
--   approve -> status='linked',   method='human'
--   reject  -> status='rejected', method='human'   (a tombstone: the linker's upsert only ever
--              rewrites rows with method='auto' and status='review', so it is never re-proposed)
--   reopen  -> status='review',   method='human'   (stays out of the linker's reach either way)
--
-- UNION rule (the 2026-09-14 inbox outage): get_unified_triage_queue UNIONs every active view,
-- so every column below is emitted as text / numeric(3,2) / the exact base types of the other
-- sixteen views. Postcondition P3 runs the union rather than trusting this comment.

-- ===== 1. a row id for the inbox (the table's key is composite) =====
alter table public.event_observances
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;
create unique index if not exists event_observances_id_key on public.event_observances (id);

-- ===== 2. the source view =====
create or replace view public.triage_src_observance_review as
select eo.id,
       'observance-review'::text as queue_type,
       'event'::text as content_type,
       e.title::text as title,
       (o.name || ' · ' || to_char(e.start_date, 'YYYY-MM-DD')
          || coalesce(' · ' || e.city, ''))::text as subtitle,
       eo.status::text as status,
       (case
          when eo.evidence->>'title_term' is not null then 0.60
          when coalesce((eo.evidence->>'date_signal')::boolean, false) then 0.50
          else 0.20
        end)::numeric(3,2) as confidence_score,
       eo.created_at,
       'observance-linker'::text as source,
       eo.event_id as entity_id,
       'events'::text as entity_table,
       false as has_diff,
       null::uuid as reporter_id,
       jsonb_build_object(
         'observance_id', o.id, 'observance_slug', o.slug, 'observance_name', o.name,
         'event_start', e.start_date, 'event_city', e.city,
         'title_term', eo.evidence->'title_term', 'desc_term', eo.evidence->'desc_term',
         'date_signal', eo.evidence->'date_signal', 'offset_days', eo.evidence->'offset_days',
         'demoted', eo.evidence->'demoted') as meta,
       null::text as flag_type,
       '{}'::jsonb as risk_flags
from public.event_observances eo
join public.events e on e.id = eo.event_id and e.duplicate_of_id is null
join public.observances o on o.id = eo.observance_id
where eo.status = 'review';

-- a new relation in public inherits anon/authenticated grants by default
revoke all on public.triage_src_observance_review from anon, authenticated;

insert into public.triage_sources
  (queue_key, view_name, label, priority_weight, sla_hours, count_key, capabilities, active,
   count_prefix, low_confidence_weight)
values ('observance-review', 'triage_src_observance_review', 'Observance links', 20, 168,
        'observance_links', '{"can_reopen": true}'::jsonb, true, 'review_', 1)
on conflict (queue_key) do update
  set view_name = excluded.view_name, label = excluded.label, active = true,
      capabilities = excluded.capabilities;

-- ===== 3. the decision (one helper, so the news queue can join it without re-patching) =====
create or replace function api_private.observance_review_decide(p_item_id uuid, p_action text, p_user_id uuid)
returns void language plpgsql set search_path to 'public' as $fn$
declare v_n int;
begin
  if p_action = 'approve' then
    update public.event_observances set status = 'linked', method = 'human',
           reviewed_by = p_user_id, reviewed_at = now(), updated_at = now()
     where id = p_item_id;
  elsif p_action = 'reject' then
    update public.event_observances set status = 'rejected', method = 'human',
           reviewed_by = p_user_id, reviewed_at = now(), updated_at = now()
     where id = p_item_id;
  elsif p_action = 'reopen' then
    update public.event_observances set status = 'review', method = 'human',
           reviewed_by = null, reviewed_at = null, updated_at = now()
     where id = p_item_id;
  else
    return;  -- flag/skip: triage_action refuses those after the CASE
  end if;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'observance-review: no link with id %', p_item_id using errcode = 'P0002';
  end if;
end
$fn$;
revoke all on function api_private.observance_review_decide(uuid, text, uuid) from public, anon, authenticated;

-- ===== 4. triage_action branch (patched into the live body, never restated) =====
do $patch$
declare
  v_src text := pg_get_functiondef(
    'api_private.triage_action(uuid,text,text,uuid,text,text,boolean,boolean,jsonb)'::regprocedure);
  v_anchor text := E'    ELSE\n      RAISE EXCEPTION ''unknown queue_type: %'', p_queue_type;';
  v_branch text := E'    WHEN ''observance-review'' THEN\n'
    || E'      PERFORM api_private.observance_review_decide(p_item_id, p_action, p_user_id);\n\n';
begin
  if position('''observance-review''' in v_src) > 0 then
    return;  -- already patched
  end if;
  if (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'triage_action: ELSE anchor not found exactly once';
  end if;
  execute replace(v_src, v_anchor, v_branch || v_anchor);
end
$patch$;

-- ===== 5. postconditions =====
do $verify$
declare
  v_n int;
  v_cols text;
begin
  -- P1 the branch is live
  if position('''observance-review''' in pg_get_functiondef(
       'api_private.triage_action(uuid,text,text,uuid,text,text,boolean,boolean,jsonb)'::regprocedure)) = 0 then
    raise exception 'P1 failed: triage_action has no observance-review branch';
  end if;
  -- P2 column base types match the entity-links view column for column
  select string_agg(a.attname || ':' || a.atttypid::regtype::text, ',' order by a.attnum) into v_cols
    from pg_attribute a where a.attrelid = 'public.triage_src_observance_review'::regclass and a.attnum > 0;
  if v_cols is distinct from (
       select string_agg(a.attname || ':' || a.atttypid::regtype::text, ',' order by a.attnum)
         from pg_attribute a where a.attrelid = 'public.triage_src_entity_links'::regclass and a.attnum > 0) then
    raise exception 'P2 failed: column shape differs from triage_src_entity_links: %', v_cols;
  end if;
  -- P3 the union of every active source still executes
  select coalesce((public.triage_queue_signals()->>'probe_ok')::boolean, false)::int into v_n;
  if v_n <> 1 then
    raise exception 'P3 failed: triage_queue_signals probe is not ok: %', public.triage_queue_signals();
  end if;
  -- P4 anon cannot read the view
  if has_table_privilege('anon', 'public.triage_src_observance_review', 'select') then
    raise exception 'P4 failed: anon can read triage_src_observance_review';
  end if;
end
$verify$;
