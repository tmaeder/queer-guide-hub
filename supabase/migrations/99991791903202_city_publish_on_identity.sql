-- A machine-minted city was published because of a DDL default, not because of a decision.
--
-- MEASURED ON PROD, 2026-10-13. `cities.seo_indexable` carries `DEFAULT true` and
-- `city_resolve_or_create` -- every city creator's only door -- does not mention the column at
-- all: the string `seo_indexable` appears ZERO times in its 1 INSERT. So the publication decision
-- for a city nobody has ever corroborated is made by `information_schema.columns.column_default`.
--
-- The inflow that follows from that: 13,125 cities created in 30 days by `nominatim-geocode` and
-- 333 by `photon-location`, of which **33 and 0** carry an external identifier, and **12,955 and
-- 288 are `seo_indexable`**. The whole live cohort of indexable cities with neither a
-- `wikidata_qid` nor a `wikipedia_title` is 13,611, and 12,893 of those were created in the last
-- SEVEN days -- 94.7%. This is a burst, not an old backlog.
--
-- THE PREMISE THIS CHANGE STARTED FROM WAS FALSE, AND MEASURING IS WHAT KILLED IT. The brief was
-- to stop discarding the Wikidata identifier the geocoder already returns. Nominatim does return
-- one for one extra query parameter (`extratags=1`) -- probed live on 20 of the exact cities this
-- path created, 13 of 14 reachable rows carried a usable identifier. But **Nominatim is not the
-- producer.** `forwardGeocode` and `processReverse` both call PHOTON ("public Nominatim has
-- answered 403 to the edge egress since 2026-09-24", `backfill-venue-cities/index.ts:297`), and
-- Photon's response carries NO identifier: probed live, its properties are
-- `osm_type`/`osm_id`/`osm_key`/`osm_value`/`name`/`city`/`county`/`country`/`postcode`, where
-- `osm_id` is the id of the matched FEATURE -- a street, a nature reserve, a tourist attraction --
-- and `city` is a bare label with no identifier of any kind. There is nothing being thrown away.
--
-- `data_source = 'nominatim-geocode'` IS A MISLABEL AND IT IS WHAT MADE THE DIAGNOSIS WRONG.
-- `matchCity` hardcodes that slug for all four of its call sites, including the two Photon ones.
-- The label is corrected in the same PR; read the producer, never the `data_source` string.
--
-- TWO OTHER HYPOTHESES WERE MEASURED AND BOTH DIED, which is why the fix is not in the matching:
--   * duplicate minting (the `_shared/admin-unit-name.ts` finding -- a wrapper word defeating the
--     name match and minting Chișinău a second time): of the 13,063 identifier-less rows minted in
--     7 days, **53 have a same-name twin in the same country and 0 of those twins carry an
--     identifier**. 0.4%. The inflow is genuinely new small places, not duplicates.
--   * the identifier linker being stalled: it is not. `city_qid_gap_link` resolves ~42.9/day
--     against this inflow, so it is outpaced, not broken -- and raising its batch is a capacity
--     knob, not a seal. A seal belongs at the point of publication.
--
-- THE RULE: A CITY IS PUBLISHED WHEN SOMETHING OUTSIDE THIS DATABASE AGREES IT EXISTS.
-- One statable condition, applied to every creator uniformly, and deliberately NOT a caller
-- allowlist -- pinning this to `p_source_slug = 'nominatim-geocode'` is the one-slug-out-of-240
-- trap that hid the `search_reindex_drain` auto-pause for three occurrences. The data says the
-- uniform rule costs nothing it should not cost: over 30 days every deliberate creator already
-- supplies an identifier (`migration:*` 14/14, 9/9, 4/4; `city-settlement-audit` 13/13;
-- `wikidata` 1/1), so this gates the two geocoder paths plus 75 `geonames` and 75
-- `venue-city-match` rows that are the same class of unverified machine mint.
--
-- EXISTING ROWS ARE NOT TOUCHED, and that is a decision rather than an omission. The 13,611 are
-- content-bearing -- re-measured, only 27 of them are empty -- and a retro-deindex of 13k live
-- pages is a product decision that was already put to the owner and declined. This changes what
-- happens from now on.
--
-- HOW A ROW EARNS PUBLICATION, so this is a gate and not a hole: `city_qid_gap_link` adopts an
-- identifier behind its class gate and its 100 km coordinate gate, and `city-factual-backfill`
-- fills `wikipedia_title` from a corroborated sitelink. Either write satisfies the detector that
-- counts this cohort, and a human can always set the flag.
--
-- RESIDUE, STATED RATHER THAN IMPLIED: `run_city_trust_recompute`'s classifier reads
-- `CASE WHEN slug LIKE 'tmp-%' THEN seo_indexable WHEN is_empty THEN false
--       WHEN shell_status = 'ghost' THEN true ELSE seo_indexable END`
-- so a row this change leaves unpublished is PRESERVED by the `ELSE` arm on every nightly pass
-- (verified: `shell_status` defaults to `'real'`, and a minted city has its venue within the same
-- function invocation, so it is never `is_empty` by the time the nightly selector reaches it).
-- The one path that would re-publish it is a row that passes THROUGH `ghost` -- genuinely empty at
-- a nightly pass, then gaining content later -- which is that engine's documented and correct
-- behaviour, and sealing it would mean restating a four-CTE chain to thread two columns through
-- for a millisecond race. The sentinel below watches the count instead.
--
-- Patched by string surgery on the LIVE definition rather than restated: the function is every
-- city creator's only door, carries ten arms including the locality registry and the
-- identifier-conflict refusal, and a transcription slip there mints duplicates silently
-- (the `99991790719601` precedent).

do $patch$
declare
  v_src  text;
  v_cols_before text := E'       field_provenance)\n    VALUES';
  v_cols_after  text := E'       field_provenance, seo_indexable)\n    VALUES';
  v_vals_before text := E'\'at\', now())))\n    RETURNING id INTO v_new_id;';
  v_vals_after  text := E'\'at\', now())), nullif(btrim(p_wikidata_qid),\'\') IS NOT NULL)\n    RETURNING id INTO v_new_id;';
  v_n    integer;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'city_resolve_or_create';

  if v_src is null then
    raise exception 'city_resolve_or_create not found';
  end if;

  -- Already patched (a re-run, or a concurrent session got there first): leave it alone.
  if position(v_cols_after in v_src) > 0 then
    raise notice 'city_resolve_or_create already publishes on identity -- nothing to do';
    return;
  end if;

  -- Each anchor exactly once, or abort without touching the function. More than one occurrence
  -- means there is a second INSERT this file never read, and a blind replace would patch both.
  v_n := (length(v_src) - length(replace(v_src, v_cols_before, ''))) / length(v_cols_before);
  if coalesce(v_n, 0) <> 1 then
    raise exception 'column anchor occurs % times, expected exactly 1 -- refusing to patch', v_n;
  end if;
  v_n := (length(v_src) - length(replace(v_src, v_vals_before, ''))) / length(v_vals_before);
  if coalesce(v_n, 0) <> 1 then
    raise exception 'values anchor occurs % times, expected exactly 1 -- refusing to patch', v_n;
  end if;

  v_src := replace(v_src, v_cols_before, v_cols_after);
  v_src := replace(v_src, v_vals_before, v_vals_after);
  execute v_src;
end
$patch$;

-- The sentinel. Standalone and service_role-only: `city_quality_profile` is a long view and a new
-- key there is a merge-collision surface, and a DEFINER aggregate granted to `authenticated` is
-- granted to every member.
--
-- It reports the DENOMINATORS FIRST on purpose. `published_without_identity_recent` reading 0 is
-- equally true of a working gate, a path that stopped creating cities at all, and a probe that
-- cannot see the column -- and only `created_recent` tells those apart. Both halves of the
-- invariant are needed: the count alone over a corpus where nothing is being created is clean by
-- accident.
create or replace function public.city_publication_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $fn$
  with recent as (
    select c.seo_indexable,
           (c.wikidata_qid is not null or c.wikipedia_title is not null) as has_identity
    from public.cities c
    where c.duplicate_of_id is null
      and c.created_at >= now() - interval '2 days'
  )
  select jsonb_build_object(
    'probe_ok', true,
    -- Denominators first: a zero above an empty denominator is not a clean gate.
    'created_recent', (select count(*) from recent),
    'created_recent_with_identity', (select count(*) from recent where has_identity),
    -- The invariant. A city created in the last two days may not be published unless something
    -- outside this database agrees it exists.
    'published_without_identity_recent',
      (select count(*) from recent where seo_indexable and not has_identity),
    -- Context, never gated: the standing cohort is a disposition backlog this change does not
    -- touch, and gating on a level that can only fall by hand ships red and gets scrolled past.
    'cohort_total',
      (select count(*) from public.cities
        where duplicate_of_id is null and seo_indexable
          and wikidata_qid is null and wikipedia_title is null),
    -- Proof the gate is on the function rather than on a comment about it.
    'resolver_sets_seo_indexable',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'city_resolve_or_create'
          and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
              ilike '%field_provenance, seo_indexable)%')
  );
