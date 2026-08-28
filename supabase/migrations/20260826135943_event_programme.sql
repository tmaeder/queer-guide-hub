-- Pride as a PROGRAMME: one umbrella event + its parade / festival / week children.
--
-- WHY
--   A Pride is not one event. It is a parade (one day, a start time, a route), a
--   street festival over one or more days, and a Pride Week of satellite events
--   around both. The corpus already contains all three -- as unrelated rows.
--   Measured 2026-08-26: 180 active `event_type='pride'` rows (176 upcoming, 76
--   multi-day), and the satellites sit beside them with no link at all. Atlanta
--   carries "Atlanta Pride 2026" (pride, Oct 10-11) plus "Atlanta Pride Tea Dance"
--   and "Atlanta Pride Circuit Party" (both event_type='other', gaytravel4u).
--   On /events those are five equal cards; on /pride only the umbrella appears;
--   on the umbrella's own detail page the programme is invisible.
--
-- WHAT THIS ADDS
--   1. events.parent_event_id -- a self-FK. Children stay ordinary events, so they
--      keep RLS, safety_gated, search indexing, dedup, slug redirects and their own
--      detail page for free. `festivals` is deliberately NOT revived for this: it
--      holds 0 rows, events.festival_id is set on 0 rows, and an umbrella entity of
--      its own would need RLS + search + safety gating + geo spine + sitemap built
--      from scratch. (festivals remains the year-over-year SERIES axis, a different
--      question, and stays dead for now.)
--   2. A depth limit of exactly ONE level, enforced by trigger. Without it the
--      structure becomes a chain and every render path has to recurse.
--   3. A closed vocabulary on events.pride_subtypes. That column has existed since
--      20260607410000 and is NULL on every row -- nothing has ever written it, which
--      is why the Pride-type filter chips were removed with the note "restore these
--      only alongside a writer". This migration supplies the vocabulary and the
--      read paths; the admin writer UI does NOT ship here, so until it does the
--      only writers are a direct UPDATE and the CMS's generic field editor. The
--      filter chips stay off until that panel exists. The old column comment
--      described 'pride:parade'-style values; nothing stored them, so the
--      vocabulary is the bare slug.
--   4. Two read paths: event_programme() for the public page, and
--      event_programme_candidates() for the admin panel's suggestion list. Both are
--      SECURITY INVOKER on purpose -- a DEFINER would bypass the safety-gating RLS
--      on `events` and hand a gated child in a criminalizing country to anon.
--   5. _event_merge_core learns about the new column. A merge is soft
--      (duplicate_of_id), so children of a dropped event would otherwise keep
--      pointing at a hidden row; they are repointed at the kept event, and a merge
--      of a parent with its own child is refused outright.
--
-- NOT here: any automatic assignment. The only writer is a human in the CMS.

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS parent_event_id uuid
    REFERENCES public.events(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.events.parent_event_id IS
  'Umbrella event this row belongs to (a Pride edition and its parade/festival/week children). Exactly one level deep -- enforced by trg_events_programme_depth.';

-- FK covering index (same convention as 20260704160000_fk_covering_indexes_hot_paths).
CREATE INDEX IF NOT EXISTS events_parent_event_id_idx
  ON public.events(parent_event_id) WHERE parent_event_id IS NOT NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_parent_not_self;
ALTER TABLE public.events
  ADD CONSTRAINT events_parent_not_self
    CHECK (parent_event_id IS DISTINCT FROM id) NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. Depth guard -- one level, never a chain
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.events_programme_depth_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.parent_event_id is null then
    return new;
  end if;

  if new.parent_event_id = new.id then
    raise exception 'event % cannot be its own parent', new.id
      using errcode = 'check_violation';
  end if;

  -- The row being given a parent must not itself be an umbrella.
  if exists (select 1 from public.events c
             where c.parent_event_id = new.id and c.id <> new.id) then
    raise exception 'event % already has programme children and cannot become a child itself', new.id
      using errcode = 'check_violation';
  end if;

  -- The chosen parent must be an umbrella, not another child.
  if exists (select 1 from public.events p
             where p.id = new.parent_event_id and p.parent_event_id is not null) then
    raise exception 'event % is itself part of a programme and cannot be a parent', new.parent_event_id
      using errcode = 'check_violation';
  end if;

  return new;
end; $function$;

DROP TRIGGER IF EXISTS trg_events_programme_depth ON public.events;
CREATE TRIGGER trg_events_programme_depth
  BEFORE INSERT OR UPDATE OF parent_event_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_programme_depth_guard();

-- ---------------------------------------------------------------------------
-- 3. pride_subtypes vocabulary
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_pride_subtypes_known;
ALTER TABLE public.events
  ADD CONSTRAINT events_pride_subtypes_known
    CHECK (
      pride_subtypes IS NULL
      OR pride_subtypes <@ ARRAY[
           'parade','festival','week','party','rally',
           'community','film','sports','conference'
         ]::text[]
    ) NOT VALID;

COMMENT ON COLUMN public.events.pride_subtypes IS
  'Pride programme lane(s) for this row: parade / festival / week / party / rally / community / film / sports / conference. Bare slugs, no pride: prefix. A child with no subtype renders in the week lane.';

-- ---------------------------------------------------------------------------
-- 4. Read paths
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.event_programme(uuid);
CREATE FUNCTION public.event_programme(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with root as (
    select coalesce(e.parent_event_id, e.id) as id
    from public.events e
    where e.id = p_event_id
  ),
  umbrella as (
    select e.id, e.slug, e.title, e.start_date, e.end_date, e.city, e.country,
           e.pride_subtypes, e.event_type
    from public.events e join root r on r.id = e.id
    where e.duplicate_of_id is null
  ),
  children as (
    select e.id, e.slug, e.title, e.start_date, e.end_date, e.pride_subtypes,
           e.event_type, e.venue_name, e.venue_id, e.address, e.ticket_url,
           e.is_free, e.price_min, e.price_max, e.currency, e.status, e.images
    from public.events e join root r on e.parent_event_id = r.id
    where e.duplicate_of_id is null
      and coalesce(e.status, '') <> 'archived'
    order by e.start_date, e.title
  )
  select jsonb_build_object(
    'umbrella', (select to_jsonb(u) from umbrella u),
    'children', coalesce((select jsonb_agg(to_jsonb(c)) from children c), '[]'::jsonb)
  );
$function$;

COMMENT ON FUNCTION public.event_programme(uuid) IS
  'Umbrella + ordered programme children for an event id (accepts either the umbrella or any child). SECURITY INVOKER so the safety-gating RLS on events still applies.';

-- Suggestion list for the admin programme panel. Read-only: it proposes, a human
-- attaches. Same city, starting inside the umbrella's span, not already attached.
DROP FUNCTION IF EXISTS public.event_programme_candidates(uuid, integer);
CREATE FUNCTION public.event_programme_candidates(p_event_id uuid, p_limit integer DEFAULT 40)
 RETURNS TABLE (
   id uuid, slug text, title text, start_date timestamptz, end_date timestamptz,
   event_type text, venue_name text, data_source text
 )
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with umbrella as (
    select e.id, e.city_id, e.city, e.start_date,
           coalesce(e.end_date, e.start_date) as end_date
    from public.events e
    where e.id = p_event_id and e.parent_event_id is null
  )
  select c.id, c.slug, c.title, c.start_date, c.end_date,
         c.event_type, c.venue_name, c.data_source
  from public.events c, umbrella u
  where c.id <> u.id
    and c.parent_event_id is null
    and c.duplicate_of_id is null
    and coalesce(c.status, '') <> 'archived'
    and (
      (u.city_id is not null and c.city_id = u.city_id)
      or (u.city_id is null and u.city is not null and lower(c.city) = lower(u.city))
    )
    -- A satellite may open a few days before the umbrella's own span and run a
    -- little past it; the window is deliberately wider than the span itself.
    and c.start_date >= u.start_date - interval '10 days'
    and c.start_date <= u.end_date + interval '10 days'
    and not exists (select 1 from public.events k where k.parent_event_id = c.id)
  order by c.start_date, c.title
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$function$;

COMMENT ON FUNCTION public.event_programme_candidates(uuid, integer) IS
  'Suggestion list for a programme-editing admin panel: unattached events in the umbrella''s city and date window. Proposes only -- attaching is a human action.';

GRANT EXECUTE ON FUNCTION public.event_programme(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.event_programme_candidates(uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Merge core learns about the programme link
-- ---------------------------------------------------------------------------
-- Full re-transcription of the definition from 20260801000000, with two additions
-- marked PROGRAMME below. A merge here is SOFT (duplicate_of_id), so children of a
-- dropped event keep a live FK to a hidden row unless they are repointed.
CREATE OR REPLACE FUNCTION public._event_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
        v_keep_parent uuid; v_drop_parent uuid;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id, parent_event_id into v_keep_dup, v_keep_parent from public.events where id = p_keep_id;
  if not found then raise exception 'keep event % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep event is itself a duplicate'; end if;
  select duplicate_of_id, slug, parent_event_id into v_drop_dup, v_drop_slug, v_drop_parent from public.events where id = p_drop_id;
  if not found then raise exception 'drop event % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop event already merged'; end if;

  -- PROGRAMME: an umbrella and its own child are structure, never duplicates.
  if v_keep_parent = p_drop_id or v_drop_parent = p_keep_id then
    raise exception 'events % and % are an umbrella and its programme child, not duplicates', p_keep_id, p_drop_id;
  end if;

  -- conflict-safe (unique-scoped) reparents
  update public.event_attendees a set event_id = p_keep_id where a.event_id = p_drop_id
    and not exists (select 1 from public.event_attendees k where k.event_id = p_keep_id and k.user_id = a.user_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('event_attendees', n);

  update public.guide_picks g set entity_id = p_keep_id
    where g.entity_type = 'event' and g.entity_id = p_drop_id
    and not exists (select 1 from public.guide_picks k
                    where k.guide_id = g.guide_id and k.entity_type = 'event' and k.entity_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('guide_picks', n);

  update public.event_occurrences o set master_event_id = p_keep_id where o.master_event_id = p_drop_id
    and not exists (select 1 from public.event_occurrences k where k.master_event_id = p_keep_id and k.occurrence_start = o.occurrence_start);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('event_occurrences', n);

  -- direct reparents (no colliding unique on the FK column)
  update public.event_sources set event_id = p_keep_id where event_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('event_sources', n);
  update public.trip_places set event_id = p_keep_id where event_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_places', n);

  -- PROGRAMME: the dropped row's children follow the surviving umbrella. Skipped
  -- when the keep row is itself a child, which the depth guard would reject.
  if v_keep_parent is null then
    update public.events set parent_event_id = p_keep_id, updated_at = now()
      where parent_event_id = p_drop_id and id <> p_keep_id;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('programme_children', n);
  end if;

  if v_drop_slug is not null then
    insert into public.event_slug_redirects (old_slug, event_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set event_id = excluded.event_id;
  end if;

  update public.events set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  update public.events set duplicate_of_id = p_keep_id, updated_at = now()
    where duplicate_of_id = p_drop_id and id <> p_keep_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('event', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','event','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;
