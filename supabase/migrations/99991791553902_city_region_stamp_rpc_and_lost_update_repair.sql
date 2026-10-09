-- backfill-city-region: write the region stamp server-side, and restore the
-- keys its lost update dropped.
--
-- WHY
-- scripts/data-quality/backfill-city-region.mjs reads `enrichment_status` when
-- a run starts and, ~35 minutes later, PATCHes the WHOLE object back with its
-- `region_reverse` stamp merged in client-side. Any key another writer added
-- in between is silently deleted. Measured over the five runs of 2026-10-09
-- (4,210 cities written) via content_revisions — keys present before the
-- script's write and absent after it:
--   admin_unit_review   2  (Tinet ward, Causeway Coast and Glens) — this is
--                          what aborted 99991791538336's P5 and blocked
--                          db push for the repo;
--   merge_flags         2  (the merged "Municipal Unit of Rhodes" and
--                          "Rustenburg Local Municipality" rows) — read by
--                          cities_merge_redirect on unmerge to restore
--                          shell_status / seo_indexable; without it an unmerge
--                          falls back to guesses;
--   agentic_skip        1  (Langenwang) — a cursor stamp, cheap but restored.
-- Low count only because the window was short; the defect hits every key any
-- concurrent writer touches during a run.
--
-- WHAT
-- 1. city_stamp_region_reverse(id, region_name, stamp): merges ONE key with
--    `||` in the UPDATE itself, so concurrent keys survive. service_role only.
--    The script switches to it in the same change.
-- 2. Restores the three non-flag keys from content_revisions.before, only
--    where the key is still absent (admin_unit_review is restored by
--    99991791538336 itself).

create or replace function public.city_stamp_region_reverse(
  p_id uuid,
  p_region_name text,
  p_stamp jsonb
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n int;
begin
  if p_stamp is null or jsonb_typeof(p_stamp) <> 'object' then
    raise exception 'city_stamp_region_reverse: stamp must be a json object';
  end if;
  if p_region_name is not null then
    -- Resolved: write the region only if nobody filled it meanwhile.
    update public.cities
       set region_name = p_region_name,
           enrichment_status = coalesce(enrichment_status, '{}'::jsonb)
             || jsonb_build_object('region_reverse', p_stamp)
     where id = p_id and region_name is null;
  else
    -- Unplaced: stamp only while the city still has no region code.
    update public.cities
       set enrichment_status = coalesce(enrichment_status, '{}'::jsonb)
             || jsonb_build_object('region_reverse', p_stamp)
     where id = p_id and region_code is null;
  end if;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

revoke all on function public.city_stamp_region_reverse(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.city_stamp_region_reverse(uuid, text, jsonb) to service_role;

do $repair$
declare
  v_restored int;
begin
  perform set_config('app.actor', 'migration:99991791553902_city_region_stamp_rpc_and_lost_update_repair', true);

  with lost as (
    select distinct on (r.source_id, k)
           r.source_id, k, r.before->'enrichment_status'->k as val
      from public.content_revisions r,
           jsonb_object_keys(coalesce(r.before->'enrichment_status', '{}'::jsonb)) k
     where r.source_table = 'cities'
       and r.created_at between '2026-10-09 06:39' and '2026-10-09 10:30'
       and 'enrichment_status' = any(r.changed_fields)
       and ('region_name' = any(r.changed_fields) or (r.after->'enrichment_status') ? 'region_reverse')
       and not (coalesce(r.after->'enrichment_status', '{}'::jsonb) ? k)
       and k in ('merge_flags', 'agentic_skip')
     order by r.source_id, k, r.seq desc
  )
  update public.cities c
     set enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb) || jsonb_build_object(l.k, l.val)
    from lost l
   where c.id = l.source_id
     and not (coalesce(c.enrichment_status, '{}'::jsonb) ? l.k);
  get diagnostics v_restored = row_count;
  raise notice 'lost-update repair: restored % key(s)', v_restored;

  -- P1: both merged rows carry merge_flags again (unmerge depends on it).
  if exists (select 1 from public.cities
              where id in ('f03a446f-0e34-4dca-a20c-c8e9abe88107', 'e6b3ec42-9708-4f6b-87a2-8d2b6757f4e4')
                and duplicate_of_id is not null
                and not (coalesce(enrichment_status, '{}'::jsonb) ? 'merge_flags')) then
    raise exception 'P1 failed: a merged city still has no merge_flags';
  end if;

  -- P2: the RPC is not reachable by anon or authenticated.
  if has_function_privilege('anon', 'public.city_stamp_region_reverse(uuid, text, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.city_stamp_region_reverse(uuid, text, jsonb)', 'execute') then
    raise exception 'P2 failed: city_stamp_region_reverse is callable by a client role';
  end if;
end
$repair$;
