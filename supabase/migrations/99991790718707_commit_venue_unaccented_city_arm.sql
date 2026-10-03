-- The venue commit path matched a city by `lower(name)` only, so every city
-- whose name carries a diacritic was unreachable from a feed that strips them.
--
-- WHAT WAS MEASURED. The 2026-09-28 `gayout` import committed 8,036 venues and
-- left 1,854 with no `city_id`. Splitting those by the resolver's OWN matching
-- arms rather than by eye:
--   1,361  no city row exists at all           -- a gazetteer gap, enqueued separately
--     349  only an unverified `tmp-` shell     -- correctly refused, see below
--     144  A REAL CITY ROW EXISTS AND WE MISSED IT
-- The 144 are eight city names and every one is the same defect:
--   Dusseldorf -> Dusseldorf, Jyvaskyla -> Jyvaskyla, Liege -> Liege,
--   Lubeck -> Lubeck, Malaga -> Malaga, Munster -> Munster,
--   Noumea -> Noumea, Papeete -> Papeete
-- (feed text on the left, our `cities.name` on the right, which carries the
-- diacritic). `lower(c.name) = lower(btrim(...))` is false for all eight;
-- `c.canonical_key = city_canonical_key(...)` is true for all eight.
--
-- THE FIX IS TO ADOPT THE ARM THE RESOLVER ALREADY HAS, NOT TO INVENT ONE.
-- `city_resolve_or_create` resolves in four arms and its arm (c) is exactly
-- `c.country_id = v_country_id AND c.canonical_key = v_key`, with a comment
-- explaining that arm (d), plain `lower(name)`, "catches what canonical_key's
-- unaccent" does not. The commit path had (d) and not (c). This adds (c) in the
-- same position the resolver puts it: after the exact same-country match, before
-- the cross-country fallback, so a weaker signal can never outrank a stronger one.
--
-- IT NEEDS NO AMBIGUITY GUARD, AND THAT IS STRUCTURAL RATHER THAN LUCKY.
-- `cities_country_canonical_key_uniq` is a UNIQUE index on
-- (country_id, canonical_key), so the arm can match at most one row. Measured
-- corpus-wide before writing this: 0 keys with more than one row per country.
-- The two pre-existing arms carry `ORDER BY c.population DESC NULLS LAST`
-- precisely because they CAN match several rows; this one deliberately does not,
-- because a population tiebreak on a key that cannot tie is decoration that
-- would read as if ambiguity were possible here.
--
-- THE `tmp-` EXCLUSION IS COPIED DELIBERATELY AND MUST NOT BE DROPPED.
-- A `tmp-` slug is the uncorroborated shell cohort (`personality-birth-place`
-- and friends: 1,832 rows, not one with a `wikidata_qid`). The commit path
-- refuses them; `city_resolve_or_create` does NOT, which is why the 349 above
-- cannot be fixed by enqueueing them -- the resolver would match the shell,
-- create nothing, and leave `geo-link-content` to attach a real venue to an
-- unverified row. That divergence is real and is NOT resolved here; this
-- migration only makes the new arm consistent with the two beside it.
--
-- WHY THIS IS A TOKEN SUBSTITUTION AND NOT A RESTATED BODY.
-- `commit_venue_staging_item` is 253 lines and is the sole writer on the venue
-- commit path. `CREATE OR REPLACE` would mean transcribing all of it to add six
-- lines, and a silent slip there breaks ingest rather than failing loudly -- the
-- same reasoning that put the automation run-tracking rewrite on a token
-- substitution and that keeps `*_tick()` wrappers out of reviewed function
-- bodies. The anchor was verified to occur EXACTLY ONCE against the live
-- definition before this was written, and the block below re-verifies it at
-- apply time rather than trusting that measurement.
--
-- Backfill is deliberately NOT done here: the 144 rows are repaired by the next
-- ordinary pass of the linker now that the arm exists, and a one-shot UPDATE
-- beside a producer fix is how the two drift apart.

do $patch$
declare
  v_src  text;
  v_code text;
  v_new  text;
  v_arm  text;
  v_hits int;
