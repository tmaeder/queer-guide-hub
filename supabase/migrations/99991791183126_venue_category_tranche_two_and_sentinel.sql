-- Two things, and the sentinel is the load-bearing one.
--
-- WHY A SENTINEL AT ALL: AFTER THE FIX, `examined: 0` MEANS "DRAINED" — WHICH IS
-- BYTE-IDENTICAL TO WHAT IT MEANT WHEN THE ENGINE WAS BLIND
-- ---------------------------------------------------------------------------------
-- `99991791179763` fixed a visit-once cursor that made `run_venue_category_reclassify`
-- examine ZERO rows for months while its cron reported success every night. Verified on
-- prod immediately after that migration applied, the deployed function now returns:
--
--   {"examined": 0, "applied": 0, "flagged": 0, "no_signal": 0, "reopened": 0}
--
-- **The same `examined: 0`.** And it is CORRECT this time: all 134 mappable rows were
-- categorised, so nothing is left for the tier to do. So the number that was the
-- symptom is now the healthy reading, and no monitor on `examined` can ever tell the two
-- apart — which is precisely how the defect survived unnoticed. This is the
-- "an emergent zero is indistinguishable from a blind engine" shape that `would_merge: 0`
-- already taught this repo, now with the two states sharing a value.
--
-- The quantity that DOES separate them is **how many venues the tier could categorise
-- and has not** — `99991791179763`'s postcondition P6, which ran once at apply time and
-- then nothing watched it. If the cursor regresses, new tripadvisor hotels arrive and sit
-- at `other` forever and this count climbs off zero; while the engine is healthy it is
-- exactly 0, measured. That makes it a real zero-invariant rather than a baseline nobody
-- re-reads.
--
-- THE DENOMINATORS ARE REPORTED FIRST AND THAT IS NOT DECORATION. `mapping_rows` and
-- `noise_rows` come before every count, because `mappable_still_other = 0` is equally
-- true of a healthy corpus and of a mapping table somebody emptied — and an emptied
-- mapping silently disables the whole tier while every count reads clean.
--
-- TRANCHE TWO: 44 ROWS, AND THREE FAMILIES REFUSED
-- -----------------------------------------------
-- The mapping and the noise list are DATA, so extending them needs no function change —
-- the claim `99991791179763` made, now exercised. All five candidate families were read
-- EXHAUSTIVELY, not sampled, because a 4-of-70 sample is what nearly shipped
-- `restaurants` (a supermarket, a strip club, seven bars and three cafes).
--
--   ACCEPTED
--   `mall` -> shop          24/24. Acropolis Mall, Forum Mall, Ikeja City Mall, Parque
--                           Arauco, Quest Mall, Riverside 66, South City Mall, Wanda
--                           Plaza, Mall Vivo Outlet, Rio Design Barra, Dakshinapan
--                           Shopping Complex, Vardaan Shopping Market, Maryland Mall,
--                           Leisure Mall, Galaxy Mall, Apapa Shopping Mall, The Palms,
--                           City Centre, E-centre, Nile City Towers, plus three
--                           supermarkets (Shoprite Ikeja, Spar, Justrite Superstore),
--                           which are `shop` on the same reading.
--   `vacation rentals`      20/20 lodging. Individual holiday lets, cottages, condos,
--        -> hotel           glamping ("Skoolie Glamping", "Glamping at Deer Camp") and a
--                           furnished room in a host's home. These are PRIVATE HOST
--                           LISTINGS, which `20260726*` says must never mint an
--                           `organizations` row — that is the business-spine question and
--                           is untouched here. As a venue CATEGORY, `hotel` is the
--                           accommodation value in the 17, and it is strictly more
--                           accurate than `other`.
--
--   REFUSED, each for its own measured reason, and asserted below so a later pass has to
--   break this file's own check to re-add one:
--
--   `theaters`   18 rows, and FOUR are music venues rather than theatres — OMEARA,
--                The Teragram Ballroom, The Coach House, The Regent Theatre — beside the
--                London Palladium, Kabukiza Theater, Prince Of Wales Theatre and
--                Longacre Theatre. ~22%, which is the `restaurants` rate. Mapping them
--                all to `theater` mislabels four music venues; mapping them all to
--                `event-venue` mislabels the Palladium. Under-reaching is the correct
--                error.
--   `spas`       16 rows and the MOST DANGEROUS of the five on this platform. It mixes
--                massage parlours (A to Zen Massage, Eyo Thai Massage, Yindee Thai
--                Massage, Sunset Massage, Kakiku Massage and Reflexology) with
--                bath/lagoon venues (Sky Lagoon, Liquidrom, Ribersborgs Kallbadhus, Orr
--                Hot Springs, Banos de Elvira). `salon` is wrong for a geothermal lagoon,
--                and **`sauna` on this platform asserts a SEXUAL VENUE TYPE** — the exact
--                harm `20260822*` records, where name inference labelled a hair salon
--                `sauna`. No single value is right for this family.
--   `ice cream`  14/14 really are gelaterias (Freddo, Lucciano's, Momo Gelato, Cold Stone
--                Creamery, Heladería Sebastián …) — refused not on accuracy but because
--                `cafe` and `shop` are BOTH legitimate for a gelateria and choosing
--                between them is taste, not evidence. A tier that auto-applies at
--                confidence 1.0 may not rest on a coin flip.
--
-- NOISE: `creative tags` AND `audience` ARE LEAKED PROMPT LABELS, NOT CATEGORIES
-- ----------------------------------------------------------------------------
-- `creative tags` appears in the tag list of **1,507 spartacus venues**, beside real
-- tags, and on 72 `other` rows it is the only surviving token — two of them as the
-- degenerate string `creative tags: none mentioned in the document.`, i.e. an extraction
-- prompt's own header word stored as data. `audience` is the same shape. Both are noise
-- exactly like `mixed`, `save`, `location` and `event`.
--
-- **MEASURED BEFORE ADDING, because widening noise widens which rows count as sole-tag:**
-- with these two added the apply set is **44 — identical** either way, both before and
-- after the new mapping rows. All they change is that 10 rows stop being counted as
-- "has one provider category" and start being counted as honest absence, which is more
-- truthful and applies nothing.
--
-- THE SENTINEL IS PROVEN NON-VACUOUS, which a zero-invariant otherwise cannot be. Asked
-- on prod immediately BEFORE and AFTER this migration's own apply block, in a transaction
-- forced to roll back:
--
--   BEFORE: mappable_still_other 44, stamped_total 134, other_live 5,447
--   AFTER : mappable_still_other  0, stamped_total 178, other_live 5,403
--   last_reclassify_at 2026-10-05T03:35:00Z in both
--
-- So the invariant goes NON-ZERO on a genuinely unreached cohort and back to 0 once the
-- tier drains it. A zero that has never been anything else is indistinguishable from a
-- query that cannot count — this one has been 44.
--
-- Note the 44 are all older than that 03:35 run, so the age gate does not mask them: it
-- excludes only rows created AFTER the last run, which is exactly the fresh-ingest case.
--
-- SOFT ON PRECONDITIONS: every insert is `on conflict do nothing`, and a venue a
-- concurrent session already categorised simply stops being selected. Nothing aborts on
-- a count — the cohort moved 202 -> 205 between measuring and validating last time.

