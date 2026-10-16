-- cities_directory(): index the venue count, and resolve high_risk as a join
-- rather than a per-row EXISTS.
--
-- SYMPTOM, as reported: three identical anonymous POSTs to /rest/v1/rpc/cities_directory
-- returned 500 `57014 canceling statement due to statement timeout`, 500, then 200 with
-- real rows. ~2 in 3 calls fail, so the anonymous city search on /cities is broken
-- intermittently. `e2e/feedback-stories-fixed.spec.ts:93` (@smoke) is a true positive.
--
-- THE CEILING IS 3s, NOT 8s, AND THAT CHANGES THE DIAGNOSIS. The brief read the 3.2s
-- wall time as "the client giving up rather than the 8s server ceiling". Both halves are
-- wrong: it was the server, and `anon` carries its own `statement_timeout = 3s`
-- (pg_roles.rolconfig; `authenticated` and `authenticator` get 8s, `service_role` none).
-- 99991789855163 — the prior pass on this same function and this same symptom — already
-- states that 3s in its header. Measured warm, the function answers in ~2.5s. So the
-- headroom was 1.17x, not 2.7x, and "flaky" is exactly what 2.5s against 3s looks like.
-- Do NOT diagnose this function against 8s, and do not read a probe run as `service_role`
-- (which has no timeout at all) as evidence it is healthy.
--
-- WHAT GREW. That prior pass measured 2,529 directory rows. It is now 16,206 — 6.4x in
-- 26 days, 13,278 of them created since. THE OBVIOUS SUSPICION WAS MEASURED AND KILLED:
-- 13,877 carry `data_source='nominatim-geocode'`, which looked like a bulk shell-minting
-- producer whose rows the ghost classifier should have deindexed. They are real cities —
-- **16,159 of 16,206 directory rows have at least one approved venue and only 26 are
-- zero-content** (the geocode backfill linked existing venues to city rows it created).
-- There is nothing to deindex upstream; the corpus legitimately grew and the query has to
-- fit in 3s. A constant-factor fix therefore buys time rather than settling this — see
-- the sentinel note at the end.
--
-- COST, attributed on LEAF nodes only (buffer counts roll up through the plan tree, and
-- this repo has twice drawn wrong conclusions from interior-node figures):
--
--   venues    seq scan ......... 12,882 blocks, 828 ms   <- the target
--   events    index scan .......  4,061 blocks,  75 ms
--   cities    seq scan .........  3,870 blocks, 128 ms
--   geo_country_profiles (hr) ..  3,197 blocks,  52 ms   (160 relpages + ~3,040 TOAST;
--                                                         not bloat — n_dead_tup = 0)
--   queer_villages index-only ..    154 blocks,   6 ms
--
-- plus, interior: the `hr` correlated CTE Scan at 16,206 loops x 0.026 ms = ~421 ms, the
-- sort 135 ms, `jsonb_agg` 590 ms, planning 127 ms. Total 24,167 blocks / 2,565 ms.
--
-- FIX 1 — the venues count had no usable index. `idx_venues_city_id` exists but carries
-- no `review_status`, so serving this from it would need a heap check on all 111k rows and
-- the planner is right to seq-scan instead. A partial index on (city_id) WHERE approved
-- needs no heap access at all, because the predicate IS the index.
--
-- THIS IS THE FOURTH ENCOUNTER WITH THE STALE-VISIBILITY-MAP TRAP, AND IT HAS A NEW
-- WRINKLE WORTH THE SPACE. The three recorded occurrences all say: read pg_class before
-- trusting an index-only scan. `venues` read **relallvisible 12,881 of relpages 12,882 —
-- 100.0%** — and the index-only scan still reported **Heap Fetches: 51,716**, taking
-- blocks the WRONG way, 24,167 -> 62,579. `relallvisible` is a planner estimate refreshed
-- only by vacuum/analyze; the runtime checks the real visibility map, and `venues` is
-- written continuously (n_dead_tup 2,798, no vacuum since). **pg_class is not sufficient —
-- only `Heap Fetches` in an actual plan tells the truth.** After `vacuum (analyze) venues`
-- the same scan reports Heap Fetches 0 / 147 blocks / 39 ms.
--
-- BUT THE FIX DOES NOT DEPEND ON THAT VACUUM, WHICH IS WHY IT SHIPS. Both bounds were
-- measured, and the degraded one still wins on both axes:
--
--                        buffer accesses   PHYSICAL reads   time
--   seq scan (before) ....... 12,882          12,882        828 ms
--   index, VM degraded ...... 51,288             146        129 ms
--   index, VM healthy ...........147             146         39 ms
--
-- The 51,288 is buffer ACCESSES against at most 12,882 distinct heap pages, not 51,288
-- page reads — `Shared Read Blocks` was 146 either way. The repo's "quote blocks, not warm
-- milliseconds" rule exists because blocks ~= physical reads for a one-pass seq scan; for a
-- repeated-access path hit-blocks and read-blocks diverge and the hit count overstates the
-- cold cost. So the index is safe in its worst measured state, and autovacuum falling
-- behind on `venues` degrades it from 39 ms to 129 ms rather than regressing it.
--
-- FIX 2 — `exists (select 1 from hr where ...)` ran as a correlated CTE Scan, 16,206 loops
-- over 67 rows, ~421 ms. As a `left join` on the same materialized CTE it is one hash build
-- and ~39 ms.
--
-- EQUIVALENCE IS ASSERTED, NOT ASSUMED — the house rule for this function, because
-- high_risk drives the safety-gating copy on a city card and a faster answer that gated one
-- city differently would be a regression, not an optimisation. Both forms were evaluated
-- against each other in ONE statement so both saw a single snapshot: **16,206 rows
-- compared, 233 high_risk under each, 0 disagreements.** A LEFT JOIN rather than a semi-join
-- is safe only because the join key cannot fan out, which was measured rather than inferred
-- from the PK: **0 of 16,206 rows match more than one `hr` row.** It is also deliberately a
-- join and not `coalesce(...) in (select ...)`: `in` yields NULL (not false) when the left
-- side is null and nothing matches, `jsonb_strip_nulls` would then DROP the key, and the
-- client would read `undefined` instead of `false` on a safety flag. P4 asserts the key is
-- present on every element precisely to catch that rewrite.
--
-- `materialized` ON THE CTE REMAINS LOAD-BEARING. A non-recursive CTE referenced once is
-- inlined by PG12+, which would push the subquery back inside the row builder and rebuild
-- the scan 99991789855163 removed, with every test still passing. P2 asserts it survives.
-- The geo_places fallback is likewise preserved verbatim and asserted (P3): 0 directory
-- rows have a null country_id and the plan reports it "never executed", so it is
-- correctness insurance that costs nothing, not dead code to drop.
--
-- RESULT, dry-run on prod in a transaction forced to roll back:
--   24,167 blocks / 2,565 ms  ->  12,075 blocks / 1,620 ms   (2.0x blocks, 1.6x time)
--
-- NOT DONE, AND NAMED RATHER THAN COUNTED. The payload is now the dominant cost, and it is
-- what 99991789855163 deferred ("NOT CHANGED, deliberately: the 1.2 MB unpaginated
-- payload"). It is **7,514 kB over 16,206 rows** today, and `jsonb_agg` is **851 ms of the
-- remaining 1,620 ms** — measured twice at 378 ms and 851 ms, and that variance on a
-- CPU-bound string build under concurrent load is what will decide whether a given call
-- lands. Trimming fields or paginating changes what the client receives and needs a
-- frontend half, so it is its own change rather than a side effect of this one. Also not
-- done: no maintained counter table (new triggers on a table whose write churn is already
-- a documented hazard), no signature change, and `hr`'s 3,197 blocks are left alone — 52 ms
-- of TOAST reads for 250 rows is not worth a materialized view.
--
-- STILL OPEN, STATED PLAINLY: at the growth rate measured above this fix buys time, not
-- permanence. ~1.62s warm against 3s is 1.85x headroom where it was 1.17x. The quantity to
-- watch is the row count and the payload, not the latency of a service_role probe.

do $idx$
declare
  v_attempt int := 0;
  v_max     int := 20;
begin
  loop
    v_attempt := v_attempt + 1;
    begin
      -- `venues` is a hot ingest table and CREATE INDEX takes a SHARE lock that blocks
      -- writes for its duration. An unbounded wait also queues every NEW writer behind the
      -- pending lock; a bare lock_timeout with no retry turns one busy moment into a
      -- repo-wide `db push` abort. CONCURRENTLY is not available here. Pattern from
      -- 99991791966722.
      set local lock_timeout = '2s';

      create index if not exists idx_venues_city_id_approved
        on public.venues (city_id)
        where review_status = 'approved';

      raise notice 'idx_venues_city_id_approved present on attempt %', v_attempt;
      exit;
    exception when lock_not_available then
      -- The subtransaction rolled back, so nothing is held while we wait.
      if v_attempt >= v_max then
        raise exception 'could not take SHARE on public.venues in % attempts — ingest is holding a write lock. Re-run the deploy.', v_max;
      end if;
      perform pg_sleep(2);
    end;
  end loop;
end
$idx$;

create or replace function public.cities_directory()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with vc as (
    -- Served by idx_venues_city_id_approved as an index-only scan. The predicate is the
    -- index, so there is no heap access for `review_status` — see the header for the two
    -- measured visibility-map bounds and why the degraded one is still a win.
    select v.city_id, count(*)::int as n
    from public.venues v
    where v.review_status = 'approved'
      and v.city_id is not null
    group by v.city_id
  ),
  -- Upcoming only. The events corpus is ~99% past (36.5k rows scraped from the
  -- Wayback Machine), so a lifetime count would say nothing about whether there is
  -- anything to go to; 157 cities have a future event.
  ec as (
    select e.city_id, count(*)::int as n
    from public.events e
    where e.city_id is not null
      and e.start_date >= now() - interval '1 day'
    group by e.city_id
  ),
  qv as (
    select q.city_id, count(*)::int as n
    from public.queer_villages q
    where q.city_id is not null
    group by q.city_id
  ),
  -- The high-risk COUNTRY set, resolved once (67 of 250 countries) instead of
  -- re-derived per city. Must stay `materialized` — see the header.
  hr as materialized (
    select cp.place_id as country_id
    from public.geo_country_profiles cp
    where (cp.lgbti_criminalization->>'legal') = 'false'
       or public.death_penalty_risk(cp.lgbti_criminalization) <> 'none'
  ),
  rows as (
    select
      c.id,
      c.slug,
      c.name,
      c.name_en,
      c.name_de,
      c.region_name,
      c.population,
      c.latitude,
      c.longitude,
      c.is_capital,
      nullif(c.is_regional_capital, false) as is_regional_capital,
      c.capital_of_region,
      c.name_local,
      c.name_local_lang,
      c.editorial_hook,
      co.id            as country_id,
      co.name          as country_name,
      co.slug          as country_slug,
      co.equality_score,
      cont.code        as continent_code,
      cont.name        as continent_name,
      coalesce(vc.n, 0) as venue_count,
      coalesce(ec.n, 0) as upcoming_event_count,
      coalesce(qv.n, 0) as village_count,
      -- Resolved here, not in the client, so the card cannot disagree with the RLS
      -- predicate that decides whether that city's venues are gated at all. A LEFT JOIN
      -- on `hr` rather than a per-row EXISTS; `is not null` keeps it strictly boolean,
      -- which `in (select ...)` would not. Equivalence measured: 0 disagreements over
      -- 16,206 rows, and 0 rows match more than one `hr` row so the join cannot fan out.
      (hr.country_id is not null) as high_risk
    from public.cities c
    left join public.countries  co   on co.id   = c.country_id
    left join public.continents cont on cont.id = co.continent_id
    left join vc on vc.city_id = c.id
    left join ec on ec.city_id = c.id
    left join qv on qv.city_id = c.id
    -- Inlined from location_is_high_risk() rather than calling it per row; the coalesce is
    -- that function's own geo_places fallback, kept verbatim.
    left join hr on hr.country_id = coalesce(
      c.country_id,
      (select gp.country_id from public.geo_places gp
        where gp.id = c.id and gp.place_type = 'city')
    )
    where c.duplicate_of_id is null
      and c.slug is not null
      and c.slug not like 'tmp-%'
      -- Coordinates were a map requirement; they stay because they are also the best
      -- available completeness proxy for a stub row. Only 2 of 3,070 rows lack them,
      -- so this is not what was truncating the directory — the limit was.
      and c.latitude is not null
      and c.longitude is not null
      and c.seo_indexable is true
      -- `not in` would swallow NULLs; shell_status is NOT NULL on every row (verified),
      -- so this is safe, and it is the same expression the places sitemap uses.
      and c.shell_status not in ('ghost', 'merged')
    order by coalesce(vc.n, 0) desc, c.population desc nulls last, c.name asc
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(rows))), '[]'::jsonb) from rows;
$function$;

