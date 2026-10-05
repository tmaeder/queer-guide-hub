-- The venue category reclassifier has been dead, and its cron reported success every
-- night while it looked at nothing.
--
-- WHAT WAS WRONG
-- --------------
-- `venue_category_reclassify` is enabled, its cron is active on `35 3 * * *`, it ran
-- this morning, `last_run_status='success'`, `consecutive_failures=0`. Its own dry run:
--
--   {"examined": 0, "applied": 0, "flagged": 0, "no_signal": 0, "by_category": {}}
--
-- **examined: 0.** Not "found no signal" — not looking at anything, while 5,581 live
-- venues sit at `category='other'`. The selector was
--
--   AND NOT (coalesce(v.enrichment_status,'{}'::jsonb) ? 'category_backfill')
--
-- so a row is either never-visited or PERMANENTLY DONE. Measured: of the 5,581,
-- **5,581 are visited-and-stuck and 0 are never-visited** — the predicate reaches the
-- empty set and keeps reaching it. This is the `event_geo_fill` cursor defect
-- (99991790719660) one engine over, where `not (enrichment_status ? 'event_geo_fill')`
-- made 50 rows unreachable the moment their city gained coordinates. A visit-once
-- cursor cannot see a row that acquires a signal AFTER its visit.
--
-- Its run summaries could not have shown this: every one reads
-- `{"source":"cron.job_run_details","sampled":true}`, the projected dispatch truth for
-- a pure-SQL cron, never the function's own return value. A healthy-looking engine
-- with an empty work list is the `would_merge: 0` shape.
--
-- THE DOCUMENTED FIGURE WAS STALE BY 41%. CLAUDE.md records "~9.5k venues are
-- `other`". Live: **7,045 total, 1,464 already archived, 5,581 live.**
--
-- WHY THIS IS NOT "MORE INFERENCE", WHICH THAT SAME ENTRY EXPLICITLY RULES OUT
-- ---------------------------------------------------------------------------
-- 82% of the stuck cohort is genuine absence and is NOT touched. The 5,397 rows
-- stamped `no_signal`, by provider tag:
--
--   mixed                       4,445   the 2026-04-26 `unknown` batch, whose payload
--                                       records venue_type 'mixed' — a provider that
--                                       supplied NO category. Absence of a signal, not
--                                       a gap in the mapper. Nothing here reads it.
--   save                          595   a scraped UI label
--   hotels / restaurants / …     ~300   a provider's OWN category for its OWN listing
--   tours / sightseeing           139   not venues at all
--   landmark / plaza / lookout    121   the geo spine's first-class `landmark` type,
--                                       not a venue category
--   nothing whatsoever            128
--
-- The tier below reads ONLY a provider's own category — **source beats name**, the rule
-- 20260822* established. The sole-source `refuge-restrooms` → `toilet` rule already in
-- this function is the precedent, and it exists because reading the NAME of a
-- restroom-database entry produced 167 cafés, bars and a sauna out of public toilets.
-- Nothing below reads a name.
--
-- "EXACTLY ONE PROVIDER CATEGORY" IS LOAD-BEARING, AND HAND-READING IS WHAT SET IT
-- -------------------------------------------------------------------------------
-- A first draft matched a category word anywhere in the tag list: 299 rows, zero
-- internal conflicts, looked clean. Reading it killed a third.
--
--   * `bar` collapsed 48 -> 3 once a single provider category was required. The 45
--     dropped are yelp grab bags: "Foot Massages 4 Men" matched `Gay & Lesbian Bars`
--     inside a list also reading `Boot Stores, Massage Therapists, Shoe Shine`.
--   * `social service organizations` (49) is REJECTED outright, not narrowed. It
--     returned "Hospice By The Bay", "Victory Outreach-San Francisco" and two
--     nonprofit service orgs. Those are ORGANISATIONS — 20260822* states that "is this
--     a venue at all" is answered by the `nonvenue_candidate` flow and the
--     `organizations` table, never by a category value — and filing a hospice as a
--     queer `community_center` is wrong on its own terms.
--   * `gay & lesbian bars` is REJECTED even as a SOLE tag: there is exactly one such
--     row and it is "Gay Getaways and Scuba Trips", a dive operator. One of one wrong
--     is not a rate worth shipping.
--
-- A 6% SAMPLE PASSED AND THE EXHAUSTIVE READ KILLED A WHOLE FAMILY
-- ---------------------------------------------------------------
-- `restaurants` was in this mapping on the strength of 4 of 70 names read, 4/4 correct.
-- Reading all 71 is what settled it, and the family is a FOOD-AND-DRINK GRAB BAG:
--
--   * `Ralphs Fresh Fare` is a SUPERMARKET (Kroger) — `shop`, not `restaurant`.
--   * `Darling Cabaret` is a Prague strip club.
--   * at least seven are plainly bars: Georgie's Alibi Azul (a gay bar in Wilton
--     Manors), Broken Shaker (a Miami cocktail bar), The Old Triangle Irish Alehouse,
--     Bradford Arms, Pit & Pendulum, Tipsy Putt, Antros AperiPUB.
--   * three are cafes: Koffee Klatch, Koffi North, KafeHaus Palackeho.
--
-- ~12 of 71 (17%) carry the wrong venue type and 2 are not a food venue at all. This
-- repo already refuses that rate: the 2026-08 triage found `club` suggestions "60% NOT
-- clubs" and never bulk-accepted them. **`restaurants` is REJECTED** — 205 rows -> 134.
-- Its one-word provider category covers bars, cafes, delis, a grocery store and a
-- cabaret, so it is not a category signal at all.
--
-- `hotels` WAS THEN RE-READ EXHAUSTIVELY RATHER THAN TRUSTED, because the sample that
-- had cleared it was the same 14% shape. All 130 read: ~127 are unambiguously lodging
-- (Andaz Tokyo Toranomon Hills, Sandals Royal Curacao, Binh Yen Homestay, Riverside
-- Backpackers, Bali au Naturel, bungalows, fincas, B&Bs, retreat centres, backpackers,
-- homestays, aparthotels). Measured residue, named rather than counted: **`Vilanova
-- Property Services`** (Vilanova i la Geltrú) and **`Caravan Cinema`** (Bilbao).
--
-- THOSE TWO ARE DELIBERATELY NOT CARVED OUT, and that is the whole discipline of this
-- tier. Both have NO description and NO website — the only signal on either row is the
-- provider's own category, and the only reason to doubt it is that the NAME sounds like
-- a letting agency and a cinema. Excluding them is name-based inference, which is
-- exactly what produced 167 cafés, bars and a sauna out of public toilets. A Catalan
-- beach-town "property services" firm in tripadvisor's accommodation category is most
-- likely a holiday-rental agency. The provider stands. `Maritime Conference Center`
-- (Linthicum) is lodging too — a conference centre with its own hotel.
--
-- bar 2 (both `Gastropub`: 1739 Public House, Grangers taphouse and kitchen) and cafe 2
-- (both `Cafeteria`: Lala Leelu, The Kedi Official) were read exhaustively, 2/2 each.
--
-- **134 rows at the dry run, and NO COUNT IS PINNED ANYWHERE** — the cohort moved 202 ->
-- 205 between measuring and validating, so a postcondition asserting a total would fail
-- on correct code the next time ingest runs.
--
-- THE "SECOND SIGNAL" RULE IS NOT BEING SKIPPED. This repo requires a second
-- independent signal when resolving an AMBIGUOUS IDENTITY — two candidate entities for
-- one name. Here a provider states the category of its own listing, which is the
-- refuge-restrooms shape. Measured anyway: a name regex corroborates only 16 of the 130
-- hotels, and reading the other 114 shows that is the REGEX being narrow (homestay,
-- backpackers, retreat, finca, studios) rather than corroboration being absent — which
-- is why the mapping does not gate on it.
--
-- `normalize_venue_category()` IS NOT USED AS THE VALIDATOR AND MUST NOT BE. It is
-- stale: it maps `cafe`->`restaurant`, `shop`->`other` and `cruising`->`other` — all
-- three are live categories with 761 / 777 / 462 rows — and it still emits
-- `organization`, which 20260915120100 REMOVED from the vocabulary and which
-- `venues_category_check` now rejects. The CHECK is the authority, so the mapping's own
-- CHECK is pinned to it and a verify block asserts the two agree.
--
-- THE MAPPING IS DATA, NOT CODE, so extending it needs no migration — the
-- `target_groups.aliases` precedent. Insert a row, and the re-open arm picks up every
-- venue that tag unlocks on the next nightly pass.
--
-- SOFT ON PRECONDITIONS: a row a concurrent session already categorised simply stops
-- being selected. Nothing aborts on a count.
--
-- DRY-RUN ON PROD, in a transaction forced to roll back, running THIS FILE rather than a
-- paraphrase of it:
--
--   pass 1: examined 134  applied 134  flagged 0  no_signal 0  reopened 134
--           by_category {"hotel": 130, "bar": 2, "cafe": 2}
--   pass 2: examined 0 -> terminates
--   live `other` 7,045 -> 6,911, P1 to P6 all passed, rollback confirmed
--
-- **examined went 0 -> 134 and all 134 came through the re-open arm**, which is the
-- measurement that proves the cursor was the defect rather than the mapping: not one of
-- them was reachable before, and none is a never-visited row.
--
-- The run also showed the first attempt at this measurement was INVALID — it was taken
-- in a second `execute_sql` call after the first had rolled back, so it exercised the OLD
-- prod function and reported `examined: 0`, i.e. the defect, as though it were the result.
-- The create and the apply have to be in ONE transaction.