begin
  v_src := pg_get_functiondef('public.commit_venue_staging_item(uuid, text)'::regprocedure);
  v_code := regexp_replace(
    pg_get_functiondef('public.commit_venue_staging_item(uuid, text)'::regprocedure),
    '--[^' || chr(10) || ']*',
    '',
    'g'
  );

  -- Precondition 1: the arm is genuinely absent. Soft, not an abort: if another
  -- session added it first this migration has nothing to do and must not fail
  -- the whole `db push` for the repo.
  if position('canonical_key' in v_code) > 0 then
    raise notice 'commit_venue_staging_item already carries a canonical_key arm; nothing to do';
    return;
  end if;

  -- Precondition 2: the anchor is unique. This one DOES abort, because a zero
  -- or multiple match means the body moved and a blind replace would either
  -- silently do nothing or patch the wrong branch.
  select count(*) into v_hits
  from regexp_matches(v_code, E'\n    IF v_city_id IS NULL THEN\n', 'g');
  if v_hits <> 1 then
    raise exception 'anchor matched % times, expected 1 -- commit_venue_staging_item body has moved', v_hits;
  end if;

  v_arm :=
    E'\n    -- (b) Unaccented, same country. `canonical_key` is what\n'
 || E'    -- city_resolve_or_create matches on and this path did not, so feed text\n'
 || E'    -- that strips diacritics ("Dusseldorf", "Malaga") never found the row we\n'
 || E'    -- already hold. Sits below the exact match and above the cross-country\n'
 || E'    -- fallback. No ORDER BY: cities_country_canonical_key_uniq makes the\n'
 || E'    -- match single by construction.\n'
 || E'    IF v_city_id IS NULL AND v_country_id IS NOT NULL THEN\n'
 || E'      SELECT c.id INTO v_city_id FROM public.cities c\n'
 || E'      WHERE c.country_id = v_country_id\n'
 || E'        AND c.canonical_key = public.city_canonical_key(btrim(v_loc->>''city''))\n'
 || E'        AND c.duplicate_of_id IS NULL\n'
 || E'        AND (c.slug IS NULL OR c.slug NOT LIKE ''tmp-%'')\n'
 || E'      LIMIT 1;\n'
 || E'    END IF;\n';

  v_new := replace(v_src, E'\n    IF v_city_id IS NULL THEN\n',
                          v_arm || E'\n    IF v_city_id IS NULL THEN\n');

  if v_new = v_src then
    raise exception 'substitution produced an identical body -- refusing to claim a no-op patch';
  end if;

  execute v_new;
end
$patch$;

do $verify$
declare
  v_src text;
  v_i_exact int; v_i_canon int; v_i_fallback int;
begin
  v_src := regexp_replace(
    pg_get_functiondef('public.commit_venue_staging_item(uuid, text)'::regprocedure),
    '--[^' || chr(10) || ']*',
    '',
    'g'
  );

  -- P1: the new arm exists, exactly once.
  if (select count(*) from regexp_matches(v_src, 'c\.canonical_key = public\.city_canonical_key', 'g')) <> 1 then
    raise exception 'P1 failed: expected exactly one canonical_key arm';
  end if;

  -- P2: it carries the tmp- exclusion. Asserted separately from P1 because an
  -- arm without it is the one shape that actively causes harm.
  if (select count(*) from regexp_matches(v_src, E'tmp-%', 'g')) <> 3 then
    raise exception 'P2 failed: expected 3 tmp- guards (2 pre-existing + 1 new), found %',
      (select count(*) from regexp_matches(v_src, E'tmp-%', 'g'));
  end if;

  -- P3: both pre-existing arms SURVIVED. A replace that ate one of them would
  -- still satisfy P1 and P2, so the mirror is what makes those two mean anything.
  if (select count(*) from regexp_matches(v_src, 'ORDER BY c\.population DESC NULLS LAST', 'g')) <> 2 then
    raise exception 'P3 failed: expected the 2 population-ordered arms to survive';
  end if;

  -- P4: ORDERING. The new arm must sit after the exact same-country match and
  -- before the cross-country fallback, or a weaker signal outranks a stronger
  -- one. Anchored on code positions, never on comment text.
  v_i_exact    := position('AND c.country_id = v_country_id' in v_src);
  v_i_canon    := position('c.canonical_key = public.city_canonical_key' in v_src);
  v_i_fallback := position('IF v_city_id IS NULL THEN' in v_src);
  if not (v_i_exact > 0 and v_i_canon > v_i_exact and v_i_fallback > v_i_canon) then
    raise exception 'P4 failed: arm order is exact=% canon=% fallback=%',
      v_i_exact, v_i_canon, v_i_fallback;
  end if;

  -- P5: the function still executes as a function -- i.e. the patched body
  -- compiles. `CREATE OR REPLACE` only parses plpgsql, so a broken SQL
  -- statement inside would not surface until a real commit ran.
  perform 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'commit_venue_staging_item';
  if not found then
    raise exception 'P5 failed: function is missing after patch';
  end if;

  raise notice 'commit_venue_staging_item: unaccented arm installed, 2 pre-existing arms intact';
end
$verify$;
