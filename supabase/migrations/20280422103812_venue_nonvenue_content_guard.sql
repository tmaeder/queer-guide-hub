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
-- archive_entity: the OTHER caller of the contract that just changed
-- ---------------------------------------------------------------------------
-- `decide_venue_nonvenue` has two callers. The non-venue review queue is one,
-- and it reads the refusal (useVenueReviewQueue.ts throws on `ok:false` and
-- surfaces the hint). The other is `archive_entity` (20261029100200:41), the
-- generic admin lifecycle dispatcher behind the CMS Archive row action and
-- BulkActionsBar — it calls `decide_venue_nonvenue(p_id, true, …)` and NEVER
-- INSPECTS THE RESULT. It then falls through to an unconditional
-- `insert into admin_lifecycle_audit (… action 'archive' …)` and returns.
--
-- So without this, the refusal added above turns the admin archive path into a
-- liar: the venue keeps its review_status and seo_indexable, the audit log says
-- it was archived, and the refusal jsonb is filed into `details` where nothing
-- reads it. That is strictly worse than the orphaned events this PR exists to
-- prevent — an orphan is visible in the data, a false audit row is not.
--
-- WHY RAISE RATHER THAN PASS p_force := true. Force is the right answer at the
-- review queue, which is built for it: it renders the refusal, names the event
-- count and lets a human choose to override. `archive_entity` has no such
-- surface. It is a generic dispatcher whose signature cannot grow a force
-- parameter without becoming an overload, and PostgREST resolves overloads BY
-- ARGUMENT NAME and answers a mismatch with a silent PGRST202 404. Hardcoding
-- force would make every generic Archive click an unconditional silent
-- override, disabling the guard on the one path that cannot report what it
-- overrode.
--
-- Raising is also how this function already reports every refusal it has — the
-- 'country' branch and the `unsupported_type` fallthrough both
-- `raise exception … using errcode = '22023'` — and it fails BEFORE the audit
-- insert, so a refused archive leaves no audit row at all. Same ordering rule
-- `delete_entity` documents: the log must never claim an action that did not
-- occur.
--
-- 20261029100200 is applied and is NOT edited; this is a CREATE OR REPLACE and
-- the body is that file verbatim with only the 'venue' branch changed.
--
-- Noted for a later reader: the 'city' and 'personality' branches call
-- functions that can also return `ok:false` (archive_city_as_nonplace refuses
-- on has_content). That is the same shape, it predates this change, and it is
-- deliberately left alone so this migration stays scoped to the one contract it
-- is altering.
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
      -- The refusal has to reach the caller. Falling through would write an
      -- 'archive' audit row for a venue that is still live.
      if coalesce(v_result->>'ok', 'true') = 'false' then
        raise exception
          'venue not archived (%): % live event(s) still point at it. Re-point or archive those events first, or decide it in the non-venue review queue, which can override with p_force.',
          coalesce(v_result->>'error', 'refused'),
          coalesce(v_result->>'events', '?')
          using errcode = '22023';
      end if;
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

    -- New in 20261029100000. These three carry `archived_at`, and RLS is what
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
    -- 20261029100000's header: `countries` is a parent, and hiding the row
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

comment on function public.archive_entity(text, uuid, text) is
  'Admin lifecycle archive dispatcher. The venue branch propagates '
  'decide_venue_nonvenue''s has_events refusal as an exception, so no '
  'admin_lifecycle_audit row is ever written for an archive that did not happen.';


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
           'repaired_by', 'migration:20280422103812',
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