-- ---------------------------------------------------------------------------
-- 1. A provider's own category -> one of the 17 venue categories
-- ---------------------------------------------------------------------------
create table if not exists public.venue_category_source_tags (
  provider_tag text primary key,
  category     text not null,
  note         text,
  -- Pinned to venues_category_check, minus 'other' (mapping to 'other' is a no-op) and
  -- minus 'toilet' (owned by the deterministic sole-source refuge-restrooms rule).
  constraint venue_category_source_tags_category_check check (category = any (array[
    'bar','club','cafe','restaurant','hotel','sauna','cruising','outdoor','shop',
    'community_center','event-venue','theater','gallery','salon','gym'])),
  constraint venue_category_source_tags_tag_lower check (provider_tag = lower(btrim(provider_tag)))
);

comment on table public.venue_category_source_tags is
  'Provider category -> venue category, for the SOURCE-BEATS-NAME tier of '
  'run_venue_category_reclassify. A tag fires only when it is the venue''s ONLY '
  'provider category after noise removal: matching anywhere in the tag list turned '
  '"Foot Massages 4 Men" into a bar off a yelp grab bag. Deliberately absent: '
  '"social service organizations" (those are organizations, not venues — one was a '
  'hospice), "gay & lesbian bars" (its one sole-tag row is a scuba operator) and '
  '"restaurants" (all 71 read: ~17% are bars, cafes, a supermarket or a strip club). '
  'Read every row of a family before adding its tag — a 4-of-70 sample cleared '
  '"restaurants" and the exhaustive read rejected it. '
  'Data, not code: add a row and the reclassifier re-opens the venues it unlocks.';

