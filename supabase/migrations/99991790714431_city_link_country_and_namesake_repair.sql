-- Three events breached two ZERO-invariants, and the remedy differs per row.
--
-- `Critical data-quality gates` went red on every open PR with
-- CITY_LINK_NAMESAKE=1 and CITY_LINK_COUNTRY_MISMATCH=3 against ceilings of 0.
-- Unlike the ceilings raised in 60000101160000, these two are zero-invariants, so
-- a non-zero reading is a defect rather than a mis-specified bound. Three rows
-- carry all four counts.
--
-- WHY NOW, WHEN ALL THREE CITY ROWS ARE MONTHS OLD. Cambridge GB was created
-- 2026-04-30, Hong Kong HK 2026-05-01, Burgdorf CH 2026-08-30, and none is a
-- duplicate (measured: 0 sibling rows under the same (name, country)). The
-- metric reads LINKED CONTENT -- `relationship_country_mismatches` counts venues
-- and events whose own `country_id` disagrees with the city's
-- (99991790194100:183,192) -- so the recent gayout import plus an ordinary
-- `geo-link-content` pass is what pushed the evidence over the threshold. The
-- city rows are not the defect; the links are.
--
-- THE METRIC DOES NOT DECIDE THE REMEDY, and reading each event settled all
-- three differently:
--
--   CSD Burgdorf              event DE, linked to Burgdorf CH (Q68311, Bern)
--     "CSD" is the German term for a pride march and there is a Burgdorf in
--     Lower Saxony. The EVENT is right and the CITY LINK is wrong.
--
--   tri-Pride 2027            event CA, linked to Cambridge GB
--     tri-Pride is the Kitchener-Waterloo-Cambridge event in ONTARIO. Again the
--     event is right and the link is wrong.
--
--   Hong Kong Gay pride 2026  event CN, linked to Hong Kong HK
--     THE OPPOSITE. This event really is in Hong Kong, so the city link is
--     CORRECT and the event's own `country_id` is what is wrong. Hong Kong is
--     ISO 3166-1 HK and our city row sits under HK with region_name 'Hong Kong'.
--
-- Had this been swept as one shape -- "unlink the mismatched event" -- the third
-- row would have lost a correct city link on 73 venues' worth of metro.
--
-- UNLINKING IS ONLY HALF THE FIX, AND THE OTHER HALF IS WHY THIS IS A MIGRATION
-- AND NOT AN UPDATE. `geo-link-content` re-resolves an unlinked event by name and
-- falls back to the most populous same-name candidate, which is how a
-- quarantined Portland ME event was re-linked within the hour
-- (99991789886174). It does honour a quarantine marker --
-- geo-link-content/index.ts:303 reads
-- `enrichment_status.event_city_link.blocked` -- so both rows are stamped with
-- it, matching that migration's shape exactly. Without the stamp this repair
-- reverts on the next hourly pass.
--
-- NO CITY ROW IS CREATED, and that is measured rather than preferred: there is
-- no Burgdorf under DE and no Cambridge under CA. `cities` is unique on
-- (name, country) and `trg_cities_aa_split_name` strips a comma qualifier before
-- the index sees it, so "Cambridge, Ontario" cannot be represented either --
-- the same wall 99991789823216 documented for College Park. A null `city_id` is
-- recoverable; a wrong one is not.
--
-- THE HONG KONG FIX CLEARS BOTH FLAGS WITH ONE WRITE, which is worth stating
-- because it looks like it should need two. `wrong_namesake_events` fires when
-- another city row in THE EVENT'S OWN COUNTRY matches the event's `city` text,
-- and there is a `Hong Kong` row under CN -- slug `tmp-f21c8f12-...`, 0 venues,
-- 0 events, not indexable, i.e. the uncorroborated shell cohort. Moving the
-- event to HK removes it from that lookup's scope, so the namesake count falls
-- with the mismatch count. That CN shell is junk and is deliberately NOT
-- dispositioned here: it publishes nothing, and archiving shells is its own pass.

do $repair$
declare
  v_burgdorf_ch uuid;
  v_cambridge_gb uuid;
  v_hk_city uuid;
  v_hk_country uuid;
  v_unlinked int := 0;
  v_recountried int := 0;