-- ---------------------------------------------------------------------------
-- 1. Tranche two
-- ---------------------------------------------------------------------------
insert into public.venue_category_source_tags(provider_tag, category, note) values
  ('mall','shop','24 rows, all read: malls and shopping complexes, incl. 3 supermarkets'),
  ('vacation rentals','hotel','20 rows, all read: holiday lets, cottages, condos, glamping, a host room')
on conflict (provider_tag) do nothing;

-- Deliberately absent: 'theaters' (4 of 18 are music venues), 'spas' (massage parlours
-- mixed with bath/lagoon venues, and `sauna` asserts a sexual venue type here) and
-- 'ice cream' (cafe vs shop are both defensible, so the choice is taste not evidence).
-- Postconditions below assert all three stay out.

insert into public.venue_category_source_tag_noise(token) values
  ('creative tags'),
  ('audience'),
  ('creative tags: none mentioned in the document.'),
  ('creative tags: none mentioned')
on conflict (token) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The sentinel that tells DRAINED from BLIND
-- ---------------------------------------------------------------------------
create or replace function public.venue_category_signals()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_mapping int;
  v_noise   int;
  v_stuck   int;
  v_rejected int;
begin
  select count(*) into v_mapping from public.venue_category_source_tags;
  select count(*) into v_noise   from public.venue_category_source_tag_noise;

  -- A rejected provider tag present in the mapping. Checked at the MAPPING rather than
  -- in the data, because a freshly-added tag whose cron has not run yet leaves the data
  -- clean — clean because nothing has happened, which must not read as healthy.
  select count(*) into v_rejected from public.venue_category_source_tags
   where provider_tag in ('restaurants','theaters','spas','ice cream',
                          'social service organizations','gay & lesbian bars');

  -- THE INVARIANT, AND IT IS AGE-GATED RATHER THAN LEVEL-GATED, which is this repo's own
  -- house rule ("gate on AGE or on a write-time invariant, never on a level") and is
  -- load-bearing here rather than stylistic. A venue still at `other` whose SOLE provider
  -- category the mapping can resolve is the right quantity — but a freshly ingested row is
  -- legitimately in that state until the nightly cron runs, and **venue creation does NOT
  -- happen at the 03:00 ingest cron**: measured over 7 days, 12,228 of 12,275 new venues
  -- were created between 17:00 and 20:00 UTC. The 06:00 health check is safe only because
  -- 03:35 precedes it; a `workflow_dispatch` at 19:00 would go red on rows that are
  -- minutes old and perfectly healthy, which is the cry-wolf shape.
  --
  -- So the anchor is the RUN, not a hand-picked interval: a row created BEFORE the last
  -- recorded reclassify run and still mappable-and-stuck is a row that run failed to
  -- reach. No arbitrary window, and no false positive from ingest.
  --
  -- `last_run_at` NULL means the registry has no run recorded — which was true of 142 of
  -- 144 cron rows before 20260910163700 added run tracking. Then nothing is PROVABLY
  -- unreached, so the count is 0 and `last_reclassify_at` is reported so the absence is
  -- visible rather than read as a clean corpus.
  select count(*) into v_stuck
    from public.venues v
   where v.duplicate_of_id is null
     and v.category = 'other'
     and v.created_at < (select a.last_run_at from public.admin_automations a
                          where a.slug = 'venue_category_reclassify')
     and coalesce((
           select count(distinct btrim(lower(raw)))
             from public.venue_sources s,
                  lateral unnest(string_to_array(coalesce(s.payload->'raw'->>'tags',''), ',')) raw
            where s.venue_id = v.id
              and btrim(raw) <> ''
              and not exists (select 1 from public.venue_category_source_tag_noise n
                               where n.token = btrim(lower(raw)))), 0) = 1
     and exists (
           select 1 from public.venue_category_source_tags m
            where m.provider_tag = (
                  select btrim(lower(raw))
                    from public.venue_sources s,
                         lateral unnest(string_to_array(coalesce(s.payload->'raw'->>'tags',''), ',')) raw
                   where s.venue_id = v.id
                     and btrim(raw) <> ''
                     and not exists (select 1 from public.venue_category_source_tag_noise n
                                      where n.token = btrim(lower(raw)))
                   limit 1));

  return jsonb_build_object(
    'probe_ok', true,
    -- Denominators FIRST: zero stuck rows over an emptied mapping is not a clean corpus,
    -- and an emptied mapping disables the tier while every count below reads fine.
    'mapping_rows', v_mapping,
    'noise_rows', v_noise,
    'rejected_tag_in_mapping', v_rejected,
    -- The age anchor, reported so a NULL is visible: with no recorded run nothing can be
    -- proven unreached and `mappable_still_other` is 0 for that reason, not because the
    -- corpus is clean.
    'last_reclassify_at', (select a.last_run_at from public.admin_automations a
                            where a.slug = 'venue_category_reclassify'),
    'mappable_still_other', v_stuck,
    -- Descriptive, never gated.
    'stamped_total', (select count(*) from public.venues
                       where enrichment_status->'category_backfill'->>'source' like 'source_tag:%'),
    'other_total', (select count(*) from public.venues
                     where duplicate_of_id is null and category = 'other'),
    'other_live', (select count(*) from public.venues
                    where duplicate_of_id is null and category = 'other'
                      and review_status is distinct from 'archived')
  );