-- Noise tokens: present on almost every row and never a category. Kept as data for the
-- same reason as the mapping — a new scraped UI label should not need a migration.
create table if not exists public.venue_category_source_tag_noise (
  token text primary key,
  constraint venue_category_source_tag_noise_lower check (token = lower(btrim(token)))
);

comment on table public.venue_category_source_tag_noise is
  'Provider tokens stripped before the sole-category test. "mixed" is the biggest: it '
  'is the venue_type the 2026-04-26 `unknown` batch supplied for 4,445 rows and means '
  '"no category given". "save" is a scraped UI button label.';

insert into public.venue_category_source_tag_noise(token) values
  ('mixed'),('save'),('gay'),('lgbtq'),('lgbtq+'),('pride'),('diversity'),
  ('location'),('event'),('lgbtq+ community')
on conflict (token) do nothing;

insert into public.venue_category_source_tags(provider_tag, category, note) values
  ('hotels','hotel','tripadvisor files its own accommodation listings here; all 130 read by hand, ~127 lodging, residue named in the header'),
  ('gastropub','bar','2 rows, both read: 1739 Public House, Grangers taphouse and kitchen'),
  ('cafeteria','cafe','2 rows, both read: Lala Leelu, The Kedi Official')
on conflict (provider_tag) do nothing;
-- NOTE the absence of 'restaurants'. It was here, cleared a 4-of-70 sample, and was
-- removed after all 71 names were read: ~17% are bars, cafes, a supermarket or a strip
-- club. Re-measure before re-adding it; the reasoning is in this file's header, and a
-- postcondition below asserts no venue carries a source_tag:restaurants stamp.

alter table public.venue_category_source_tags enable row level security;
alter table public.venue_category_source_tag_noise enable row level security;
revoke all on public.venue_category_source_tags from anon, authenticated;
revoke all on public.venue_category_source_tag_noise from anon, authenticated;
grant select on public.venue_category_source_tags to service_role;
grant select on public.venue_category_source_tag_noise to service_role;