begin
  select id into v_burgdorf_ch from public.cities where slug = 'burgdorf';
  select id into v_cambridge_gb from public.cities where slug = 'cambridge-gb-2wpbj';
  select id into v_hk_city from public.cities where slug = 'hong-kong-hk-2hvf2';
  select id into v_hk_country from public.countries where code = 'HK';

  -- Soft preconditions. A concurrent session may legitimately have repaired any
  -- of these between authoring and apply, and an exact-match premise would abort
  -- `db push` for the whole repo rather than no-opping. Only a missing HK country
  -- row aborts, because that is a broken assumption about the corpus itself
  -- rather than a row someone else already fixed.
  if v_hk_country is null then
    raise exception 'no countries row for HK -- cannot repair the Hong Kong event';
  end if;

  -- (1) + (2) Wrong city link, no correct row to move to: unlink and quarantine.
  -- `city_id` is preserved in the stamp so the decision is reversible by hand;
  -- a retraction that records nothing is a deletion.
  with unlinked as (
    update public.events e
    set city_id = null,
        needs_attention = true,
        enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
          || jsonb_build_object('event_city_link', jsonb_build_object(
               'by', 'migration:99991790714431',
               'blocked', 'namesake_across_border',
               'at', now(),
               'cleared_city_id', e.city_id,
               'detail', format(
                 'event country is %s and it was linked to the %s row for %s by name alone. No %s row exists under %s and cities is unique on (name, country), so the correct city cannot be created here. Re-link by hand once that row exists.',
                 e.country, c.slug, c.name, c.name, e.country)))
    from public.cities c
    where c.id = e.city_id
      and e.duplicate_of_id is null
      and e.id in ('ca2f0b94-8b00-4955-86a3-9b33142cc3c5'::uuid,   -- CSD Burgdorf (DE)
                   'e2ca4bd7-6a04-41a1-a651-245eb04d466b'::uuid)   -- tri-Pride 2027 (CA)
      and e.city_id in (v_burgdorf_ch, v_cambridge_gb)
      and e.country_id is distinct from c.country_id
    returning e.id
  )
  select count(*) into v_unlinked from unlinked;

  -- (3) Correct city link, wrong event country. Guarded on the value being
  -- replaced so a hand fix already applied is a no-op rather than a rewrite.
  with fixed as (
    update public.events e
    set country_id = v_hk_country,
        country = 'HK',
        enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
          || jsonb_build_object('event_country_repair', jsonb_build_object(
               'by', 'migration:99991790714431',
               'at', now(),
               'from', e.country,
               'detail', 'event is in Hong Kong and its city link is correct; its own country_id pointed at CN. Hong Kong is ISO 3166-1 HK and the city row sits under HK.'))
    where e.id = '8f5bca16-bd5b-4bef-9481-e9c53fa94537'::uuid
      and e.duplicate_of_id is null
      and e.city_id = v_hk_city
      and e.country_id is distinct from v_hk_country
    returning e.id
  )
  select count(*) into v_recountried from fixed;

  raise notice 'city link repair: % unlinked+quarantined, % re-countried', v_unlinked, v_recountried;
end
$repair$;

do $verify$
declare
  v_namesake int;
  v_mismatch int;
  v_unquarantined int;
begin
  -- P1 + P2: both zero-invariants read zero. Asserted on the REACHED state
  -- rather than on how many rows this file changed, so a concurrent session's
  -- better fix satisfies it too.
  select count(*) into v_namesake
  from public.city_quality_profile
  where 'CITY_LINK_NAMESAKE' = any(issue_codes);
  if v_namesake <> 0 then
    raise exception 'P1 failed: CITY_LINK_NAMESAKE is %, expected 0', v_namesake;
  end if;

  select count(*) into v_mismatch
  from public.city_quality_profile
  where 'CITY_LINK_COUNTRY_MISMATCH' = any(issue_codes);
  if v_mismatch <> 0 then
    raise exception 'P2 failed: CITY_LINK_COUNTRY_MISMATCH is %, expected 0', v_mismatch;
  end if;

  -- P3: the two unlinked rows carry the quarantine marker. Without it
  -- `geo-link-content` re-links them on the next hourly pass and this migration
  -- silently undoes itself, which no count of changed rows would reveal.
  select count(*) into v_unquarantined
  from public.events e
  where e.id in ('ca2f0b94-8b00-4955-86a3-9b33142cc3c5'::uuid,
                 'e2ca4bd7-6a04-41a1-a651-245eb04d466b'::uuid)
    and coalesce(e.enrichment_status->'event_city_link'->>'blocked', '') = '';
  if v_unquarantined <> 0 then
    raise exception 'P3 failed: % unlinked event(s) carry no blocked marker', v_unquarantined;
  end if;

  -- P4: the Hong Kong event KEPT its city link. The mirror of P2 -- clearing
  -- three city links would also satisfy P2, and on this row that would be wrong.
  if not exists (
    select 1 from public.events e
    join public.cities c on c.id = e.city_id
    where e.id = '8f5bca16-bd5b-4bef-9481-e9c53fa94537'::uuid
      and c.slug = 'hong-kong-hk-2hvf2'
  ) then
    raise exception 'P4 failed: the Hong Kong event lost its (correct) city link';
  end if;

  raise notice 'verified: both zero-invariants at 0, 2 rows quarantined, Hong Kong link intact';
end
$verify$;
