-- Give the ladder a third exit: provably distinct.
--
-- `run_dedup_truth_sweep` has two outcomes -- merge, or park in a human queue. So a
-- pair it has ALREADY judged to be two different businesses is filed next to a pair it
-- genuinely cannot decide, and both wait for a person. 1,455 pairs are open, the venue
-- arm has been pinned at its 200/night cap on 5 of the last 6 nights, and the number of
-- human decisions since 2026-08-17 is zero. A queue that only ever grows is not a queue.
--
-- 373 of the 1,159 open venue pairs carry `reason = 'identity_conflict'`, which is the
-- ladder's own verdict that an identity signal CONTRADICTS: different street, different
-- domain, or different phone. Those are chains and branches -- The Garage in Columbus and
-- in Las Vegas, Flex in Raleigh and Los Angeles, Erotixx in Berlin and Aachen.
--
-- THIS IS NOT A BLANKET CLOSE OF THAT BUCKET, and the measurement is why. Hand-reading
-- 12 identity_conflict pairs at random gave ~7 clearly distinct, ~3 likely duplicates
-- blocked by address-format noise, 2 genuinely ambiguous -- closing the bucket would
-- permanently discard roughly a quarter real duplicates. The arm is narrowed until a
-- hand-read sample is clean, and each narrowing below was forced by rows, not by taste:
--
--   * DIFFERENT CITY + DIFFERENT STREET KEY + (different domain OR different phone)
--     143 pairs. Sampling 20: 18 right, 2 wrong.
--   * ...AND BOTH ADDRESSES CARRY A HOUSE NUMBER            -> 132 pairs.
--     Both errors were the same shape: the drop row's "address" was the junk string
--     `Bars`, which `dedup_street_key` happily turns into a key that differs from a real
--     street. `dedup_house_number` is the cheap test for "this is an address at all".
--     Re-sampling 22: 20 right, 2 wrong.
--   * ...AND THE TWO CITIES ARE > 25 km APART               -> 122 pairs.
--     Both remaining errors were a DISTRICT vs ITS PARENT CITY, where the address really
--     is the same and only the spelling differs: `DJ Station`, Bang Rak (a district of
--     Bangkok) -- "8/6-8 Si Lom 2" vs "8/6-8 Silom Road, Soi 2" -- and `Cabaretito Neón`,
--     Cuauhtémoc (a borough of Mexico City) -- "Londres 161" vs "C/. Londres 161-20A".
--     A different `city_id` is not evidence of a different PLACE when one city contains
--     the other, and city-centroid distance is the proxy that needs no containment table.
--
-- Applied to the live queue that veto removes exactly ten pairs, and they are all one
-- class -- the two above plus five more of the same shape the sample had not reached
-- (The King's Arms London/Soho 1.2 km, Botas Bar and Cabarétito Fusion in Mexico City,
-- B S West Scottsdale/Phoenix 14.8 km, Sparkles Showbar 18 km inside one municipality)
-- and three `Europa92` rows whose cities have no coordinates at all. Missing coordinates
-- FAIL SAFE: unprovable distance is not permission to close.
--
-- WHY status='rejected' AND NOT A NEW 'distinct' STATUS. A new status was the first
-- design and it is wrong here for a mechanical reason: the sweep's memory of past
-- decisions is `status = 'rejected'`, and the open-pair unique index only covers
-- `WHERE status='open'`. A pair closed under any other value would be re-inserted as open
-- by the very next nightly run, so the queue would not shrink and the work would repeat
-- nightly forever. Introducing 'distinct' properly means restating the whole 700-line
-- sweep to widen that predicate, which is a much larger blast radius than this change
-- earns. Machine closes stay distinguishable from human ones by `reviewer_id IS NULL`
-- together with the `auto-distinct:` prefix on `reviewer_note`, which also records the
-- evidence -- so a human can audit, and re-open, any row this ever touched.
--
-- SEPARATE FUNCTION, NOT AN ARM INSIDE THE SWEEP, for the same blast-radius reason and
-- one better one: finding candidate pairs and dispositioning already-queued ones are
-- different jobs with different cadences. This one only ever reads `dedup_review_queue`
-- and only ever moves `open` -> `rejected`; it cannot merge anything.