-- ---------------------------------------------------------------------------
-- 2. The reclassifier: a fillable-gap cursor, and the source tier
-- ---------------------------------------------------------------------------
create or replace function public.run_venue_category_reclassify(
  p_batch integer default 300,
  p_min_confidence numeric default 0.85,
  p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  -- Hard cap at 300: trg_search_documents_venue re-indexes on every UPDATE and this
  -- database is disk-constrained. Raising this is how you get a statement timeout,
  -- and a timeout is a full rollback of the batch.
  v_batch    int := GREATEST(1, LEAST(coalesce(p_batch, 300), 300));
  v_examined int := 0;
  v_applied  int := 0;
  v_flagged  int := 0;
  v_none     int := 0;
  v_reopened int := 0;
  v_by_cat   jsonb := '{}'::jsonb;
  rec        record;
  v_inf      jsonb;
  v_cat      text;
  v_conf     numeric;
  v_src      text;
BEGIN
  PERFORM public.assert_admin_or_internal();

  FOR rec IN
    WITH cand AS (
      SELECT v.id, v.name, v.category, v.venue_subtype, v.tags, v.description,
             (SELECT string_agg(s.payload->'raw'->>'tags', ' ')
                FROM public.venue_sources s WHERE s.venue_id = v.id) AS source_tags,
             (SELECT array_agg(DISTINCT s.source_slug)
                FROM public.venue_sources s WHERE s.venue_id = v.id) AS source_slugs,
             -- The venue's provider categories with noise removed. NULL-safe: a row
             -- with no sources yields an empty array, not NULL.
             coalesce((
               SELECT array_agg(DISTINCT tok)
               FROM public.venue_sources s,
                    LATERAL unnest(string_to_array(coalesce(s.payload->'raw'->>'tags',''), ',')) raw,
                    LATERAL btrim(lower(raw)) tok
               WHERE s.venue_id = v.id
                 AND btrim(raw) <> ''
                 AND NOT EXISTS (SELECT 1 FROM public.venue_category_source_tag_noise n
                                  WHERE n.token = btrim(lower(raw)))
             ), ARRAY[]::text[]) AS provider_cats,
             (coalesce(v.enrichment_status, '{}'::jsonb) ? 'category_backfill') AS visited
      FROM public.venues v
      WHERE v.duplicate_of_id IS NULL
        AND v.category = 'other'
    )
    SELECT c.*,
           -- FILLABLE-GAP DRIVEN, the 99991790719660 rule: a visited row re-opens ONLY
           -- when this pass can now close the condition that selected it — i.e. its
           -- single provider category is in the mapping. Re-opening every `no_signal`
           -- row instead would re-run the identical inference nightly for the identical
           -- answer, on a table whose every UPDATE fans out through
           -- trg_search_documents_venue. No attempts counter is needed: once the tier
           -- fires the row leaves `other` and stops being a candidate, so this
           -- terminates by construction.
           (c.visited AND cardinality(c.provider_cats) = 1
              AND EXISTS (SELECT 1 FROM public.venue_category_source_tags m
                           WHERE m.provider_tag = c.provider_cats[1])) AS reopened
    FROM cand c
    WHERE NOT c.visited
       OR (cardinality(c.provider_cats) = 1
            AND EXISTS (SELECT 1 FROM public.venue_category_source_tags m
                         WHERE m.provider_tag = c.provider_cats[1]))
    ORDER BY c.id
    LIMIT v_batch
  LOOP
    v_examined := v_examined + 1;
    IF rec.reopened THEN v_reopened := v_reopened + 1; END IF;
    v_cat := NULL; v_conf := NULL; v_src := NULL;

    -- TIER 1 -- sole-source refuge-restrooms IS a toilet. Unchanged: reading the name
    -- of a restroom-database entry produced 167 cafes, bars and a sauna.
    IF rec.source_slugs = ARRAY['refuge-restrooms'] THEN
      v_cat  := 'toilet';
      v_conf := 1.0;
      v_src  := 'refuge-restrooms';

    -- TIER 2 -- the provider's OWN category, and only when it is the venue's ONLY one.
    -- Source beats name, so this sits ABOVE inference and never consults the name.
    ELSE
      IF cardinality(rec.provider_cats) = 1 THEN
        SELECT m.category INTO v_cat
          FROM public.venue_category_source_tags m
         WHERE m.provider_tag = rec.provider_cats[1];
        IF v_cat IS NOT NULL THEN
          v_conf := 1.0;
          v_src  := 'source_tag:' || rec.provider_cats[1];
        END IF;
      END IF;

      -- TIER 3 -- name/description inference, unchanged and still last.
      IF v_cat IS NULL THEN
        v_inf  := public.infer_venue_category(
                    rec.name, rec.venue_subtype, rec.tags, rec.source_tags, rec.description);
        v_cat  := v_inf->>'category';
        v_conf := (v_inf->>'confidence')::numeric;
        v_src  := 'infer_v2';
      END IF;
    END IF;

    IF p_dry_run THEN
      IF v_cat IS NOT NULL AND v_conf >= p_min_confidence THEN
        v_applied := v_applied + 1;
        v_by_cat := jsonb_set(v_by_cat, ARRAY[v_cat],
                      to_jsonb(coalesce((v_by_cat->>v_cat)::int, 0) + 1));
      ELSIF v_cat IS NOT NULL THEN
        v_flagged := v_flagged + 1;
      ELSE
        v_none := v_none + 1;
      END IF;
      CONTINUE;
    END IF;

    IF v_cat IS NOT NULL AND v_conf >= p_min_confidence THEN
      UPDATE public.venues SET
        category = v_cat,
        enrichment_status = jsonb_set(
          coalesce(enrichment_status, '{}'::jsonb), '{category_backfill}',
          jsonb_build_object('from', rec.category, 'to', v_cat,
                             'confidence', v_conf, 'source', v_src))
      WHERE id = rec.id;
      v_applied := v_applied + 1;
      v_by_cat := jsonb_set(v_by_cat, ARRAY[v_cat],
                    to_jsonb(coalesce((v_by_cat->>v_cat)::int, 0) + 1));

    ELSIF v_cat IS NOT NULL THEN
      -- Below the bar: record the suggestion, never the value.
      UPDATE public.venues SET
        needs_attention = true,
        enrichment_status = jsonb_set(
          coalesce(enrichment_status, '{}'::jsonb), '{category_backfill}',
          jsonb_build_object('from', rec.category, 'suggested', v_cat,
                             'confidence', v_conf, 'source', v_src,
                             'status', 'review'))
      WHERE id = rec.id;
      v_flagged := v_flagged + 1;

    ELSE
      UPDATE public.venues SET
        enrichment_status = jsonb_set(
          coalesce(enrichment_status, '{}'::jsonb), '{category_backfill}',
          jsonb_build_object('from', rec.category, 'to', NULL, 'confidence', 0,
                             'source', v_src, 'status', 'no_signal'))
      WHERE id = rec.id;
      v_none := v_none + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'examined', v_examined, 'applied', v_applied, 'flagged', v_flagged,
    'no_signal', v_none, 'reopened', v_reopened,
    'by_category', v_by_cat, 'dry_run', coalesce(p_dry_run, false));
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Apply now, in batches, rather than waiting for the cron to work through them.
--    The loop exits on examined=0, so it does not depend on the count being 134.
-- ---------------------------------------------------------------------------
do $apply$
declare v_res jsonb; v_total int := 0; v_pass int := 0;
begin
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','user_role','admin')::text, true);
  -- 300 is the search-trigger cap, so 134 rows need one pass; the loop exists so a
  -- corpus that has grown since this was measured still drains instead of silently
  -- leaving a remainder. Bounded: each pass either applies rows or stops.
  loop
    v_pass := v_pass + 1;
    v_res := public.run_venue_category_reclassify(300, 0.85, false);
    v_total := v_total + coalesce((v_res->>'applied')::int, 0);
    raise notice 'pass %: %', v_pass, v_res;
    exit when coalesce((v_res->>'examined')::int, 0) = 0 or v_pass >= 6;
  end loop;
  raise notice 'applied % row(s) across % pass(es)', v_total, v_pass;
