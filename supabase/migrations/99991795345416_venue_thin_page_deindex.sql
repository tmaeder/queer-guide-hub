-- Venue thin-page deindex (SEO Phase 2, 2026-11-22).
--
-- MEASURED before writing (live = duplicate_of_id is null, review_status <> 'archived',
-- closed_at is null): of 102,929 live seo_indexable venues, 83,025 carry no substance --
-- 26,888 of the 46,189 that sitemap-venues.xml lists (non-safety-gated) and 56,137 of
-- the 56,740 safety-gated ones. The bot body for such a page is a name, a city and nav.
--
-- "Has substance" (venue_has_substance below):
--   a description of >= 150 chars, OR
--   an address AND a real category (not 'other') AND at least one of
--   opening hours / phone / website / a rating / an image.
--
-- run_venue_thin_page_recompute(p_batch) moves rows both ways, self-healing:
--   * live + indexable + no substance       -> seo_indexable=false, seo_deindex_reason='thin'
--   * reason='thin' + live + substance now  -> seo_indexable=true,  seo_deindex_reason=null
-- It NEVER touches a row deindexed for any other reason (reason is null or not 'thin'),
-- so a closed, archived or hand-deindexed venue is never re-published by this job.
--
-- Batch hard-capped at 300: every venues UPDATE fans out through the unscoped
-- trg_search_documents_venue (search-trigger discipline, see CLAUDE.md). The ~83k
-- backlog therefore drains over ~2 days at */10; steady state is a handful of rows.
-- Safety-gated venues are included deliberately: the gate is geographic and can lift,
-- and when it does the row's indexability should already reflect its content.

alter table public.venues add column if not exists seo_deindex_reason text;

comment on column public.venues.seo_deindex_reason is
  'Why seo_indexable is false, when a job set it. ''thin'' = run_venue_thin_page_recompute; '
  'only that job may restore a row carrying it.';

