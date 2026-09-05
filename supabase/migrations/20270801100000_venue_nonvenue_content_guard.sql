-- Archiving a venue must not silently orphan the events held there.
--
-- MEASURED ON PROD, 2026-09-05: 34 events across 4 venues already point at a
-- venue whose `nonvenue_candidate.status = 'confirmed'` — i.e. archived as "not
-- a venue" while the calendar still says something happens there. Those events
-- keep a `venue_id` that resolves to an archived row, so they render without a
-- usable place.
--
-- `archive_city_as_nonplace` (20260801135950) has had exactly this guard since
-- the day it shipped, and its comment says why: "A false positive here silently
-- delists a real destination, so this guard is not advisory." Venues never got
-- one. The asymmetry was not a decision; it is the older of the two functions.
--
-- WHY A FORCE FLAG AND NOT AN OUTRIGHT REFUSAL, which is what cities does. A
-- city with content is nearly always a real city. A venue with events is often
-- a real venue AND the events are often junk imported alongside it — the patroc
-- legacy cohort (20260915150000) is exactly that shape. Refusing outright would
-- dead-end the admin on the very rows the queue exists to clear. So: refuse by
-- default, allow an explicit override, and RECORD the orphan count on the row
-- so the decision is auditable afterwards rather than invisible.
--
-- The 4-arg form REPLACES the 3-arg one rather than overloading it. Two
-- signatures would make PostgREST resolve by argument name and answer a
-- mismatch with a silent PGRST202 404 — the same trap `cluster_news_backfill`
-- hit, where the old signature had to be dropped or the existing caller 42725'd.

drop function if exists public.decide_venue_nonvenue(uuid, boolean, text);