$fn$;

revoke all on function public.city_publication_signals() from public;
revoke all on function public.city_publication_signals() from anon, authenticated;
grant execute on function public.city_publication_signals() to service_role;

-- The probes below live in a SUBTRANSACTION and are discarded by raising inside it, rather than
-- being DELETEd afterwards. Two reasons. A `delete from public.cities` fires the spine and
-- search-reindex chain and is the one statement here that touches live machinery for no benefit;
-- and plpgsql variables are NOT transactional, so a flag captured inside the subtransaction
-- survives the rollback and can be asserted after it -- which is what lets this file prove the
-- gate behaviourally while writing nothing at all. P6 is therefore true by construction.
--
-- THE TWO PROBES SIT AT DIFFERENT COORDINATES ON PURPOSE. A first draft put both at 51.0/9.0 and
-- the second call returned a NULL city_id -- the resolver absorbed the mirror into the probe it
-- mirrors -- so the mirror read as a failure of the gate it exists to check. A mirror placed where
-- the thing it mirrors already sits is not a mirror.
do $verify$
declare
  v_src  text;
  v_sig  jsonb;
  v_id   uuid;
  v_cc   uuid;
  v_unverified boolean;
  v_verified   boolean;
  v_made_u boolean := false;
  v_made_v boolean := false;
