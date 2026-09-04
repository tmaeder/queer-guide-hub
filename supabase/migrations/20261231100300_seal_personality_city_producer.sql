-- Seal the second personality->city producer, and hide merged rows from the
-- trip picker.
--
-- WHAT PROMPTED THIS
--
-- Three "Essen" rows under Cities: `Essen`, `Freisenbruch, Essen`,
-- `Ruettenscheid, Essen`. The MERGE was never the problem -- both districts
-- have carried `duplicate_of_id = <Essen>` since 2026-08-25 21:21
-- (`20260929120000_merge_essen_districts.sql`, audited in `city_merge_audit`,
-- one personality each reparented), search holds only Essen, and the public
-- pages already resolve the old slugs to the survivor. What was wrong is that
-- the admin CMS list read the table raw, and that a cron kept minting more.
--
-- (1) THE PRODUCER WAS NEVER SEALED.
--
-- `20260811100100_personality_city_resolve_queue.sql` rewrote
-- `match_personality_city()` so the BEFORE-trigger path stopped inserting
-- cities, and its header records that 1,824 of 5,136 live rows came from it.
-- `backfill_personality_geo()` -- the same logic, in a different function,
-- driven by cron `personality-geo-backfill` (`40 4 * * *`, enabled) -- was not
-- touched and has kept the old body ever since:
--
--   * `trim(split_part(birth_place,'(',1))` strips a parenthetical and NEVER
--     the `, Region` tail. That is literally how a city named
--     "Freisenbruch, Essen" came to exist.
--   * no district / state / county test at all. On 2026-08-29 it created
--     Sonoma County, Manitoba, Amazonas, Rio Grande do Sul and Changyang Tujia
--     Autonomous County as cities.
--   * it does not set `seo_indexable = false`, which the 2026-06 version did,
--     so the new shells are INDEXABLE where the old cohort was not.
--   * the existing-city probe is `c.name ILIKE birth_place` with NO country
--     filter and `ORDER BY population DESC` -- it actively prefers the larger
--     same-name city. That is the Portland/Charleston class this repo has
--     already paid for twice (`20260802090844`, `20260802100455`).
--   * the country comes from `nationality`, a demonym feeding a geographic
--     column.
--
-- The fix is not another guard list. `city_resolve_or_create` already exists,
-- already splits qualified names, already probes canonical_key / QID / alias /
-- name+country, already refuses rather than guessing between two candidates,
-- and already enforces an evidence bar before creating anything. So this
-- function stops resolving on its own terms and stops writing `cities`
-- entirely: it asks the resolver with `p_allow_create => false`, and anything
-- unresolved goes into `city_resolve_queue`, where the existing `*/15`
-- `city_resolve_drain` handles it under `p_actor => 'drain'` -- the actor that
-- cannot waive the evidence bar.
--
-- Note what this buys for free: `merge_cities` registers the dropped row's own
-- name as a `city_aliases` entry, so the resolver's alias arm now sends a
-- future "Freisenbruch, Essen" straight to Essen instead of re-minting it.
--
-- The cron stays enabled -- linking personalities to cities is wanted, and
-- `admin_automations.action.command` is unchanged because it is the same call.
--
-- (2) TERMINAL SENTINEL. The old function re-examined the same unlinked
-- personalities every night. Enqueueing is idempotent only while the queue row
-- is `pending` (that is the ON CONFLICT target), so once the drain gives up and
-- marks a row `data_unavailable` a naive re-enqueue would insert a fresh row
-- every single night. The selection therefore skips any personality that
-- already has a queue row in ANY state.
--
-- (3) `search_cities` -- the trip-destination autocomplete -- filtered nothing.
-- A merged-away city is a redirect tombstone and must not be offerable as a
-- destination. Ghost rows are excluded on the same line, matching the rule
-- `20261016110000_archived_rows_leave_search.sql` already applies to the search
-- index: `shell_status='ghost'` means "not a place", and a picker that offers
-- one is offering a trip to nowhere.
--
-- (4) The five rows from 2026-08-29 are dispositioned REVERSIBLY via
-- `archive_city_as_nonplace`, not deleted. The hard-delete precedent
-- (`20261001120000`) applied to a hand-reviewed 57-row cohort and is the
-- exception, not the rule. Each personality is unlinked first; all five carry
-- the region name in `birth_place` already, so nothing readable is lost.

