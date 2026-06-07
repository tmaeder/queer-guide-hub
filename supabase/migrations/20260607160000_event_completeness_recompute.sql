-- Event completeness recompute (P1): recompute events.quality_score from the
-- LIVE row so structural backfills (P0) and image harvest (P1) actually lift the
-- completeness signal that run_event_trust_recompute() consumes.
--
-- Rubric mirrors pipeline-quality-score computeScore() (the staging-time scorer),
-- adapted to live columns: events has no tags column, so the 10 tag points are
-- reallocated to end_date — a genuine completeness dimension. Max 100.
--   title       20  (>0:10, >10:10)
--   description 20  (>0:10, >50:10)
--   location    20  (lat&lng:10, city|country:10)
--   url         10  (ticket_url|website)
--   images      10
--   contacts    10  (website:5, organizer_contact:5)
--   end_date    10

create or replace function public.run_event_completeness_recompute()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_updated bigint;
begin
  with scored as (
    select
      e.id,
      least(100,
        (case when length(coalesce(trim(e.title),'')) > 0  then 10 else 0 end)
      + (case when length(coalesce(trim(e.title),'')) > 10 then 10 else 0 end)
      + (case when length(coalesce(trim(e.description),'')) > 0  then 10 else 0 end)
      + (case when length(coalesce(trim(e.description),'')) > 50 then 10 else 0 end)
      + (case when e.latitude is not null and e.longitude is not null then 10 else 0 end)
      + (case when coalesce(trim(e.city),'') <> '' or coalesce(trim(e.country),'') <> '' then 10 else 0 end)
      + (case when e.ticket_url is not null or e.website is not null then 10 else 0 end)
      + (case when e.images is not null and array_length(e.images,1) >= 1 then 10 else 0 end)
      + (case when e.website is not null then 5 else 0 end)
      + (case when coalesce(trim(e.organizer_contact),'') <> '' then 5 else 0 end)
      + (case when e.end_date is not null then 10 else 0 end)
      )::smallint as score
    from public.events e
    where e.duplicate_of_id is null
  )
  update public.events e
  set quality_score = s.score
  from scored s
  where e.id = s.id
    and e.quality_score is distinct from s.score;
  get diagnostics v_updated = row_count;

  return jsonb_build_object('updated', v_updated);
end;
$$;

grant execute on function public.run_event_completeness_recompute() to service_role;

-- Run once now so P0 backfills are reflected immediately.
select public.run_event_completeness_recompute();