create or replace function public.decide_venue_nonvenue(
  p_venue_id uuid,
  p_confirm  boolean,
  p_note     text default null,
  p_force    boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_prev_status text;
  v_prev_seo    boolean;
  v_events      integer;
begin
  perform public.assert_admin_or_internal();

  select review_status, seo_indexable into v_prev_status, v_prev_seo
    from public.venues where id = p_venue_id;

  if not found then
    raise exception 'venue % not found', p_venue_id using errcode = 'P0002';
  end if;

  if p_confirm then
    -- Count only events that still exist as live rows. A duplicate or archived
    -- event is already not being shown anywhere, so blocking on it would make
    -- the guard fire on rows it has no reason to protect.
    select count(*) into v_events
      from public.events e
     where e.venue_id = p_venue_id
       and e.duplicate_of_id is null
       and coalesce(e.status, '') <> 'archived';

    if v_events > 0 and not p_force then
      return jsonb_build_object(
        'ok', false,
        'error', 'has_events',
        'id', p_venue_id,
        'events', v_events,
        'hint', 'Re-point or archive the events first, or call with p_force := true to archive anyway.');
    end if;

    update public.venues set
      review_status   = 'archived',
      seo_indexable   = false,
      needs_attention = false,
      enrichment_status = jsonb_set(
        coalesce(enrichment_status, '{}'::jsonb), '{nonvenue_candidate}',
        coalesce(enrichment_status->'nonvenue_candidate', '{}'::jsonb)
          || jsonb_build_object(
               'status',     'confirmed',
               'decided_at', now(),
               'decided_by', coalesce(auth.uid()::text, 'internal'),
               'note',       nullif(btrim(coalesce(p_note, '')), ''),
               -- Recorded even when zero: "we checked and there were none" and
               -- "nobody looked" must not read the same, which is the lesson
               -- this repo keeps paying for.
               'events_at_archive', v_events,
               'forced', (v_events > 0 and p_force),
               'archived', jsonb_build_object(
                             'review_status', v_prev_status,
                             'seo_indexable', v_prev_seo)))
    where id = p_venue_id;

    return jsonb_build_object('ok', true, 'id', p_venue_id, 'status', 'confirmed',
                              'events_orphaned', case when p_force then v_events else 0 end);
  end if;

  update public.venues set
    needs_attention = case
      when coalesce(enrichment_status->'category_backfill'->>'status', '') = 'review'
      then needs_attention
      else false end,
    enrichment_status = jsonb_set(
      coalesce(enrichment_status, '{}'::jsonb), '{nonvenue_candidate}',
      coalesce(enrichment_status->'nonvenue_candidate', '{}'::jsonb)
        || jsonb_build_object(
             'status',     'rejected',
             'decided_at', now(),
             'decided_by', coalesce(auth.uid()::text, 'internal'),
             'note',       nullif(btrim(coalesce(p_note, '')), '')))
  where id = p_venue_id;

  return jsonb_build_object('ok', true, 'id', p_venue_id, 'status', 'rejected');
end; $$;

alter function public.decide_venue_nonvenue(uuid, boolean, text, boolean) owner to postgres;
revoke all on function public.decide_venue_nonvenue(uuid, boolean, text, boolean) from public;
grant execute on function public.decide_venue_nonvenue(uuid, boolean, text, boolean)
  to authenticated, service_role;

comment on function public.decide_venue_nonvenue(uuid, boolean, text, boolean) is
  'Confirm or reject a non-venue candidate. Confirming REFUSES when live events still '
  'point at the venue, unless p_force. Mirrors archive_city_as_nonplace''s content guard.';


-- ---------------------------------------------------------------------------
-- Repair: confirmed but never archived
-- ---------------------------------------------------------------------------
-- 9 rows measured on prod carry `status='confirmed'` while `review_status` is
-- still something else. A confirmed non-venue that is not archived is the worst
-- of both states: the queue treats it as decided and stops offering it, and the
-- site treats it as a venue and keeps serving it. Neither surface reports it.
update public.venues v set
  review_status = 'archived',
  seo_indexable = false,
  enrichment_status = jsonb_set(
    coalesce(v.enrichment_status, '{}'::jsonb), '{nonvenue_candidate}',
    coalesce(v.enrichment_status->'nonvenue_candidate', '{}'::jsonb)
      || jsonb_build_object(
           'repaired_at', now(),
           'repaired_by', 'migration:20270801100000',
           -- Only snapshot if the earlier decision never did; overwriting an
           -- existing snapshot would destroy the undo it exists to provide.
           'archived', coalesce(
             v.enrichment_status->'nonvenue_candidate'->'archived',
             jsonb_build_object('review_status', v.review_status,
                                'seo_indexable', v.seo_indexable))))
where v.enrichment_status->'nonvenue_candidate'->>'status' = 'confirmed'
  and v.review_status is distinct from 'archived';


-- ---------------------------------------------------------------------------
-- Sentinel input
-- ---------------------------------------------------------------------------
-- A separate function rather than extending `category_coverage_health()`:
-- restating a large existing function to add two counters is a merge-collision
-- surface, and several sessions land migrations here concurrently.
create or replace function public.venue_nonvenue_hygiene()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    -- Zero-invariant: a confirmed non-venue must be archived. Anything else
    -- means a writer bypassed decide_venue_nonvenue.
    'confirmed_not_archived', (
      select count(*) from public.venues
      where enrichment_status->'nonvenue_candidate'->>'status' = 'confirmed'
        and review_status is distinct from 'archived'),
    -- Zero-invariant: a confirmed non-venue must not be indexable.
    'confirmed_still_indexable', (
      select count(*) from public.venues
      where enrichment_status->'nonvenue_candidate'->>'status' = 'confirmed'
        and seo_indexable),
    -- Advisory: events left pointing at an archived non-venue. Non-zero is the
    -- pre-guard backlog, not a new fault; it can only grow through p_force.
    'events_on_confirmed_nonvenues', (
      select count(*) from public.events e
      join public.venues v on v.id = e.venue_id
      where v.enrichment_status->'nonvenue_candidate'->>'status' = 'confirmed'
        and e.duplicate_of_id is null
        and coalesce(e.status, '') <> 'archived'),
    'pending_review', (
      select count(*) from public.venues
      where enrichment_status->'nonvenue_candidate'->>'status' = 'review'
        and duplicate_of_id is null)
  );
$$;

revoke all on function public.venue_nonvenue_hygiene() from public, anon;
grant execute on function public.venue_nonvenue_hygiene() to authenticated, service_role;

comment on function public.venue_nonvenue_hygiene() is
  'Non-venue disposition invariants. confirmed_not_archived and '
  'confirmed_still_indexable are zero-tolerance; the event count is advisory.';


-- Assert the repair actually closed the state this migration exists to fix.
do $$
declare v jsonb;
begin
  v := public.venue_nonvenue_hygiene();
  if (v->>'confirmed_not_archived')::int > 0 then
    raise exception 'confirmed non-venues still unarchived after repair: %', v->>'confirmed_not_archived';
  end if;
  if (v->>'confirmed_still_indexable')::int > 0 then
    raise exception 'confirmed non-venues still seo_indexable after repair: %', v->>'confirmed_still_indexable';
  end if;
end $$;