-- ── 1. Producer ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.backfill_personality_geo(
  p_limit integer DEFAULT 200,
  p_dry_run boolean DEFAULT false
)
RETURNS TABLE(out_personality_id uuid, out_city_id uuid, out_country_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r           RECORD;
  res         RECORD;
  _raw        TEXT;
  _paren      TEXT;
  _cc         TEXT;
  _cc_country UUID;
  _region     TEXT;
  _base       TEXT;
  _country_id UUID;
  _city_id    UUID;
BEGIN
  FOR r IN
    SELECT pp.id, pp.birth_place, pp.nationality, pp.country_id AS cur_country
    FROM public.personalities pp
    WHERE pp.city_id IS NULL
      AND pp.duplicate_of_id IS NULL
      AND (pp.birth_place IS NOT NULL OR pp.nationality IS NOT NULL)
      -- Terminal sentinel: a personality the queue has already seen is not
      -- work. Enqueueing is idempotent only while the row is `pending` (that
      -- is the ON CONFLICT target), so without this, every night after the
      -- drain gives up would add another queue row for the same person.
      AND NOT EXISTS (
        SELECT 1 FROM public.city_resolve_queue q
         WHERE q.requester = 'personality' AND q.requester_ref = pp.id
      )
    ORDER BY pp.view_count DESC NULLS LAST
    LIMIT p_limit
  LOOP
    _country_id := r.cur_country;
    _city_id    := NULL;
    _cc         := NULL;
    _cc_country := NULL;
    _region     := NULL;
    _raw        := nullif(btrim(coalesce(r.birth_place, '')), '');
    _base       := _raw;

    -- The trailing parenthetical is EVIDENCE, not noise: 2,628 of the 4,889
    -- birth places carry one and it is "(DE)" or "(NY, US)" -- a country code,
    -- sometimes with a region in front. The predecessor threw it away with
    -- `split_part(birth_place,'(',1)` and then guessed the country from
    -- `nationality` instead, which is a demonym feeding a geographic column.
    --
    -- It is only stripped when the last segment really is a two-letter code.
    -- 14 rows use the parenthetical as a NAMESAKE DISAMBIGUATOR instead --
    -- "Manhattan (Kansas)", "Lebanon (New Hampshire)", "Petare (Caracas)",
    -- "Akkon (heute IL)" -- and stripping those turns Manhattan, Kansas into
    -- Manhattan, New York, which is the exact defect class 20260802090844 and
    -- 20260802100455 were written for. Those keep the parenthetical, match
    -- nothing, and go to a human. Refusing beats guessing.
    IF _raw IS NOT NULL THEN
      _paren := nullif(btrim(coalesce((regexp_match(_raw, '\(([^()]*)\)\s*$'))[1], '')), '');
      IF _paren IS NOT NULL THEN
        _cc := btrim(split_part(_paren, ',', array_length(string_to_array(_paren, ','), 1)));
        IF _cc ~ '^[A-Za-z]{2}$' THEN
          IF array_length(string_to_array(_paren, ','), 1) > 1 THEN
            _region := nullif(btrim(split_part(_paren, ',', 1)), '');
          END IF;
          _base := nullif(btrim(regexp_replace(_raw, '\s*\([^()]*\)\s*$', '')), '');
        ELSE
          _cc := NULL;   -- not a country code; leave the name intact
        END IF;
      END IF;
    END IF;

    -- The code is resolved into a SEPARATE variable, deliberately not into
    -- `_country_id`. It is the country the person was BORN in, and
    -- `personalities.country_id` has meant the nationality-derived country for
    -- as long as this job has existed; quietly redefining it on 2,375 rows is
    -- a different decision from sealing a producer. It is passed to the queue
    -- so the drain inherits the hint.
    IF _cc IS NOT NULL THEN
      SELECT c.id INTO _cc_country FROM public.countries c
       WHERE upper(c.code) = upper(_cc) AND c.duplicate_of_id IS NULL LIMIT 1;
    END IF;

    -- Nationality is the fallback hint only, never preferred over the code the
    -- birth place states itself. The resolver carries its own
    -- country_contradiction guard either way.
    IF _country_id IS NULL AND _cc IS NULL
       AND nullif(btrim(coalesce(r.nationality, '')), '') IS NOT NULL THEN
      SELECT c.id INTO _country_id FROM public.countries c
       WHERE c.duplicate_of_id IS NULL AND c.name ILIKE btrim(r.nationality)
       LIMIT 1;
    END IF;

    IF _base IS NOT NULL THEN
      -- Match only. `p_allow_create => false` is the point of this rewrite:
      -- creation belongs to the drain, behind the evidence bar. The comma tail
      -- is deliberately left on -- `geo_split_place_name` inside the resolver
      -- handles it, and the canonical_key arm resolves a merged district
      -- through its tombstone: "Freisenbruch, Essen" -> Essen, verified on
      -- prod for all three Essen spellings.
      SELECT * INTO res FROM public.city_resolve_or_create(
        p_name          => _base,
        p_country_id    => _country_id,
        p_country_code  => _cc,
        p_region_hint   => _region,
        p_source_slug   => 'personality-birth-place',
        p_allow_create  => false,
        p_actor         => 'backfill',
        p_requester     => 'personality',
        p_requester_ref => r.id
      );

      _city_id := res.city_id;

      IF _city_id IS NOT NULL THEN
        -- The matched city's country is better evidence than a demonym.
        SELECT coalesce(_country_id, c.country_id) INTO _country_id
          FROM public.cities c WHERE c.id = _city_id;
      ELSIF NOT p_dry_run THEN
        PERFORM public.city_resolve_enqueue(
          p_name          => _base,
          p_country_id    => coalesce(_country_id, _cc_country),
          p_region_hint   => _region,
          p_reason        => coalesce(res.reason, 'unresolved'),
          p_candidates    => res.candidates,
          p_requester     => 'personality',
          p_requester_ref => r.id
        );
      END IF;
    END IF;

    IF _city_id IS NOT NULL OR (_country_id IS NOT NULL AND r.cur_country IS NULL) THEN
      IF NOT p_dry_run THEN
        UPDATE public.personalities pp
           SET city_id       = COALESCE(_city_id, pp.city_id),
               country_id    = COALESCE(_country_id, pp.country_id),
               geo_linked_at = now()
         WHERE pp.id = r.id AND pp.city_id IS NULL;
      END IF;
      out_personality_id := r.id;
      out_city_id        := _city_id;
      out_country_id     := _country_id;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.backfill_personality_geo(integer, boolean) IS
  'Links unlinked personalities to cities. Creates NOTHING: matching goes '
  'through city_resolve_or_create with p_allow_create=false, and anything '
  'unresolved is enqueued for city_resolve_drain. Its predecessor minted the '
  'tmp-slug personality-birth-place cohort, including "Freisenbruch, Essen" '
  'and five non-cities on 2026-08-29.';

-- ── 2. Trip destination autocomplete ───────────────────────────────

CREATE OR REPLACE FUNCTION public.search_cities(q text, max_results integer DEFAULT 8)
RETURNS TABLE(id uuid, name text, timezone text, country_id uuid, country_name text, country_code text)
LANGUAGE sql STABLE SET search_path TO 'public', 'extensions'
AS $function$
  with needle as (
    select extensions.unaccent(lower(coalesce(q, ''))) as n
  )
  select c.id,
         c.name,
         c.timezone,
         co.id   as country_id,
         co.name as country_name,
         co.code as country_code
  from public.cities c
  join public.countries co on co.id = c.country_id,
       needle
  where length(needle.n) >= 2
    -- A merged row is a redirect tombstone; a ghost is not a place. Neither is
    -- a destination. Same predicate the search index uses (20261016110000).
    and c.duplicate_of_id is null
    and coalesce(c.shell_status::text, 'real') not in ('ghost', 'merged')
    and (
      extensions.unaccent(lower(c.name)) like needle.n || '%'
      or extensions.unaccent(lower(c.name)) like '%' || needle.n || '%'
    )
  order by
    (extensions.unaccent(lower(c.name)) like needle.n || '%') desc,
    c.name asc
  limit greatest(1, least(coalesce(max_results, 8), 50));
$function$;

-- ── 3. The five non-cities created on 2026-08-29 ───────────────────

DO $$
DECLARE
  v_rows CONSTANT text[][] := ARRAY[
    ARRAY['f1270e88-ddf6-4025-b552-d26ade5d02c3', 'Sonoma County'],
    ARRAY['80bf176c-1b14-4b79-93a4-d77605b2ccf1', 'Amazonas'],
    ARRAY['0e498afc-bcca-4ab2-b6b5-a9839880f3a8', 'Manitoba'],
    ARRAY['f56c522f-263d-4daa-acbe-1f5ffca72b54', 'Changyang Tujia Autonomous County'],
    ARRAY['4ae8189f-2c98-40b5-bd17-992729bc6b09', 'Rio Grande do Sul']
  ];
  i        int;
  v_hit    int;
  v_id     uuid;
  v_name   text;
  v_row    public.cities%ROWTYPE;
  v_res    jsonb;
  n_done   int := 0;
  n_skip   int := 0;
  n_unlink int := 0;
BEGIN
  FOR i IN 1 .. array_length(v_rows, 1) LOOP
    v_id   := v_rows[i][1]::uuid;
    v_name := v_rows[i][2];

    SELECT * INTO v_row FROM public.cities WHERE id = v_id;

    -- The id list is frozen at authoring time; the table is not. Every reason
    -- to leave a row alone is a SKIP with a notice, never a silent write:
    -- gone, renamed (so the id no longer denotes what was reviewed), merged
    -- away (archiving would break the redirect), or already archived.
    IF NOT FOUND THEN
      RAISE NOTICE 'nonplace skip: % (%) not found', v_name, v_id;
      n_skip := n_skip + 1; CONTINUE;
    END IF;
    IF v_row.name IS DISTINCT FROM v_name THEN
      RAISE NOTICE 'nonplace skip: % (%) now named %', v_name, v_id, v_row.name;
      n_skip := n_skip + 1; CONTINUE;
    END IF;
    IF v_row.duplicate_of_id IS NOT NULL THEN
      RAISE NOTICE 'nonplace skip: % (%) was merged away', v_name, v_id;
      n_skip := n_skip + 1; CONTINUE;
    END IF;
    IF v_row.shell_status::text = 'ghost' THEN
      RAISE NOTICE 'nonplace skip: % (%) already archived', v_name, v_id;
      n_skip := n_skip + 1; CONTINUE;
    END IF;

    -- Unlink before archiving. `personalities.birth_place` keeps the free text
    -- -- all five already hold the region name -- so the person's origin stays
    -- readable while the fake city stops being a place.
    UPDATE public.personalities p
       SET birth_place = coalesce(nullif(btrim(p.birth_place), ''), v_name),
           city_id     = NULL
     WHERE p.city_id = v_id;
    GET DIAGNOSTICS v_hit = ROW_COUNT;
    n_unlink := n_unlink + v_hit;

    UPDATE public.personalities p
       SET death_city_id = NULL
     WHERE p.death_city_id = v_id;

    v_res := public.archive_city_as_nonplace(
      v_id,
      'Administrative region, not a city. Created 2026-08-29 by the unsealed '
      'backfill_personality_geo producer, sealed in this migration.',
      jsonb_build_object('producer', 'backfill_personality_geo', 'created_at', v_row.created_at)
    );

    IF coalesce((v_res->>'ok')::boolean, false) THEN
      n_done := n_done + 1;
    ELSE
      RAISE NOTICE 'nonplace skip: % (%) refused: %', v_name, v_id, v_res->>'error';
      n_skip := n_skip + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'nonplace cities: archived=% skipped=% personalities_unlinked=%',
    n_done, n_skip, n_unlink;
END $$;