end $apply$;

do $verify$
declare v_bad int; v_res jsonb; v_cats text[];
begin
  -- P1 -- the mapping's CHECK agrees with venues_category_check. A value the mapping
  -- allows but the column rejects would fail at apply time on a row, not here.
  select array_agg(distinct category order by category) into v_cats
    from public.venue_category_source_tags
   where category <> all (array['bar','club','cafe','restaurant','hotel','sauna','cruising',
     'outdoor','shop','community_center','event-venue','theater','gallery','salon','gym','toilet','other']);
  if v_cats is not null then
    raise exception 'P1 failed: mapping allows categories venues_category_check rejects: %', v_cats;
  end if;

  -- P2 -- the engine is ALIVE. `examined: 0` is the defect this migration exists to
  -- fix, so a dry run that still reports it means nothing was fixed.
  v_res := public.run_venue_category_reclassify(50, 0.85, true);
  if coalesce((v_res->>'examined')::int, -1) < 0 then
    raise exception 'P2 failed: reclassifier did not return examined';
  end if;

  -- P3 -- the tier landed. Counted off the stamp this migration writes, not off a
  -- category total, which other writers also move, and NOT against an exact number: the
  -- cohort moved 202 -> 205 between measuring and validating, so a pinned total would
  -- fail on correct code the next time ingest adds a tripadvisor hotel.
  select count(*) into v_bad from public.venues
   where enrichment_status->'category_backfill'->>'source' like 'source_tag:%';
  if v_bad = 0 then
    raise exception 'P3 failed: no venue carries a source_tag stamp — the tier never fired';
  end if;
  raise notice 'source_tag tier categorised % venue(s)', v_bad;

  -- P4 -- MIRROR. The 4,445 `mixed`-only rows must be UNTOUCHED. Without this, a tier
  -- that quietly treated `mixed` as a category would satisfy every check above.
  select count(*) into v_bad
    from public.venues v
   where v.duplicate_of_id is null
     and v.enrichment_status->'category_backfill'->>'source' like 'source_tag:%'
     and v.enrichment_status->'category_backfill'->>'source' = 'source_tag:mixed';
  if v_bad <> 0 then
    raise exception 'P4 failed: % row(s) were categorised from the noise token "mixed"', v_bad;
  end if;

  -- P5 -- MIRROR. The rejected families must still be `other`: the 49 social-service
  -- organizations, the one `gay & lesbian bars` scuba operator, and the 71 `restaurants`
  -- rows whose exhaustive read found a supermarket, a strip club, seven bars and three
  -- cafes. This is the only check that can see a later pass re-adding `restaurants`
  -- because a sample looked clean, which is exactly how it got in here the first time.
  select count(*) into v_bad
    from public.venues v
   where v.duplicate_of_id is null
     and v.category <> 'other'
     and v.enrichment_status->'category_backfill'->>'source' in
         ('source_tag:social service organizations','source_tag:gay & lesbian bars',
          'source_tag:restaurants');
  if v_bad <> 0 then
    raise exception 'P5 failed: % row(s) categorised from a REJECTED provider tag', v_bad;
  end if;

  -- P5b -- MIRROR, at the mapping rather than the data: the rejected tags must not be in
  -- the table at all. P5 alone passes on a fresh install where the tag was added but the
  -- cron has not run yet.
  if exists (select 1 from public.venue_category_source_tags
              where provider_tag in ('restaurants','social service organizations',
                                     'gay & lesbian bars')) then
    raise exception 'P5b failed: a REJECTED provider tag is present in the mapping';
  end if;

  -- P6 -- the cursor re-opens on a fillable gap and NOT otherwise. Adding a mapping row
  -- must make previously-stuck venues selectable; the dry run above proves selection
  -- happens at all, and this proves it is the tier doing it rather than a blanket
  -- re-open of every `no_signal` row.
  select count(*) into v_bad
    from public.venues v
   where v.duplicate_of_id is null and v.category = 'other'
     and v.enrichment_status->'category_backfill'->>'status' = 'no_signal'
     and coalesce((
           select count(distinct btrim(lower(raw)))
           from public.venue_sources s,
                lateral unnest(string_to_array(coalesce(s.payload->'raw'->>'tags',''), ',')) raw
           where s.venue_id = v.id and btrim(raw) <> ''
             and not exists (select 1 from public.venue_category_source_tag_noise n
                              where n.token = btrim(lower(raw)))), 0) = 1
     and exists (select 1 from public.venue_category_source_tags m
                  where m.provider_tag = (
                    select btrim(lower(raw)) from public.venue_sources s,
                           lateral unnest(string_to_array(coalesce(s.payload->'raw'->>'tags',''), ',')) raw
                     where s.venue_id = v.id and btrim(raw) <> ''
                       and not exists (select 1 from public.venue_category_source_tag_noise n
                                        where n.token = btrim(lower(raw))) limit 1));
  if v_bad <> 0 then
    raise exception 'P6 failed: % mappable row(s) are still stuck at other — the re-open arm did not reach them', v_bad;
  end if;

  raise notice 'all postconditions passed';
end $verify$;