create or replace function public.venue_has_substance(
  p_description text, p_address text, p_category text, p_hours jsonb, p_phone text,
  p_website text, p_foursquare numeric, p_tripadvisor numeric, p_tomtom numeric,
  p_images text[])
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce(length(btrim(p_description)), 0) >= 150
      or (nullif(btrim(p_address), '') is not null
          and coalesce(p_category, 'other') <> 'other'
          and (   (jsonb_typeof(p_hours) = 'object'
                   and p_hours ?| array['mon','tue','wed','thu','fri','sat','sun','display'])
               or (jsonb_typeof(p_hours) = 'string' and length(p_hours #>> '{}') > 2)
               or nullif(btrim(p_phone), '') is not null
               or nullif(btrim(p_website), '') is not null
               or coalesce(p_foursquare, p_tripadvisor, p_tomtom) is not null
               or coalesce(cardinality(p_images), 0) > 0));
$$;

create or replace function public.run_venue_thin_page_recompute(p_batch int default 300)
returns table(deindexed int, reindexed int)
language plpgsql
set search_path to ''
as $$
declare
  v_batch int := least(greatest(coalesce(p_batch, 300), 1), 300);
  v_off int := 0;
  v_on int := 0;
begin
  with c as (
    select v.id
      from public.venues v
     where v.seo_indexable is true
       and v.duplicate_of_id is null
       and v.closed_at is null
       and coalesce(v.review_status, '') <> 'archived'
       and not public.venue_has_substance(v.description, v.address, v.category, v.hours,
             v.phone, v.website, v.foursquare_rating, v.tripadvisor_rating,
             v.tomtom_rating, v.images)
     limit v_batch
     for update skip locked)
  update public.venues v
     set seo_indexable = false, seo_deindex_reason = 'thin'
    from c where v.id = c.id;
  get diagnostics v_off = row_count;

  with c as (
    select v.id
      from public.venues v
     where v.seo_deindex_reason = 'thin'
       and v.seo_indexable is false
       and v.duplicate_of_id is null
       and v.closed_at is null
       and coalesce(v.review_status, '') <> 'archived'
       and public.venue_has_substance(v.description, v.address, v.category, v.hours,
             v.phone, v.website, v.foursquare_rating, v.tripadvisor_rating,
             v.tomtom_rating, v.images)
     limit v_batch
     for update skip locked)
  update public.venues v
     set seo_indexable = true, seo_deindex_reason = null
    from c where v.id = c.id;
  get diagnostics v_on = row_count;

  return query select v_off, v_on;
end;
$$;

revoke all on function public.run_venue_thin_page_recompute(int) from public, anon, authenticated;
grant execute on function public.run_venue_thin_page_recompute(int) to service_role;
revoke all on function public.venue_has_substance(text, text, text, jsonb, text, text, numeric, numeric, numeric, text[]) from public, anon, authenticated;
grant execute on function public.venue_has_substance(text, text, text, jsonb, text, text, numeric, numeric, numeric, text[]) to service_role;

insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('venue_thin_page_recompute', 'Venue thin-page deindex',
        'Every 10 min, 300 rows: deindexes live venues with no substance (no 150-char description and no address+category+contact/hours/rating/image) and re-indexes the ones it deindexed once they gain it. Never touches a venue deindexed for another reason.',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"run_venue_thin_page_recompute"}'::jsonb, '*/10 * * * *')
on conflict (slug) do update set schedule = excluded.schedule, enabled = excluded.enabled,
  description = excluded.description, name = excluded.name, action = excluded.action,
  trigger = excluded.trigger;

select cron.schedule('venue_thin_page_recompute', '*/10 * * * *',
  $cron$ select public.run_venue_thin_page_recompute(300); $cron$);

-- Postconditions: END STATE only. No backlog count is asserted -- the corpus moves.
do $verify$
declare
  v_bad int;
  r record;
begin
  -- P1: the predicate agrees with the measured definition on fixed inputs.
  if public.venue_has_substance(repeat('x', 150), null, null, null, null, null, null, null, null, null) is not true
     or public.venue_has_substance('short', 'Main St 1', 'bar', null, '+4111', null, null, null, null, null) is not true
     or public.venue_has_substance('short', 'Main St 1', 'other', null, '+4111', null, null, null, null, null) is not false
     or public.venue_has_substance('short', 'Main St 1', 'bar', '{"source":"x"}'::jsonb, null, null, null, null, null, null) is not false
     or public.venue_has_substance('short', null, 'bar', null, '+4111', null, 4.5, null, null, null) is not false
  then
    raise exception 'P1 failed: venue_has_substance disagrees with its definition';
  end if;

  -- P2: one batch runs and returns counts (proves the function executes).
  select * into r from public.run_venue_thin_page_recompute(300);
  if r.deindexed is null or r.reindexed is null then
    raise exception 'P2 failed: run_venue_thin_page_recompute returned null counts';
  end if;

  -- P3: nothing carries reason 'thin' while still indexable.
  select count(*) into v_bad from public.venues
   where seo_deindex_reason = 'thin' and seo_indexable is true;
  if v_bad <> 0 then
    raise exception 'P3 failed: % venues carry reason thin but are indexable', v_bad;
  end if;

  -- P4: the registry row and the cron exist and agree.
  select count(*) into v_bad from public.admin_automations
   where slug = 'venue_thin_page_recompute' and enabled and action->>'fn' = 'run_venue_thin_page_recompute';
  if v_bad <> 1 then
    raise exception 'P4 failed: admin_automations row missing or disabled';
  end if;
  select count(*) into v_bad from cron.job
   where jobname = 'venue_thin_page_recompute' and active
     and command ilike '%run_venue_thin_page_recompute(300)%';
  if v_bad <> 1 then
    raise exception 'P4 failed: cron job missing or inactive';
  end if;
end
$verify$;
