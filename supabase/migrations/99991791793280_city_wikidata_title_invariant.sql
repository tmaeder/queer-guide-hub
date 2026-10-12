-- city_wikidata_signals: the title invariant asserted the EMPTINESS, not the identity.
--
-- `99991790359075` wrote three zero-invariants over the rows a wrong-entity repair
-- has dispositioned. Two of them compare against the value that was retracted:
--
--   qid_regressed       wikidata_qid = field_provenance->...->>'retracted_value'
--   retracted_desc_back description  = field_provenance->...->>'from'
--
-- The title one did not. It fired on ANY non-null `wikipedia_title`:
--
--   where ...->>'retracted_wikipedia_title' is not null and wikipedia_title is not null
--
-- so a row that was correctly RE-LINKED to a different, right entity reads as a
-- regression. That is the rule this repo has already recorded three times: a
-- repair that REMOVES a value creates a state the system is designed to fill back
-- in, so asserting that emptiness pins the gap rather than the fix. Assert what
-- must never be true again, not what is momentarily true. The two sibling arms in
-- this same function already got it right, which is the evidence this is a defect
-- and not a deliberate choice.
--
-- MEASURED ON PROD. 12 rows carry a retracted title. ELEVEN are still cleared
-- (`wikidata_qid` null, `wikipedia_title` null) and are the namesake cohort the
-- repair exists for -- Arabkir/Arapgir, City of Troy/Troy, Kos/Koszalin,
-- Par/Paris, Pittsburg/Pittsburgh, Saint Peters/Saint Petersburg, and so on.
-- ONE was re-linked forward and is the false alarm:
--
--   frisco-us-xyxtu   refuted Q62 "San Francisco"  ->  now Q128269 "Frisco, Texas"
--
-- "Frisco" is a nickname for San Francisco, which is exactly how the original
-- sweep mislinked it. The new identifier was resolved live against Wikidata before
-- this migration was written, and three independent signals agree: Q128269's own
-- English description reads "city in Collin and Denton counties in Texas", its
-- enwiki sitelink is "Frisco, Texas", and its P625 sits 1.2 km from the row's own
-- coordinates -- against ~2,300 km to the refuted Q62. The row carries
-- region_name 'Texas', country US, 5 venues and 1 event. The data is right and
-- the gate was wrong, so the gate is what changes here. Nothing is written to
-- `cities`.
--
-- THE REPLACEMENT IS TWO ARMS, and it is strictly STRONGER than what it replaces
-- for every one of the 11 cleared rows rather than merely narrower:
--
--   (a) the REFUTED title is back, whatever identifier the row now carries; and
--   (b) the row carries ANY title while it has NO identifier at all -- nothing may
--       re-fetch by a cached title for a row we deliberately refused to identify,
--       which is the Kowloon terminal state (`99600101100000`).
--
-- Arm (b) covers all 11 cleared rows exactly as the old broad form did, because
-- their `wikidata_qid` is null; measured, 0 rows corpus-wide carry a title with a
-- null qid. What the old form caught and this does not is a row re-linked to a new
-- entity with that entity's own title -- which is the repair working, not a defect.
--
-- The examples CTE repeats the same predicate and is patched identically. Fixing
-- the counter and leaving the example list is how the gate keeps naming a row it
-- no longer counts -- the same two-copies trap `78000101100000` recorded for the
-- haversine casts, which is why the postcondition asserts the comparison appears
-- TWICE and the broad form ZERO times.
--
-- The function is restated rather than patched through `pg_get_functiondef`,
-- which is safe here because it was checked first: the live body carries exactly
-- two mentions of `retracted_wikipedia_title` and still contains the broad form,
-- i.e. it has not diverged from `99991790359075`. (`99991790719601`'s rule applies
-- when live and repo HAVE diverged; asserting that is cheaper than assuming it.)

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

  -- ZERO-INVARIANT 2: the WRONG article is cached again. Scoped to rows whose
  -- retraction actually recorded a title, so a repair that had no wrong title to
  -- clear cannot make this fire. Two arms, per this migration's header: the
  -- refuted title is back, or the row caches a title while carrying no identifier.
  -- A row re-linked to a DIFFERENT entity, with that entity's own title, is the
  -- repair succeeding and must not read as a regression.
  select count(*) into v_title_back
    from cities
   where field_provenance->'wikidata_qid'->>'retracted_wikipedia_title' is not null
     and wikipedia_title is not null
     and (wikipedia_title = field_provenance->'wikidata_qid'->>'retracted_wikipedia_title'
          or wikidata_qid is null);

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
            and wikipedia_title is not null
            and (wikipedia_title = field_provenance->'wikidata_qid'->>'retracted_wikipedia_title'
                 or wikidata_qid is null))
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
  'Watches for a refuted city Wikidata identifier, the REFUTED cached wikipedia_title (or any cached title on a row with no identifier), or a retracted description, COMING BACK. A row re-linked to a different, corroborated entity is the repair working, not a regression. Cannot judge a new identifier -- SQL cannot call Wikidata. service_role only.';