end
$fn$;

comment on function public.venue_category_signals() is
  'Tells a DRAINED venue-category reclassifier from a BLIND one. After 99991791179763 '
  'the engine returns examined:0 when healthy, the same value it returned when a '
  'visit-once cursor made it examine nothing for months, so no monitor on `examined` can '
  'separate them. `mappable_still_other` can: it is 0 while the cursor works and climbs '
  'as soon as it regresses. It is AGE-GATED on the last recorded reclassify run rather '
  'than on a level, because 12,228 of 12,275 venues created in a measured week arrived '
  'between 17:00 and 20:00 UTC and are legitimately uncategorised until 03:35, so a '
  'level would go red on rows that are minutes old. Denominators are reported before '
  'counts because zero stuck rows over an emptied mapping is not a clean corpus.';

revoke all on function public.venue_category_signals() from public, anon, authenticated;
grant execute on function public.venue_category_signals() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Apply tranche two now rather than waiting for the cron
-- ---------------------------------------------------------------------------
do $apply$
declare v_res jsonb; v_pass int := 0; v_total int := 0;
begin
  perform set_config('request.jwt.claims',
    json_build_object('role','authenticated','user_role','admin')::text, true);
  -- Exits on examined=0, so it does not depend on the count being 44.
  loop
    v_pass := v_pass + 1;
    v_res := public.run_venue_category_reclassify(300, 0.85, false);
    v_total := v_total + coalesce((v_res->>'applied')::int, 0);
    raise notice 'pass %: %', v_pass, v_res;
    exit when coalesce((v_res->>'examined')::int, 0) = 0 or v_pass >= 6;
  end loop;
  raise notice 'tranche two applied % row(s) across % pass(es)', v_total, v_pass;
