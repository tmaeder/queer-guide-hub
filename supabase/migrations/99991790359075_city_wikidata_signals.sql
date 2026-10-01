-- Nothing was watching whether a CITY's identifier points at that city.
--
-- Two repairs landed and left no sentinel between them:
--   20261102100000  Geneva, Alabama wearing Q71 (Geneva, Switzerland) and Lugano
--                   near Ravenna wearing Q7024 (Lugano, Ticino), by hand
--   99991790358713  11 rows that published another place's encyclopedia article,
--                   found by sweeping all 2,959 QID-bearing cities against live
--                   Wikidata P625 -- Frisco TX as San Francisco, Par in Cornwall
--                   as Paris, Kos as Koszalin, a Kent village wearing St
--                   Petersburg's governor as its mayor
--
-- `geo_spine_drift_check` is a different question -- does the spine mirror agree
-- with the typed table -- and answers nothing about whether the identifier on the
-- row is the right place. `place_merge_name_signals` watches MERGES. Checked
-- before writing this: no function in the schema watches the latter.
--
-- WHAT SQL CAN AND CANNOT CHECK, which decides the whole shape. This runs in
-- Postgres and cannot call Wikidata, so it cannot re-derive P625 and CANNOT tell
-- you a NEW identifier is wrong. Re-running that sweep is an out-of-band job. What
-- it can do is what `tag_wikidata_repair_regressions()` and
-- `personality_wikidata_signals()` do one entity type over: watch for a refuted
-- identifier COMING BACK, and for a completed repair being undone. Every key below
-- is structural and derived from state the repairs already recorded.
--
--   qid_regressed        a live wikidata_qid equal to one this platform has
--                        already recorded as refuted FOR THAT SAME ROW.
--                        ZERO-INVARIANT. Means a producer is adopting
--                        coordinate-refused identities again -- check that
--                        `cityCoordVerdict` is still called in
--                        city-factual-backfill and that CITY_COORD_MAX_KM is
--                        still 100.
--   wrong_title_back     a repaired row whose `wikipedia_title` is non-null again.
--                        ZERO-INVARIANT, and the one this corpus most needs:
--                        `city-factual-backfill/index.ts:451` re-fetches the
--                        article BY that cached title INDEPENDENTLY of the QID, so
--                        a title creeping back re-publishes the wrong article even
--                        while the identifier stays null. The identifier coming
--                        back and the TITLE coming back are separate failures --
--                        the tag work needed two sentinels for exactly this
--                        reason, because `suspension` kept serving an account-ban
--                        definition for ten days after its id was cleared.
--   retracted_desc_back  a repaired row whose retracted description has returned
--                        verbatim. ZERO-INVARIANT.
--
-- REPORTED, NEVER GATED:
--   rows_with_qid        total non-duplicate cities carrying a well-formed Q-id.
--                        POSITIVE CONTROL -- see the verify block.
--   dispositioned        how many rows have been judged wrong so far.
--   coord_unswept        cities with an identifier and coordinates that no
--                        coordinate sweep has ever recorded a verdict for. This is
--                        a WORK-LIST SIZE, not a defect count: 167 of 2,959 failed
--                        the 100 km bound when swept out-of-band, of which 11 were
--                        hand-confirmed as wrong identifiers and repaired, 2 were
--                        confirmed as OUR coordinates being wrong rather than the
--                        identifier, and the remaining ~154 still have prose that
--                        is correct for the row and need a human per row. Gating on
--                        this would ship red on arrival.
--
-- `probe_ok` and `rows_with_qid` are reported SEPARATELY from the counts, because
-- an empty table, a revoked grant and a clean corpus otherwise all return the same
-- reassuring zeroes.
--
-- service_role only. A SECURITY DEFINER aggregate granted to `authenticated` is
-- granted to every signed-in member.

create or replace function public.city_wikidata_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_rows_with_qid   int;
  v_dispositioned   int;
  v_qid_regressed   int;
  v_title_back      int;
  v_desc_back       int;
  v_coord_unswept   int;
  v_examples        jsonb;