-- CREATE OR REPLACE preserves grants, but restating them costs nothing and a
-- future plain CREATE would otherwise leave this DEFINER aggregate PUBLIC.
revoke all on function public.city_wikidata_signals() from public;
revoke all on function public.city_wikidata_signals() from anon;
revoke all on function public.city_wikidata_signals() from authenticated;
grant execute on function public.city_wikidata_signals() to service_role;

do $verify$
declare
  v        jsonb;
  v_src    text;
  v_cmp    int;
  v_broad  int;
  v_titled int;
  v_relink int;
begin
  select public.city_wikidata_signals() into v;

  if coalesce(v ->> 'probe_ok', '') <> 'true' then
    raise exception 'P0 failed: city_wikidata_signals did not return probe_ok';
  end if;

  -- P1. The state this migration exists to reach. All three invariants clean,
  -- including the one that was red for days on a correctly repaired row.
  if (v ->> 'wrong_title_back')::int <> 0 then
    raise exception 'P1 failed: % row(s) still read as a returned wrong title: %',
      v ->> 'wrong_title_back', v ->> 'examples';
  end if;
  if (v ->> 'qid_regressed')::int <> 0 then
    raise exception 'P1 failed: % row(s) carry a refuted qid: %',
      v ->> 'qid_regressed', v ->> 'examples';
  end if;
  if (v ->> 'retracted_desc_back')::int <> 0 then
    raise exception 'P1 failed: % retracted description(s) returned: %',
      v ->> 'retracted_desc_back', v ->> 'examples';
  end if;

  -- P2. NON-VACUITY. Zero above is equally true of an empty corpus, a revoked
  -- grant and a function returning a literal. Both controls are inherited from
  -- 99991790359075 deliberately: a narrowing that also narrowed the cohort it
  -- watches would pass P1 by watching nothing.
  if (v ->> 'rows_with_qid')::int < 1000 then
    raise exception 'P2 failed: only % rows with a Q-id -- the probe is not reading the corpus',
      v ->> 'rows_with_qid';
  end if;
  if (v ->> 'dispositioned')::int < 11 then
    raise exception 'P2 failed: only % dispositioned rows -- expected at least the 11-row repair',
      v ->> 'dispositioned';
  end if;

  -- P3. The cohort arm (b) protects must still EXIST and still be covered. These
  -- are the rows whose identifier the repair cleared; if a later pass re-linked
  -- them all, arm (b) would be guarding an empty set and P1 would be hollow.
  select count(*) into v_titled
    from cities
   where field_provenance->'wikidata_qid'->>'retracted_wikipedia_title' is not null;
  if v_titled < 12 then
    raise exception 'P3 failed: only % rows carry a retracted title -- expected the measured 12', v_titled;
  end if;

  select count(*) into v_relink
    from cities
   where field_provenance->'wikidata_qid'->>'retracted_wikipedia_title' is not null
     and wikidata_qid is not null
     and wikipedia_title is not null;
  -- The whole point: at least one row IS legitimately re-linked and titled, and it
  -- is no longer counted. Zero here would mean the corpus no longer contains the
  -- shape that made the old form fire, so P1 would prove nothing about the change.
  if v_relink < 1 then
    raise exception 'P3 failed: no re-linked titled row left -- P1 cannot distinguish the fix from the bug';
  end if;

  -- P4. BOTH copies of the predicate moved. The counter and the examples CTE carry
  -- the same condition, and fixing one leaves the gate naming a row it no longer
  -- counts. Asserted by COUNT, because a single-occurrence check passes on the
  -- surviving copy.
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'city_wikidata_signals';

  v_cmp := (length(v_src) - length(replace(v_src,
    'wikipedia_title = field_provenance->''wikidata_qid''->>''retracted_wikipedia_title''', '')))
    / length('wikipedia_title = field_provenance->''wikidata_qid''->>''retracted_wikipedia_title''');
  if v_cmp <> 2 then
    raise exception 'P4 failed: the title comparison appears % time(s), expected 2 (counter + examples)', v_cmp;
  end if;

  v_broad := (length(v_src) - length(replace(v_src,
    'retracted_wikipedia_title'' is not null
     and wikipedia_title is not null;', '')))
    / length('retracted_wikipedia_title'' is not null
     and wikipedia_title is not null;');
  if v_broad <> 0 then
    raise exception 'P4 failed: the broad any-title form is still present % time(s)', v_broad;
  end if;

  raise notice 'city_wikidata_signals OK: title_back %, dispositioned %, retracted-titled %, re-linked %',
    v ->> 'wrong_title_back', v ->> 'dispositioned', v_titled, v_relink;
end
$verify$;
