-- Three events broke the two CITY_LINK_* zero-invariants and red-lit `Critical
-- data-quality gates` on every open PR in the repo. Three different importers,
-- one defect class: an event resolved onto a same-name city in the wrong country.
--
--   Hong Kong  gaytravel4u  country CN, city hong-kong-hk-2hvf2 (HK)
--   Burgdorf   queerde      country DE, city burgdorf (CH)
--   Cambridge  gayout       country CA, city cambridge-gb-2wpbj (GB)
--
-- TWO DIFFERENT REMEDIES, AND THE EVIDENCE DECIDES WHICH -- they are not
-- interchangeable and applying one rule to all three would damage two rows.
--
-- HONG KONG: the CITY LINK IS CORRECT and is not touched. c701d52b is the real
-- Hong Kong (country HK, 23 events, 73 venues). What is wrong is the COUNTRY
-- stamp: the upstream JSON-LD says "country": "CN" and the importer took it
-- verbatim. This platform models HK as its own country and must --
-- `countries.lgbti_criminalization` and the whole safety-gating layer are
-- per-country, so an HK event filed under CN is gated on the wrong jurisdiction.
-- It became a namesake flag because a second "Hong Kong" exists under CN
-- (e4aad542, slug tmp-..., not indexable, 0 events, 0 venues) -- one of the
-- personality-birth-place shells -- giving the detector something to match.
-- That shell is deliberately left alone: it is inert, and dispositioning the
-- tmp- cohort is its own decision.
--
-- BURGDORF AND CAMBRIDGE: the city link is WRONG and there is nothing to move it
-- to. "CSD Burgdorf" is Burgdorf, Lower Saxony, GERMANY (CSD is the German pride
-- name; the source is queer.de) and the only Burgdorf row we hold is the Swiss
-- one. "tri-Pride 2027" is the Kitchener-Waterloo-Cambridge festival in Cambridge,
-- ONTARIO and the only Cambridge rows we hold are GB and US. Measured, not
-- assumed: no Burgdorf DE row and no Cambridge CA row exists.
--
-- SO THEY ARE UNLINKED, NOT RELINKED, AND NO CITY ROW IS MINTED. A null city_id
-- is recoverable; a wrong one is not. Minting two city rows to hold two events
-- is a geography decision, not a repair, and `cities` holds at most one row per
-- (name, country) so it is not the trivial insert it looks like.
--
-- THE UNLINK IS NOT DURABLE ON ITS OWN -- that is the whole reason for the stamp.
-- Two linkers would re-resolve these by name within the hour. Both honour the
-- same quarantine key, verified in their live source rather than assumed:
--   * run_event_city_link selects `not (enrichment_status ? 'event_city_link')`,
--     so any stamp under that key removes the row from its work list;
--   * geo-link-content reads `enrichment_status.event_city_link.blocked` and
--     refuses ("otherwise this hourly job would undo that runner's decision one
--     row at a time"). NOTE: CLAUDE.md still says this function re-links
--     quarantined rows regardless. That was true when written and is now stale.
-- The stamp carries the evidence and names the city that would be needed, so the
-- row is a work item a human can action rather than a silent null.

-- 1. Hong Kong -- correct the country, keep the link.
update public.events
   set country = 'HK',
       country_id = (select id from public.countries where code = 'HK')
 where id = '8f5bca16-bd5b-4bef-9481-e9c53fa94537'
   and country = 'CN';

-- 2/3. Burgdorf + Cambridge -- detach and quarantine.
update public.events e
   set city_id = null,
       needs_attention = true,
       enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('event_city_link', jsonb_build_object(
              'blocked', v.reason,
              'at', now(),
              -- Deliberately version-free. This repo's own rule is that a version
              -- string lives in as few places as possible; MCP apply_migration
              -- stamps its own timestamp, so a version baked into written DATA
              -- is a guaranteed mismatch the moment the file is renumbered.
              'by', 'city_link_namesake_quarantine',
              'detached_city_id', e.city_id,
              'needs_city', v.needs_city))
  from (values
    ('ca2f0b94-8b00-4955-86a3-9b33142cc3c5'::uuid,
     'namesake_wrong_country: event country DE, linked city was Burgdorf CH',
     'Burgdorf, Lower Saxony, DE'),
    ('e2ca4bd7-6a04-41a1-a651-245eb04d466b'::uuid,
     'namesake_wrong_country: event country CA, linked city was Cambridge GB',
     'Cambridge, Ontario, CA')
  ) as v(id, reason, needs_city)
 where e.id = v.id
   and e.city_id is not null;

do $verify$
declare
  v_namesake int;
  v_mismatch int;
  v_hk_city text;
  v_hk_country text;
  v_stamped int;
  v_still_linked int;
begin
  -- P1: Hong Kong reached the intended state AND kept its link. A "fix" that
  -- detached it would satisfy the zero-invariants below and be wrong.
  select e.country, c.slug into v_hk_country, v_hk_city
    from public.events e left join public.cities c on c.id = e.city_id
   where e.id = '8f5bca16-bd5b-4bef-9481-e9c53fa94537';
  if v_hk_country is distinct from 'HK' then
    raise exception 'P1 hong kong country is %, expected HK', v_hk_country;
  end if;
  if v_hk_city is distinct from 'hong-kong-hk-2hvf2' then
    raise exception 'P1 hong kong city link is %, expected hong-kong-hk-2hvf2', v_hk_city;
  end if;

  -- P2: the other two are detached.
  select count(*) into v_still_linked from public.events
   where id in ('ca2f0b94-8b00-4955-86a3-9b33142cc3c5','e2ca4bd7-6a04-41a1-a651-245eb04d466b')
     and city_id is not null;
  if v_still_linked <> 0 then
    raise exception 'P2 % of 2 quarantined events still carry a city_id', v_still_linked;
  end if;

  -- P3: and they are QUARANTINED, not merely detached. Without the stamp the
  -- hourly linker re-links them and this migration silently undoes itself.
  select count(*) into v_stamped from public.events
   where id in ('ca2f0b94-8b00-4955-86a3-9b33142cc3c5','e2ca4bd7-6a04-41a1-a651-245eb04d466b')
     and coalesce(enrichment_status,'{}'::jsonb) -> 'event_city_link' ? 'blocked';
  if v_stamped <> 2 then
    raise exception 'P3 % of 2 quarantined events carry a blocked stamp', v_stamped;
  end if;

  -- P4/P5: both zero-invariants, corpus-wide rather than for these rows only.
  with base as (select id, name, country_id, seo_indexable
                  from public.cities where duplicate_of_id is null)
  select count(*) into v_namesake
    from base c
    join public.events e on e.city_id = c.id and e.duplicate_of_id is null
     and e.status = 'active' and coalesce(e.end_date, e.start_date) >= now()
     and e.country_id is distinct from c.country_id
    join base alt on alt.id <> c.id and alt.country_id = e.country_id
     and immutable_unaccent(lower(btrim(alt.name))) = immutable_unaccent(lower(btrim(e.city)))
   where c.seo_indexable;
  if v_namesake <> 0 then
    raise exception 'P4 CITY_LINK_NAMESAKE is %, expected 0', v_namesake;
  end if;

  select count(*) into v_mismatch
    from public.city_quality_profile
   where 'CITY_LINK_COUNTRY_MISMATCH' = any(issue_codes);
  if v_mismatch <> 0 then
    raise exception 'P5 CITY_LINK_COUNTRY_MISMATCH is %, expected 0', v_mismatch;
  end if;
end
$verify$;