end $apply$;

do $verify$
declare v_bad int; v_sig jsonb;
begin
  -- P1 -- the two new tags resolve to categories venues_category_check accepts. The
  -- mapping's own CHECK already enforces this; asserting it here catches a CHECK that a
  -- later ALTER loosened.
  select count(*) into v_bad from public.venue_category_source_tags
   where provider_tag in ('mall','vacation rentals')
     and category <> all (array['bar','club','cafe','restaurant','hotel','sauna','cruising',
       'outdoor','shop','community_center','event-venue','theater','gallery','salon','gym']);
  if v_bad <> 0 then
    raise exception 'P1 failed: a new mapping row names a category the venues CHECK rejects';
  end if;

  -- P2 -- MIRROR. The three refused families must NOT be in the mapping. This is the only
  -- check that can see a later pass re-adding one because a sample looked clean, which is
  -- exactly how `restaurants` got in the first time.
  select count(*) into v_bad from public.venue_category_source_tags
   where provider_tag in ('theaters','spas','ice cream','restaurants',
                          'social service organizations','gay & lesbian bars');
  if v_bad <> 0 then
    raise exception 'P2 failed: % REFUSED provider tag(s) present in the mapping', v_bad;
  end if;

  -- P3 -- the tranche landed. Counted off the stamp, never against an exact total: the
  -- cohort grows whenever ingest adds a tripadvisor listing.
  select count(*) into v_bad from public.venues
   where enrichment_status->'category_backfill'->>'source' in
         ('source_tag:mall','source_tag:vacation rentals');
  if v_bad = 0 then
    raise exception 'P3 failed: no venue carries a tranche-two stamp — the tier never fired';
  end if;
  raise notice 'tranche two categorised % venue(s)', v_bad;

  -- P4 -- MIRROR. Tranche one must still be intact: widening the noise list changes which
  -- rows count as sole-tag, so a mistake there could strand the 134 already categorised.
  select count(*) into v_bad from public.venues
   where enrichment_status->'category_backfill'->>'source' like 'source_tag:%';
  if v_bad < 134 then
    raise exception 'P4 failed: only % source_tag stamp(s) remain — tranche one lost rows', v_bad;
  end if;

  -- P5 -- the sentinel is deployed, reports its denominators, and its invariant is 0.
  -- `mapping_rows` is asserted non-empty because `mappable_still_other = 0` over an empty
  -- mapping is vacuous.
  v_sig := public.venue_category_signals();
  if coalesce((v_sig->>'probe_ok')::boolean, false) is not true then
    raise exception 'P5 failed: venue_category_signals() did not report probe_ok';
  end if;
  if coalesce((v_sig->>'mapping_rows')::int, 0) < 5 then
    raise exception 'P5 failed: mapping has % row(s) — the tier is disabled and every count below reads clean',
      v_sig->>'mapping_rows';
  end if;
  if coalesce((v_sig->>'rejected_tag_in_mapping')::int, -1) <> 0 then
    raise exception 'P5 failed: rejected_tag_in_mapping = %', v_sig->>'rejected_tag_in_mapping';
  end if;
  if coalesce((v_sig->>'mappable_still_other')::int, -1) <> 0 then
    raise exception 'P5 failed: % venue(s) are mappable and still at other — the cursor did not reach them',
      v_sig->>'mappable_still_other';
  end if;
  raise notice 'sentinel: %', v_sig;

  -- P6 -- anon and authenticated cannot read the sentinel. A SECURITY DEFINER aggregate
  -- granted to `authenticated` is granted to every member.
  if has_function_privilege('anon', 'public.venue_category_signals()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.venue_category_signals()', 'EXECUTE') then
    raise exception 'P6 failed: venue_category_signals() is reachable by anon or authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.venue_category_signals()', 'EXECUTE') then
    raise exception 'P6 failed: service_role cannot execute venue_category_signals()';
  end if;

  raise notice 'all postconditions passed';
end $verify$;
