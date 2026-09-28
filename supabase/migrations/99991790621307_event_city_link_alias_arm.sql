-- ============================================================================
-- run_event_city_link learns to read city_aliases — but may not DE-QUALIFY a name
-- ----------------------------------------------------------------------------
-- `cities` stores the ENGLISH exonym for much of Europe (Munich, Cologne,
-- Vienna, Geneva, Brussels) while German- and French-language sources send the
-- endonym (München, Köln, Wien, Genf, Bruxelles). `run_event_city_link` matches
-- `lower(cities.name) = lower(events.city)` and nothing else, so every one of
-- those events stayed unlinked forever — and with `city_id` null the whole
-- downstream cascade is dead too: no `state`, no centroid coordinates from
-- `run_event_geo_fill`, no timezone from `run_event_timezone_fill`.
--
-- The alias data was already there. `city_aliases` holds 36,446 rows including
-- `München → Munich` and `Köln → Cologne`; the harvester had done its job and
-- the linker simply never consulted the table. `city_resolve_or_create` (the
-- newer resolver) does read it — this closes the gap on the older path.
--
-- Measured before writing: 274 of 1,070 unlinked events would match an alias
-- scoped to their own country. 246 of those were verified correct by hand and
-- backfilled. The remaining 28 are why this migration is not a one-line join.
--
-- ── THE DE-QUALIFICATION TRAP, WHICH IS WHAT THE GUARD IS FOR ────────────────
-- `city_aliases` contains qualified-name rows whose alias is the BARE name, so
-- "exactly one alias target in this country" is satisfied while being wrong:
--
--   Springfield  → "Springfield Township", Pennsylvania, pop 25,070
--                  ...on 27 events whose titles read "Miss Gay Southwest
--                  Missouri", i.e. Springfield MISSOURI, which is not in `cities`
--                  at all. This is the documented same-name collision that once
--                  attached 116 events to the wrong city.
--   Schwerin     → "Schwerin, Brandenburg", whose region_name says HESSE and
--                  population 98,733 — internally incoherent, and certainly not
--                  the Mecklenburg capital that "CSD Schwerin" means.
--
-- In BOTH cases the intended city is absent from `cities`, so the correct answer
-- is no link, and no amount of alias uniqueness can discover that. What the two
-- share structurally is that the target name is the alias plus a trailing
-- qualifier. Hence the rule, which is the whole content of this change:
--
--     AN ALIAS MAY RENAME A CITY. IT MAY NOT DE-QUALIFY ONE.
--
-- Allowed (a rename, or mere diacritics — the target is not the alias + suffix):
--     Köln→Cologne  Wien→Vienna  Genf→Geneva  Bruxelles→Brussels
--     Zurich→Zürich  Sao Paulo→São Paulo  Reykjavik→Reykjavík
--     Frankfurt am Main→Frankfurt  New York City→New York   (target is SHORTER)
-- Refused (target = alias + trailing qualifier):
--     Springfield→Springfield Township   Schwerin→Schwerin, Brandenburg
--
-- ── THE COST IS REAL AND IS ACCEPTED DELIBERATELY ───────────────────────────
-- The rule cannot tell a harmful de-qualification from a harmless one, so it
-- also refuses four pairs that are correct: Washington→"Washington, D.C." (14
-- events), Esslingen→"Esslingen am Neckar" (2), Klagenfurt→"Klagenfurt am
-- Wörthersee" (1), Las Palmas→"Las Palmas de Gran Canaria" (1). That is 18 true
-- positives given up to refuse 28 true negatives, and the asymmetry is the
-- point: an unlinked event is recoverable and visible in the unlinked count, a
-- wrong city is neither. Those four were backfilled by hand where verified.
--
-- ── WHY A HELPER AND NOT AN INLINE JOIN ─────────────────────────────────────
-- `CREATE OR REPLACE FUNCTION` restates the entire 100-line body, so any future
-- edit to this runner reprints the rule and can drop it by transcription. With
-- the rule in `city_by_alias` the body only calls it, and the guard test asserts
-- both the helper's behaviour AND that the runner still calls it.
--
-- Guards A and B are untouched and still apply: the alias arm produces a
-- CANDIDATE, which then passes through the same state-contradiction and
-- gaycities-metro-slug checks as an exact-name candidate. It is a fallback —
-- it runs only when the exact-name lookup found nothing, so it can never
-- override an exact match.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The rule. STABLE + SECURITY INVOKER: it reads only reference tables and is
-- called from an already-gated runner, so it needs no privileges of its own.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.city_by_alias(p_country_id uuid, p_city text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $$
  WITH norm AS (
    SELECT lower(btrim(coalesce(p_city, ''))) AS alias_l
  ),
  candidate AS (
    SELECT c.id, c.name
    FROM public.city_aliases a
    JOIN public.cities c ON c.id = a.city_id
    CROSS JOIN norm n
    WHERE p_country_id IS NOT NULL
      AND n.alias_l <> ''
      AND c.country_id = p_country_id
      AND c.duplicate_of_id IS NULL
      AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
      AND lower(btrim(a.alias)) = n.alias_l
  ),
  distinct_candidate AS (
    -- One city may carry the SAME alias on several rows, so collapse to the
    -- distinct city before counting. min(uuid) does not exist in Postgres.
    SELECT (array_agg(id ORDER BY id))[1] AS id,
           (array_agg(name ORDER BY id))[1] AS name,
           count(*) AS n
    FROM (SELECT DISTINCT id, name FROM candidate) d
  )
  SELECT dc.id
  FROM distinct_candidate dc
  CROSS JOIN norm n
  WHERE dc.id IS NOT NULL
    -- Exactly one city in this country answers to the alias.
    AND dc.n = 1
    -- AND the alias must not merely be the target minus a trailing qualifier.
    -- Compared unaccented, so "Zurich" vs "Zürich" reads as a rename rather than
    -- a prefix. A regex, not LIKE: LIKE has no character classes, so a
    -- `LIKE alias || '[ ,-]%'` test searches for the literal text "[ ,-]" and can
    -- never be true — it would look like a guard and enforce nothing.
    -- The alias is regex-escaped because real city names contain '.' and '('
    -- (e.g. "Frankfurt a. M.", "Rotenburg (Wümme)").
    AND NOT (
      extensions.unaccent('extensions.unaccent'::regdictionary, lower(dc.name))
        ~ ('^' || regexp_replace(
               extensions.unaccent('extensions.unaccent'::regdictionary, n.alias_l),
               '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '[ ,\-]')
    );
$$;

COMMENT ON FUNCTION public.city_by_alias(uuid, text) IS
  'Resolve a city name to an id through city_aliases, scoped to one country. Returns NULL unless exactly one city answers to the alias AND the alias is not simply the target name minus a trailing qualifier — "Springfield" must not resolve to "Springfield Township" (the events are Missouri''s) and "Schwerin" must not resolve to "Schwerin, Brandenburg". An alias may rename a city; it may not de-qualify one. The cost of that rule is that four correct pairs are also refused (Washington/Washington, D.C. among them); an unlinked event is recoverable, a wrong city is not.';

REVOKE ALL ON FUNCTION public.city_by_alias(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.city_by_alias(uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- The runner. Body is 99991790621307's predecessor VERBATIM apart from the
-- single `if v_city is null then ... end if;` fallback and the stamp's
-- matched_on key — guards A and B are byte-identical.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_event_city_link(p_batch integer DEFAULT 300, p_force boolean DEFAULT false)
RETURNS TABLE(processed integer, linked integer, blocked integer)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  r          record;
  v_city     uuid;
  v_region   text;
  v_proc     integer := 0;
  v_linked   integer := 0;
  v_blocked  integer := 0;
  v_cnorm    text;
  v_suffix   text;
  v_claimed  text;
  v_block    boolean;
  v_via      text;
begin
  for r in
    select e.id, e.city, e.country, e.country_id, e.state,
           lower(replace(coalesce(
             (select coalesce(es.payload->'normalized', es.payload)->'metadata'->>'gaycities_subdomain'
              from public.event_sources es where es.event_id = e.id limit 1), ''), '-', '')) sub
    from public.events e
    where e.duplicate_of_id is null
      and e.city_id is null
      and coalesce(btrim(e.city), '') <> ''
      and (p_force or not (coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_city_link'))
    order by (e.start_date >= now()) desc nulls last, e.start_date desc nulls last, e.id
    limit greatest(p_batch, 1)
  loop
    v_proc := v_proc + 1;
    v_block := false;
    v_city := null; v_region := null; v_claimed := null; v_via := 'name';

    select c.id, c.region_name into v_city, v_region
    from public.cities c
    where c.duplicate_of_id is null
      and c.country_id = coalesce(
            r.country_id,
            (select co.id from public.countries co where upper(co.code) = upper(btrim(r.country)) limit 1))
      and lower(btrim(c.name)) = lower(btrim(r.city))
    limit 1;

    -- FALLBACK ONLY. An exact name match always wins; this runs when there is
    -- none, which is the exonym case (München, Köln, Wien, Genf, Bruxelles).
    -- city_by_alias refuses an ambiguous alias and refuses to de-qualify a name.
    if v_city is null then
      v_city := public.city_by_alias(
        coalesce(r.country_id,
                 (select co.id from public.countries co where upper(co.code) = upper(btrim(r.country)) limit 1)),
        r.city);
      if v_city is not null then
        v_via := 'alias';
        select c.region_name into v_region from public.cities c where c.id = v_city;
      end if;
    end if;

    if v_city is not null then
      -- Guard A: the event's own state must not contradict the candidate.
      -- Only a genuine disagreement between two region NAMES counts.
      if public.regions_contradict(r.state, v_region) then
        v_block := true;
      end if;

      -- Guard B: gaycities metro slug = <cityname><statecode>. Unlike guard A
      -- this blocks an uncorroborated claim too: the slug is explicit evidence,
      -- so failing to confirm it is itself a reason not to link.
      if not v_block and r.sub <> '' then
        v_cnorm := replace(replace(replace(lower(btrim(r.city)), ' ', ''), '.', ''), '-', '');
        if left(r.sub, length(v_cnorm)) = v_cnorm then
          v_suffix := substr(r.sub, length(v_cnorm) + 1);
          select nm into v_claimed from (values
            ('al','Alabama'),('ak','Alaska'),('az','Arizona'),('ar','Arkansas'),('ca','California'),
            ('co','Colorado'),('ct','Connecticut'),('de','Delaware'),('fl','Florida'),('ga','Georgia'),
            ('hi','Hawaii'),('id','Idaho'),('il','Illinois'),('in','Indiana'),('ia','Iowa'),('ks','Kansas'),
            ('ky','Kentucky'),('la','Louisiana'),('me','Maine'),('maine','Maine'),('md','Maryland'),
            ('ma','Massachusetts'),('mi','Michigan'),('mn','Minnesota'),('ms','Mississippi'),
            ('mo','Missouri'),('mt','Montana'),('ne','Nebraska'),('nv','Nevada'),('nh','New Hampshire'),
            ('nj','New Jersey'),('nm','New Mexico'),('ny','New York'),('nc','North Carolina'),
            ('nd','North Dakota'),('oh','Ohio'),('ok','Oklahoma'),('or','Oregon'),('pa','Pennsylvania'),
            ('ri','Rhode Island'),('sc','South Carolina'),('sd','South Dakota'),('tn','Tennessee'),
            ('tx','Texas'),('ut','Utah'),('vt','Vermont'),('va','Virginia'),('wa','Washington'),
            ('wv','West Virginia'),('wi','Wisconsin'),('wy','Wyoming')
          ) t(ab, nm) where t.ab = v_suffix;
          -- Compare through the signal so 'SC' and 'South Carolina' agree.
          if v_claimed is not null
             and lower(v_claimed) is distinct from public.region_name_signal(v_region) then
            v_block := true;
          end if;
        end if;
      end if;
    end if;

    if v_block then
      v_city := null;
      v_blocked := v_blocked + 1;
    elsif v_city is not null then
      v_linked := v_linked + 1;
    end if;

    update public.events set
      city_id = coalesce(v_city, city_id),
      needs_attention = case when v_block then true else needs_attention end,
      enrichment_status = jsonb_set(
        coalesce(enrichment_status, '{}'::jsonb), '{event_city_link}',
        case when v_block
          then jsonb_build_object('at', now(), 'linked', false,
                 'blocked', 'same-name-city collision; source metro or state contradicts cities.region_name')
          else jsonb_build_object('at', now(), 'linked', v_city is not null,
                 -- which arm found it, so an alias link is auditable after the fact
                 'matched_on', case when v_city is not null then v_via else null end)
        end, true)
    where id = r.id;
  end loop;

  processed := v_proc; linked := v_linked; blocked := v_blocked; return next;
end;
$function$;

-- ----------------------------------------------------------------------------
-- Postconditions. Assert BEHAVIOUR, not source text: a text check passes on a
-- body that merely mentions the helper and fails on a rewrite that preserves it.
-- ----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_de uuid;
  v_us uuid;
  v_got uuid;
  v_name text;
BEGIN
  SELECT id INTO v_de FROM public.countries WHERE code = 'DE';
  SELECT id INTO v_us FROM public.countries WHERE code = 'US';

  -- P1: the exonyms this exists for must resolve.
  SELECT c.name INTO v_name FROM public.cities c WHERE c.id = public.city_by_alias(v_de, 'München');
  IF v_name IS DISTINCT FROM 'Munich' THEN
    RAISE EXCEPTION 'P1: München resolved to % (expected Munich)', coalesce(v_name, '<null>');
  END IF;
  SELECT c.name INTO v_name FROM public.cities c WHERE c.id = public.city_by_alias(v_de, 'Köln');
  IF v_name IS DISTINCT FROM 'Cologne' THEN
    RAISE EXCEPTION 'P2: Köln resolved to % (expected Cologne)', coalesce(v_name, '<null>');
  END IF;

  -- P3/P4: the de-qualification trap must be REFUSED. These are the whole point.
  v_got := public.city_by_alias(v_us, 'Springfield');
  IF v_got IS NOT NULL THEN
    RAISE EXCEPTION 'P3: Springfield resolved to % — de-qualification guard is not working',
      (SELECT name FROM public.cities WHERE id = v_got);
  END IF;
  v_got := public.city_by_alias(v_de, 'Schwerin');
  IF v_got IS NOT NULL THEN
    RAISE EXCEPTION 'P4: Schwerin resolved to % — de-qualification guard is not working',
      (SELECT name FROM public.cities WHERE id = v_got);
  END IF;

  -- P5: a NULL country may never resolve — country scoping is what keeps the
  -- Argentine San Juan away from the Puerto Rican one.
  IF public.city_by_alias(NULL, 'München') IS NOT NULL THEN
    RAISE EXCEPTION 'P5: a null country resolved an alias';
  END IF;
  IF public.city_by_alias(v_de, '') IS NOT NULL OR public.city_by_alias(v_de, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'P6: an empty city name resolved an alias';
  END IF;

  -- P7: the runner must actually CALL the helper, or the rule is dead code.
  IF position('city_by_alias' in pg_get_functiondef(
       'public.run_event_city_link(integer,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'P7: run_event_city_link does not call city_by_alias';
  END IF;

  -- P8: and it must remain a FALLBACK — the exact-name lookup has to come first.
  IF position('lower(btrim(c.name)) = lower(btrim(r.city))' in pg_get_functiondef(
       'public.run_event_city_link(integer,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'P8: the exact-name arm is gone';
  END IF;

  -- P9: anon must not reach the helper.
  IF has_function_privilege('anon', 'public.city_by_alias(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P9: anon can execute city_by_alias';
  END IF;

  RAISE NOTICE 'city_by_alias: exonyms resolve, de-qualification refused, runner calls it as a fallback';
END $verify$;
