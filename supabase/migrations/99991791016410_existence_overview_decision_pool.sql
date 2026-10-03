-- /admin/content/liveness showed four numbers per type and only three of them
-- came from the same population. "Dead signals (120d)" sat under "Flagged for
-- review", "Auto-archived (7d)" and "Currently archived" -- three decision
-- counts -- and was read as the pool those decisions are drawn from. It is not,
-- for two independent reasons, and the gap is not small:
--
--     type          card showed    engine's actual pool    overstated by
--     event              43,258                       3        14,419x
--     marketplace         2,690                     835            3.2x
--     venue                 308                      91            3.4x
--
-- Cause 1 -- it counted signal kinds the decision cannot act on. The strong set
-- in run_existence_decision is http_status, jsonld_status,
-- content_closed_phrase, external_wikidata, price_availability, admin.
-- date_lifecycle is NOT in it, and 43,253 of the 43,258 events are exactly that:
-- run_event_date_lifecycle recording that the event's date has passed. On this
-- corpus a past date is not a defect -- events deliberately holds ~36.5k past
-- events from the Wayback import -- so the engine is right to ignore them, and
-- the card was wrong to count them. An operator reading "43,258 dead signals /
-- 1 flagged" concludes the engine has stalled on 43k rows. It has not.
--
-- Cause 2 -- it counted HISTORY, not state. run_existence_decision reduces to
-- the LATEST signal per (entity, kind) before deciding, so an entity whose link
-- was broken in August and has answered 200 ever since contributes nothing.
-- The old count included it forever, for 120 days. This is the half that was
-- inflating venue and marketplace, where every signal is http_status and
-- cause 1 does not apply at all.
--
-- The fix is not to delete the information. dead_signal_entities now means what
-- the column header implies -- entities the engine currently reads as dead on a
-- kind it can act on -- and the old quantity survives under its own honest key,
-- dead_signals_any_kind, where nothing reads it as a backlog. archive_eligible
-- is added because it is the one number that predicts work: >=2 strong dead
-- with no fresher alive signal is what auto-archives tonight.
--
-- Second defect, same class. The Blind spots card says "Live entities the
-- engine cannot verify" and renders a per-type sample of 50 -- its LIMIT is
-- applied per branch, so p_limit=50 yields up to 150 badges. The real totals
-- are 3,881 venues and 532 events. 100 badges with no denominator reads as the
-- whole set; it is 2.3% of it. blind_spots now carries the per-type total so
-- the badge wall is legible as the sample it always was.
--
-- ONE SOURCE PER RULE. The strong-kind array and the blind-spot predicate each
-- now live in exactly one function, because the alternative is two copies that
-- drift -- the failure this repo has recorded on the haversine casts and on
-- every rule it has had to assert by COUNT rather than by presence.
-- run_existence_decision is deliberately NOT restated to consume the helper:
-- its body is ~250 lines and the sole writer of archive decisions for three
-- entity types, so a transcription slip there is far more expensive than the
-- duplication. The copies are held together by a postcondition on the DEPLOYED
-- body instead.

-- The strong set: signal kinds a dead verdict on which can archive or flag an
-- entity. Mirrors v_strong in run_existence_decision; the drift postcondition
-- at the bottom of this file is what keeps the two honest.
create or replace function public.existence_strong_signal_kinds()
returns text[]
language sql
immutable
parallel safe
set search_path to 'public', 'pg_temp'
as $$
  select array['http_status','jsonld_status','content_closed_phrase',
               'external_wikidata','price_availability','admin']::text[]
$$;

comment on function public.existence_strong_signal_kinds() is
  'Signal kinds whose dead verdict the existence engine acts on. One source for '
  'existence_overview and the drift check against run_existence_decision''s v_strong. '
  'date_lifecycle is deliberately absent: a past event date is not evidence the event '
  'never happened, and on this corpus most events are deliberately in the past.';

-- The blind-spot predicate, extracted so the COUNT on the overview card and the
-- LIST on the blind-spots card cannot disagree. Predicates are copied verbatim
-- from the existence_blind_spots body this migration replaces -- extracting a
-- rule and changing it in the same breath is how a count stops matching its own
-- list.
create or replace function public.existence_blind_spot_ids(p_entity_type text default null)
returns table(entity_type text, entity_id uuid)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select 'venue'::text, v.id
    from public.venues v
   where v.closed_at is null and v.duplicate_of_id is null
     and v.website is null and (v.latitude is null or v.longitude is null)
     and (p_entity_type is null or p_entity_type = 'venue')
  union all
  select 'event'::text, e.id
    from public.events e
   where e.status not in ('cancelled','completed') and e.duplicate_of_id is null
     and e.website is null
     and (p_entity_type is null or p_entity_type = 'event')
  union all
  select 'marketplace'::text, m.id
    from public.marketplace_listings m
   where m.status in ('active','sold_out') and m.duplicate_of_id is null
     and m.external_url is null and m.affiliate_url is null
     and (p_entity_type is null or p_entity_type = 'marketplace')