begin
  select count(*) into v_rows_with_qid
    from cities
   where duplicate_of_id is null and wikidata_qid ~ '^Q[0-9]+$';

  -- Any row either repair has dispositioned. Keyed on the provenance shape
  -- 20261102100000 established, so one query finds every such repair regardless of
  -- which migration made it.
  select count(*) into v_dispositioned
    from cities
   where field_provenance->'wikidata_qid'->>'retracted_value' is not null;

  -- ZERO-INVARIANT 1: the refuted identifier is back on the same row.
  select count(*) into v_qid_regressed
    from cities
   where wikidata_qid is not null
     and wikidata_qid = field_provenance->'wikidata_qid'->>'retracted_value';

  -- ZERO-INVARIANT 2: the cached wrong article title is back. Scoped to rows whose
  -- retraction actually recorded a title, so 20261102100000's two rows -- which had
  -- no wrong title to clear -- cannot make this fire.
  select count(*) into v_title_back
    from cities
   where field_provenance->'wikidata_qid'->>'retracted_wikipedia_title' is not null
     and wikipedia_title is not null;

  -- ZERO-INVARIANT 3: the retracted description is back verbatim.
  select count(*) into v_desc_back
    from cities
   where field_provenance->'description'->'retracted'->>'from' is not null
     and description is not null
     and description = field_provenance->'description'->'retracted'->>'from';

  -- WORK LIST, never gated.
  select count(*) into v_coord_unswept
    from cities
   where duplicate_of_id is null
     and wikidata_qid ~ '^Q[0-9]+$'
     and latitude is not null and longitude is not null
     and enrichment_status->'wikidata_link'->>'coord_swept_at' is null;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_examples from (
    select slug || ' -> ' || coalesce(wikidata_qid, '(null)')
           || ' [refuted ' || coalesce(field_provenance->'wikidata_qid'->>'retracted_value','?') || ']' as x
      from cities
     where (wikidata_qid is not null
            and wikidata_qid = field_provenance->'wikidata_qid'->>'retracted_value')
        or (field_provenance->'wikidata_qid'->>'retracted_wikipedia_title' is not null
            and wikipedia_title is not null)
        or (field_provenance->'description'->'retracted'->>'from' is not null
            and description is not null
            and description = field_provenance->'description'->'retracted'->>'from')
     limit 10
  ) s;

  return jsonb_build_object(
    'probe_ok', true,
    'rows_with_qid', v_rows_with_qid,
    'dispositioned', v_dispositioned,
    'qid_regressed', v_qid_regressed,
    'wrong_title_back', v_title_back,
    'retracted_desc_back', v_desc_back,
    'coord_unswept', v_coord_unswept,
    'examples', v_examples
  );
end
$fn$;

comment on function public.city_wikidata_signals() is
  'Watches for a refuted city Wikidata identifier, or the wrong cached wikipedia_title, or a retracted description, COMING BACK. Cannot judge a new identifier -- SQL cannot call Wikidata. service_role only.';

-- CREATE FUNCTION already granted EXECUTE to PUBLIC, so granting to service_role
-- revokes nothing. Revoke first, or this DEFINER aggregate is anon-callable.
revoke all on function public.city_wikidata_signals() from public;
revoke all on function public.city_wikidata_signals() from anon;
revoke all on function public.city_wikidata_signals() from authenticated;
grant execute on function public.city_wikidata_signals() to service_role;

do $verify$
declare
  v jsonb;
begin
  select public.city_wikidata_signals() into v;

  if coalesce(v ->> 'probe_ok', '') <> 'true' then
    raise exception 'city_wikidata_signals did not return probe_ok';
  end if;

  -- The three invariants must be clean the day this ships, or it is being
  -- introduced already-red and will be scrolled past.
  if (v ->> 'qid_regressed')::int <> 0 then
    raise exception 'city_wikidata_signals: % row(s) already carry a refuted qid: %',
      v ->> 'qid_regressed', v ->> 'examples';
  end if;
  if (v ->> 'wrong_title_back')::int <> 0 then
    raise exception 'city_wikidata_signals: % repaired row(s) carry a wikipedia_title again: %',
      v ->> 'wrong_title_back', v ->> 'examples';
  end if;
  if (v ->> 'retracted_desc_back')::int <> 0 then
    raise exception 'city_wikidata_signals: % retracted description(s) returned: %',
      v ->> 'retracted_desc_back', v ->> 'examples';
  end if;

  -- POSITIVE CONTROL. All three counts above are zero on an empty table, on a
  -- revoked grant, and on a function that returns a literal. This asserts the
  -- probe is actually reading the corpus it claims to watch.
  if (v ->> 'rows_with_qid')::int < 1000 then
    raise exception 'city_wikidata_signals: only % rows with a Q-id -- the probe is not reading the corpus',
      v ->> 'rows_with_qid';
  end if;
  -- Second positive control: the repairs' output must be visible to the probe, or
  -- the two zero-invariants above are watching an empty set.
  if (v ->> 'dispositioned')::int < 11 then
    raise exception 'city_wikidata_signals: only % dispositioned rows -- expected at least the 11-row repair',
      v ->> 'dispositioned';
  end if;

  raise notice 'city_wikidata_signals OK: % with qid, % dispositioned, % coord-unswept',
    v ->> 'rows_with_qid', v ->> 'dispositioned', v ->> 'coord_unswept';
end
$verify$;