CREATE OR REPLACE FUNCTION public.run_dedup_close_distinct(
  p_limit integer DEFAULT 200,
  p_dry_run boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_closed int := 0; v_ids uuid[]; v_sample jsonb;
begin
  with cand as (
    select q.id,
           k.name kn, k.city kc, d.city dc,
           round(public.haversine_m(kc2.latitude, kc2.longitude, dc2.latitude, dc2.longitude)) city_m,
           case
             when k.phone is not null and d.phone is not null and k.phone <> d.phone then 'phone'
             else 'domain'
           end evidence
      from public.dedup_review_queue q
      join public.venues k on k.id = q.keep_id
      join public.venues d on d.id = q.drop_id
      left join public.cities kc2 on kc2.id = k.city_id
      left join public.cities dc2 on dc2.id = d.city_id
     where q.status = 'open'
       and q.entity_type = 'venue'
       and q.reason = 'identity_conflict'
       -- different city, and provably a different PLACE, not a district of the same one
       and k.city_id is not null and d.city_id is not null and k.city_id <> d.city_id
       and public.haversine_m(kc2.latitude, kc2.longitude, dc2.latitude, dc2.longitude) > 25000
       -- two real street addresses that disagree. `dedup_street_key('')` returns '' and
       -- 6,049 of 26,688 live venues carry a blank address, so the emptiness test is not
       -- optional; the house number is what makes it an address rather than a label.
       and nullif(btrim(coalesce(public.dedup_street_key(k.address), '')), '') is not null
       and nullif(btrim(coalesce(public.dedup_street_key(d.address), '')), '') is not null
       and public.dedup_street_key(k.address) <> public.dedup_street_key(d.address)
       and public.dedup_house_number(k.address) is not null
       and public.dedup_house_number(d.address) is not null
       -- and an identity signal that actively contradicts
       and (
         (k.website is not null and d.website is not null
          and lower(regexp_replace(split_part(split_part(k.website,'//',2),'/',1),'^www\.','')) <>
              lower(regexp_replace(split_part(split_part(d.website,'//',2),'/',1),'^www\.','')))
         or (k.phone is not null and d.phone is not null and k.phone <> d.phone)
       )
     order by q.created_at
     limit greatest(p_limit, 0)
  )
  select array_agg(id),
         coalesce(jsonb_agg(jsonb_build_object('name', kn, 'keep_city', kc, 'drop_city', dc,
                                               'city_km', round(city_m/1000.0), 'evidence', evidence)
                            order by kn) filter (where true), '[]'::jsonb)
    into v_ids, v_sample
    from cand;

  if p_dry_run then
    return jsonb_build_object('mode','dry_run','would_close', coalesce(array_length(v_ids,1),0),
                              'sample', v_sample);
  end if;

  if v_ids is not null then
    update public.dedup_review_queue q
       set status = 'rejected',
           reviewed_at = now(),
           reviewer_id = null,
           reviewer_note = 'auto-distinct: different city >25km apart, different street address, contradicting '
             || case when exists (select 1 from public.venues k join public.venues d on d.id = q.drop_id
                                   where k.id = q.keep_id and k.phone is not null and d.phone is not null
                                     and k.phone <> d.phone) then 'phone' else 'domain' end
     where q.id = any(v_ids);
    get diagnostics v_closed = row_count;

    -- The pair is settled, so neither side is awaiting attention on ITS account. Clearing
    -- is deliberately per-side and only for the flag this queue raised.
    perform public._dedup_set_needs_attention('venue', q.keep_id, false)
       from public.dedup_review_queue q where q.id = any(v_ids);
    perform public._dedup_set_needs_attention('venue', q.drop_id, false)
       from public.dedup_review_queue q where q.id = any(v_ids);
  end if;

  return jsonb_build_object('mode','full','closed', v_closed, 'sample', v_sample);
end; $function$;

REVOKE ALL ON FUNCTION public.run_dedup_close_distinct(integer, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_dedup_close_distinct(integer, boolean) TO service_role;

-- Registry first, then the cron -- the order every retirement/creation in this repo
-- follows, because `sync_automations_to_cron` reconciles FROM the registry and a cron
-- with no row is "unregistered", which branch (a) reports and deliberately never kills.
INSERT INTO public.admin_automations (slug, name, description, owner, enabled, trigger, conditions, action, schedule)
VALUES ('dedup_close_distinct', 'Dedup: close provably-distinct pairs',
        'Closes queued venue pairs the ladder already judged to be different businesses: different city >25km apart, different street address with house numbers on both sides, and a contradicting domain or phone. Never merges anything; only moves open -> rejected with an auto-distinct note.',
        'system', true, '{"type":"schedule"}'::jsonb, '{}'::jsonb,
        '{"type":"rpc","fn":"run_dedup_close_distinct","jobname":"dedup_close_distinct","command":"SELECT public.run_dedup_close_distinct();"}'::jsonb,
        '20 6 * * *')
ON CONFLICT (slug) DO UPDATE
  SET name = excluded.name, description = excluded.description,
      action = excluded.action, schedule = excluded.schedule, trigger = excluded.trigger;

SELECT cron.schedule('dedup_close_distinct', '20 6 * * *', 'SELECT public.run_dedup_close_distinct();')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dedup_close_distinct');

-- 06:20 sits after the 05:50 sweep (so it sees the night's new pairs) and before the
-- 06:30 autoapprove, which only looks at >=0.95 confidence and so cannot collide with
-- these 0.70 rows.

do $verify$
declare v jsonb; n int; v_far int;
begin
  v := public.run_dedup_close_distinct(1000, true);
  if (v->>'would_close') is null then raise exception 'dry run returned no count: %', v; end if;
  n := (v->>'would_close')::int;

  -- Fails on a dead arm AND on a runaway. 122 was the measured figure; the band is wide
  -- enough for the queue to grow, narrow enough that closing the whole bucket (373) or
  -- the whole queue (1,159) is an error rather than a busy night.
  if n = 0 then
    raise exception 'close-distinct matches nothing -- the arm is mis-specified, not the corpus clean';
  end if;
  if n > 300 then
    raise exception 'close-distinct would close % pairs, far above the measured 122 -- a veto has been lost', n;
  end if;

  -- POSITIVE CONTROL for the veto that cost two hand-read errors to find: pairs whose
  -- cities are close together must still be REFUSED. If this is zero the veto is
  -- untested by the corpus and the assertion above proves nothing about it.
  select count(*) into v_far
    from public.dedup_review_queue q
    join public.venues k on k.id = q.keep_id
    join public.venues d on d.id = q.drop_id
    left join public.cities kc on kc.id = k.city_id
    left join public.cities dc on dc.id = d.city_id
   where q.status = 'open' and q.entity_type = 'venue' and q.reason = 'identity_conflict'
     and k.city_id is not null and d.city_id is not null and k.city_id <> d.city_id
     and coalesce(public.haversine_m(kc.latitude, kc.longitude, dc.latitude, dc.longitude), 0) <= 25000;
  if v_far = 0 then
    raise exception 'no near-city pairs in the queue -- the >25km veto is unexercised and this deploy proves nothing about it';
  end if;

  raise notice 'close-distinct would close % pairs; % near-city pairs correctly refused', n, v_far;
end $verify$;