$$;

comment on function public.existence_blind_spot_ids(text) is
  'Un-probeable live entities: no reference the existence engine can fetch. SECURITY '
  'INVOKER and revoked from every client role -- reachable only through the gated '
  'definers existence_blind_spots and existence_overview, which is why it carries no '
  'role check of its own.';

-- CREATE FUNCTION grants EXECUTE to PUBLIC, so this is a revoke, not a tidy-up.
-- check-anon-function-grants.mjs is scoped to VOLATILE definers and is
-- structurally blind to both of these, so it cannot catch a regression here --
-- the postcondition below is the check.
revoke all on function public.existence_strong_signal_kinds() from public;
revoke all on function public.existence_blind_spot_ids(text) from public;
grant execute on function public.existence_strong_signal_kinds() to service_role;
grant execute on function public.existence_blind_spot_ids(text) to service_role;

-- Unchanged behaviour: same signature, same role gate, same per-type LIMIT.
-- Only the predicate moved out.
create or replace function public.existence_blind_spots(p_entity_type text default null,
                                                        p_limit integer default 50)
returns table(entity_type text, entity_id uuid, label text, slug text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.has_any_role_jwt(array['admin','moderator']::app_role[]) then
    raise exception 'admin only';
  end if;
  return query
  (select b.entity_type, b.entity_id, v.name, v.slug
     from public.existence_blind_spot_ids('venue') b
     join public.venues v on v.id = b.entity_id
    where p_entity_type is null or p_entity_type = 'venue'
    limit case when p_entity_type is null or p_entity_type='venue'
               then greatest(1, least(p_limit, 200)) else 0 end)
  union all
  (select b.entity_type, b.entity_id, e.title, e.slug
     from public.existence_blind_spot_ids('event') b
     join public.events e on e.id = b.entity_id
    where p_entity_type is null or p_entity_type = 'event'
    limit case when p_entity_type is null or p_entity_type='event'
               then greatest(1, least(p_limit, 200)) else 0 end)
  union all
  (select b.entity_type, b.entity_id, m.title, m.slug
     from public.existence_blind_spot_ids('marketplace') b
     join public.marketplace_listings m on m.id = b.entity_id
    where p_entity_type is null or p_entity_type = 'marketplace'
    limit case when p_entity_type is null or p_entity_type='marketplace'
               then greatest(1, least(p_limit, 200)) else 0 end);
end $function$;

create or replace function public.existence_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v jsonb;
  v_strong text[] := public.existence_strong_signal_kinds();
begin
  if not public.has_any_role_jwt(array['admin','moderator']::app_role[]) then
    raise exception 'admin only';
  end if;

  -- Reduce to the latest signal per (entity, kind) exactly as
  -- run_existence_decision does, so the card reports the engine's own reading
  -- rather than a superset of it.
  with latest as (
    select distinct on (s.entity_type, s.entity_id, s.signal_kind)
           s.entity_type, s.entity_id, s.signal_kind, s.verdict, s.observed_at
      from public.entity_existence_signals s
     where s.observed_at > now() - interval '120 days'
     order by s.entity_type, s.entity_id, s.signal_kind, s.observed_at desc
  ), agg as (
    select l.entity_type, l.entity_id,
           count(*) filter (where l.verdict='dead' and l.signal_kind = any(v_strong)) as strong_dead,
           max(l.observed_at) filter (where l.verdict='dead' and l.signal_kind = any(v_strong)) as newest_dead_at,
           max(l.observed_at) filter (where l.verdict='alive') as fresh_alive_at
      from latest l
     group by l.entity_type, l.entity_id
  ), blind as (
    select b.entity_type, count(*) as n
      from public.existence_blind_spot_ids(null) b
     group by b.entity_type
  ), per_type as (
    select et as entity_type, jsonb_build_object(
      'flagged', (select count(*) from public.entity_existence_audit a
                   where a.entity_type=et and a.action='flag' and a.reverted_at is null),
      'auto_archived_7d', (select count(*) from public.entity_existence_audit a
                   where a.entity_type=et and a.action='archive' and a.reverted_at is null
                     and a.created_at > now() - interval '7 days'),
      'open_archives', (select count(*) from public.entity_existence_audit a
                   where a.entity_type=et and a.action='archive' and a.reverted_at is null),
      -- The engine's current working set: latest-state, strong-kind only.
      'dead_signal_entities', (select count(*) from agg g
                   where g.entity_type=et and g.strong_dead >= 1),
      -- What auto-archives on the next run, same predicate as the decision.
      'archive_eligible', (select count(*) from agg g
                   where g.entity_type=et and g.strong_dead >= 2
                     and (g.fresh_alive_at is null or g.fresh_alive_at <= g.newest_dead_at)),
      -- The old dead_signal_entities, kept rather than deleted: every kind, any
      -- point in the window. Useful as throughput, never as a backlog.
      'dead_signals_any_kind', (select count(distinct s.entity_id)
                   from public.entity_existence_signals s
                   where s.entity_type=et and s.verdict='dead'
                     and s.observed_at > now() - interval '120 days'),
      -- Denominator for the Blind spots card, which renders a sample of 50.
      'blind_spots', (select coalesce((select b.n from blind b where b.entity_type=et), 0))
    ) as obj
      from unnest(array['venue','event','marketplace']) et
  )
  select jsonb_object_agg(p.entity_type, p.obj) into v from per_type p;

  return coalesce(v, '{}'::jsonb);
end $function$;

do $verify$
declare
  v_src text;
  v_kind text;
  v_missing text[] := '{}';
  v_bad int;
  v_ov jsonb;
begin
  -- P1 DRIFT. Every kind the helper names must still appear in the deployed
  --    run_existence_decision body. This is what lets that 250-line function
  --    keep its own literal array without the two silently diverging: widen the
  --    helper and forget the decision, or narrow the decision and forget the
  --    helper, and this fails. Read from the catalog, not the repo file, because
  --    a later CREATE OR REPLACE from an older migration is exactly the drift
  --    being guarded.
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_existence_decision';
  if v_src is null then
    raise exception 'P1 failed: run_existence_decision not found';
  end if;
  foreach v_kind in array public.existence_strong_signal_kinds() loop
    if position('''' || v_kind || '''' in v_src) = 0 then
      v_missing := v_missing || v_kind;
    end if;
  end loop;
  if cardinality(v_missing) > 0 then
    raise exception 'P1 failed: run_existence_decision no longer names strong kind(s) %', v_missing;
  end if;

  -- P1b The inverse. date_lifecycle must NOT be in the strong set -- that is the
  --     whole defect this file fixes, and a later edit adding it would put 43k
  --     past events back into the decision pool.
  if 'date_lifecycle' = any(public.existence_strong_signal_kinds()) then
    raise exception 'P1b failed: date_lifecycle is in the strong set; past events would archive';
  end if;

  -- P2 The new keys exist on every type, and the corrected count is <= the old
  --    one by construction (a subset of kinds, reduced to latest state). Equality
  --    is legitimate -- venue and marketplace only ever see http_status -- so this
  --    asserts the direction, not a difference.
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","user_role":"admin","app_metadata":{"roles":["admin"]}}', true);
  v_ov := public.existence_overview();
  select count(*) into v_bad
    from jsonb_each(v_ov) t(k, o)
   where not (o ? 'dead_signal_entities' and o ? 'dead_signals_any_kind'
              and o ? 'archive_eligible' and o ? 'blind_spots'
              and o ? 'flagged' and o ? 'open_archives' and o ? 'auto_archived_7d');
  if v_bad <> 0 then
    raise exception 'P2 failed: % type(s) missing an overview key', v_bad;
  end if;
  select count(*) into v_bad
    from jsonb_each(v_ov) t(k, o)
   where (o->>'dead_signal_entities')::int > (o->>'dead_signals_any_kind')::int;
  if v_bad <> 0 then
    raise exception 'P2 failed: % type(s) report more decision-pool than total dead signals', v_bad;
  end if;

  -- P3 The events card is the one that was 14,419x out. Assert the correction
  --    landed where it mattered: the decision pool must be a small fraction of
  --    the lifecycle-inflated figure, not merely present.
  if (v_ov->'event'->>'dead_signals_any_kind')::int > 1000
     and (v_ov->'event'->>'dead_signal_entities')::int
         > (v_ov->'event'->>'dead_signals_any_kind')::int / 10 then
    raise exception 'P3 failed: events decision pool (%) is not materially below the any-kind count (%)',
      v_ov->'event'->>'dead_signal_entities', v_ov->'event'->>'dead_signals_any_kind';
  end if;

  -- P4 The blind-spot COUNT must equal its own LIST, which is the only thing
  --    that makes the denominator trustworthy. Compared per type against the
  --    extracted predicate rather than against a literal, so the check survives
  --    the corpus moving.
  select count(*) into v_bad
    from jsonb_each(v_ov) t(k, o)
   where (o->>'blind_spots')::int
         <> (select count(*) from public.existence_blind_spot_ids(t.k));
  if v_bad <> 0 then
    raise exception 'P4 failed: blind_spots count disagrees with the predicate for % type(s)', v_bad;
  end if;

  -- P5 Neither helper may be reachable by a client role. Asserted, because the
  --    repo's anon-grant sweep only inspects VOLATILE definers and cannot see
  --    a STABLE invoker or an IMMUTABLE sql function.
  select count(*) into v_bad
    from (values ('existence_strong_signal_kinds'), ('existence_blind_spot_ids')) f(fn),
         (values ('anon'), ('authenticated')) r(role)
   where has_function_privilege(r.role, (
           select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname=f.fn limit 1), 'EXECUTE');
  if v_bad <> 0 then
    raise exception 'P5 failed: % client-role grant(s) remain on the existence helpers', v_bad;
  end if;
end $verify$;