begin
  -- P1: the gate is on the live function, read comment-stripped. pg_get_functiondef() returns the
  -- body INCLUDING its comments, and this file's header quotes the column list verbatim, so an
  -- unstripped assertion would match the prose explaining the change rather than the change.
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
    into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'city_resolve_or_create';
  if position('field_provenance, seo_indexable)' in v_src) = 0
     or position('nullif(btrim(p_wikidata_qid),'''') IS NOT NULL)' in v_src) = 0 then
    raise exception 'P1 failed: city_resolve_or_create does not set seo_indexable from the identifier';
  end if;

  select id into v_cc from public.countries where code = 'DE' and duplicate_of_id is null limit 1;
  if v_cc is null then
    raise exception 'P2 failed: no country fixture, so P2 and P3 would be vacuous';
  end if;

  begin
    -- P2 probe: no identifier supplied.
    select city_id into v_id from public.city_resolve_or_create(
      p_name => 'Zzprobe Unverified ' || substr(md5(random()::text), 1, 8),
      p_country_id => v_cc, p_lat => 51.0, p_lng => 9.0,
      p_source_slug => 'migration:99991791903202', p_actor => 'migration-verify');
    v_made_u := v_id is not null;
    select seo_indexable into v_unverified from public.cities where id = v_id;

    -- P3 probe: an identifier supplied, at DIFFERENT coordinates (see the note above).
    select city_id into v_id from public.city_resolve_or_create(
      p_name => 'Zzprobe Verified ' || substr(md5(random()::text), 1, 8),
      p_country_id => v_cc, p_lat => 51.5, p_lng => 9.5,
      p_wikidata_qid => 'Q' || (900000000 + floor(random() * 9000000))::bigint::text,
      p_source_slug => 'migration:99991791903202', p_actor => 'migration-verify');
    v_made_v := v_id is not null;
    select seo_indexable into v_verified from public.cities where id = v_id;

    raise exception 'ZZPROBE_ROLLBACK';
  exception when others then
    -- Anything that is NOT the discard signal is a real failure and must propagate.
    if sqlerrm <> 'ZZPROBE_ROLLBACK' then raise; end if;
  end;

  -- Both probes must have been CREATED, or P2 and P3 are assertions about nothing.
  if not v_made_u or not v_made_v then
    raise exception 'P2/P3 failed: a probe city was not created (unverified=%, verified=%)',
      v_made_u, v_made_v;
  end if;

  -- P2: BEHAVIOURAL, the gate closes. A source-text assertion cannot tell a live predicate from a
  -- dead one, so a city is really created with no identifier and the stored flag is read back.
  if v_unverified is not false then
    raise exception 'P2 failed: a city created with no identifier is seo_indexable = %', v_unverified;
  end if;

  -- P3: MIRROR. The gate must still PUBLISH a city that arrives corroborated. Without this, a
  -- patch that hardcoded `false` would satisfy P2 perfectly and silently deindex every creator.
  if v_verified is not true then
    raise exception 'P3 failed: a city created WITH an identifier is seo_indexable = %', v_verified;
  end if;

  -- P4: the sentinel answers, reports its denominators, and sees the gate.
  v_sig := public.city_publication_signals();
  if coalesce((v_sig->>'probe_ok')::boolean, false) is not true then
    raise exception 'P4 failed: city_publication_signals did not answer';
  end if;
  if not (v_sig ? 'created_recent' and v_sig ? 'cohort_total'
          and v_sig ? 'published_without_identity_recent') then
    raise exception 'P4 failed: the sentinel is missing a key: %', v_sig;
  end if;
  if coalesce((v_sig->>'resolver_sets_seo_indexable')::boolean, false) is not true then
    raise exception 'P4 failed: the sentinel cannot see the gate it exists to watch';
  end if;

  -- P5: the sentinel is not readable by anon or by every signed-in member.
  if has_function_privilege('anon', 'public.city_publication_signals()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.city_publication_signals()', 'EXECUTE') then
    raise exception 'P5 failed: city_publication_signals is reachable by anon or authenticated';
  end if;

  -- P6: THIS FILE WRITES NO ROW. The standing cohort is a disposition backlog and a retro-deindex
  -- of 13k content-bearing pages was put to the owner and declined, so a sweep hidden inside a
  -- producer change would be both wrong and invisible in the diff. The probes above are discarded
  -- by their subtransaction, so the only thing to assert is that none of them survived -- which
  -- also catches a future edit that "tidies up" the rollback into a commit.
  if exists (select 1 from public.cities where name like 'Zzprobe %') then
    raise exception 'P6 failed: a probe city survived -- this migration is writing rows';
  end if;

  raise notice 'cities publish on identity: %', v_sig;
end
$verify$;