do $verify$
declare
  v_src        text;
  v_payload    jsonb;
  v_rows       int;
  v_expected   int;
  v_missing_hr int;
  v_disagree   int;
  v_valid      boolean;
begin
  -- P1: the index exists AND is valid. A half-built index is not a fix, and `if not
  -- exists` above would happily find an INVALID leftover and report success.
  select i.indisvalid into v_valid
  from pg_class c
  join pg_index i on i.indexrelid = c.oid
  where c.relname = 'idx_venues_city_id_approved';

  if v_valid is null then
    raise exception 'P1 failed: idx_venues_city_id_approved does not exist';
  end if;
  if not v_valid then
    raise exception 'P1 failed: idx_venues_city_id_approved exists but is INVALID';
  end if;

  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'cities_directory';

  -- P2: `materialized` survives. Without it PG12+ inlines the CTE back into the row
  -- builder and silently rebuilds the per-row scan 99991789855163 removed.
  if position('hr as materialized' in v_src) = 0 then
    raise exception 'P2 failed: the hr CTE is no longer materialized — the per-row scan is back';
  end if;

  -- P3: the geo_places fallback arm survives.
  if position('place_type = ''city''' in v_src) = 0 then
    raise exception 'P3 failed: the geo_places country fallback was dropped';
  end if;

  v_payload := public.cities_directory();
  v_rows    := jsonb_array_length(v_payload);

  -- P4: high_risk is present on EVERY element. jsonb_strip_nulls drops a null key, so a
  -- rewrite to `in (select ...)` — which yields NULL rather than false — would silently
  -- serve `undefined` for a safety flag on some cities. This is the check that catches it.
  select count(*) into v_missing_hr
  from jsonb_array_elements(v_payload) e
  where not (e.value ? 'high_risk');

  if v_missing_hr <> 0 then
    raise exception 'P4 failed: % of % directory entries carry no high_risk key', v_missing_hr, v_rows;
  end if;

  -- P5: cardinality matches the predicate. Deliberately computed live rather than pinned
  -- to a number — the corpus grew 6.4x in 26 days and an exact count would fail on correct
  -- code the next time ingest adds a city.
  select count(*) into v_expected
  from public.cities c
  where c.duplicate_of_id is null
    and c.slug is not null
    and c.slug not like 'tmp-%'
    and c.latitude is not null
    and c.longitude is not null
    and c.seo_indexable is true
    and c.shell_status not in ('ghost', 'merged');

  if v_rows <> v_expected then
    raise exception 'P5 failed: directory returned % rows, predicate matches % — the join is fanning out or filtering', v_rows, v_expected;
  end if;
  if v_rows = 0 then
    raise exception 'P5 failed: directory is empty — every other postcondition here passes vacuously on an empty payload';
  end if;

  -- P6: the house rule for this function. Compare the shipped join against the EXISTS form
  -- it replaces, in one statement so both see one snapshot. high_risk drives safety-gating
  -- copy; a faster answer that gates one city differently is a regression.
  with hr as materialized (
    select cp.place_id as country_id
    from public.geo_country_profiles cp
    where (cp.lgbti_criminalization->>'legal') = 'false'
       or public.death_penalty_risk(cp.lgbti_criminalization) <> 'none'
  )
  select count(*) into v_disagree
  from jsonb_array_elements(v_payload) e
  join public.cities c on c.id = (e.value->>'id')::uuid
  where (e.value->>'high_risk')::boolean <> exists (
    select 1 from hr
    where hr.country_id = coalesce(
      c.country_id,
      (select gp.country_id from public.geo_places gp
        where gp.id = c.id and gp.place_type = 'city')
    )
  );

  if v_disagree <> 0 then
    raise exception 'P6 failed: % of % cities disagree with the EXISTS form on high_risk', v_disagree, v_rows;
  end if;

  raise notice 'cities_directory: P1-P6 pass (% rows, 0 high_risk disagreements)', v_rows;
end
$verify$;

comment on index public.idx_venues_city_id_approved is
  'Serves the per-city approved-venue count in cities_directory() as an index-only scan '
  '(12,882 blocks/828 ms -> 147/39). Partial on review_status so the predicate is the '
  'index and no heap access is needed for it. See 99991792192204.';
