-- "Hong Kong Gay pride 2026" was stamped country CN while linked to the HK city row,
-- which broke the CITY_LINK_NAMESAKE zero-invariant on /city/hong-kong-hk-2hvf2.
--
-- MINE. Imported by source-gaytravel4u at 2026-09-28T15:37:15Z (PR #3987).
--
-- THE CITY LINK IS CORRECT AND IS NOT TOUCHED. c701d52b (hong-kong-hk-2hvf2, country HK,
-- 23 events, 73 venues) is the real Hong Kong and the event belongs to it. What is wrong is
-- the COUNTRY stamp: the upstream JSON-LD says `"country": "CN"` and the importer took it
-- verbatim.
--
-- WHY CN IS WRONG HERE RATHER THAN MERELY DEBATABLE: this platform models Hong Kong as its
-- own country (ISO 3166-1 HK), and it has to -- `countries.lgbti_criminalization` and the
-- whole safety-gating layer are per-country, and Hong Kong's legal position is not mainland
-- China's. Filing an HK event under CN would gate it on the wrong jurisdiction.
--
-- HOW IT BECAME A NAMESAKE FLAG: `city_quality_profile.wrong_namesake_events` counts events
-- whose country_id differs from their city's AND for which another city of the same name
-- exists in the event's country. A second "Hong Kong" row exists under CN
-- (e4aad542, slug tmp-..., seo_indexable=false, 0 events, 0 venues) -- one of the
-- `personality-birth-place` tmp- shells CLAUDE.md documents. So CN on the event made the
-- detector find that shell and correctly report a namesake collision.
--
-- THE SHELL IS DELIBERATELY NOT TOUCHED. It is part of the 1,832-row tmp- cohort with its own
-- disposition backlog; deleting or merging it here would be an unrelated decision smuggled
-- into an events-import PR, and it is inert (not indexable, no children).
--
-- NOT A RE-LINK RISK: this sets country, not city_id, so there is nothing for
-- `geo-link-content` to re-resolve. `derive_entity_geo_address` derives country from the
-- linked city, which is HK, so the trigger agrees with this value rather than fighting it.
--
-- Dry-run on prod in a rolled-back transaction: namesake_remaining 1 -> 0.
--
-- Deliberately NOT in this file: the other two CITY_LINK_COUNTRY_MISMATCH rows
-- (Burgdorf/queerde, Cambridge/gayout). Both are other importers' namesake mislinks whose
-- correct city row does not exist, so both need an unlink PLUS a quarantine stamp that
-- survives the hourly `geo-link-content` re-link -- a different remedy, other people's
-- producers, their own change.

update public.events
   set country = 'HK',
       country_id = (select id from public.countries where code = 'HK')
 where id = '8f5bca16-bd5b-4bef-9481-e9c53fa94537'
   and country = 'CN';

do $verify$
declare
  v_country text;
  v_city_slug text;
  v_namesake int;
begin
  select e.country, c.slug into v_country, v_city_slug
    from public.events e
    left join public.cities c on c.id = e.city_id
   where e.id = '8f5bca16-bd5b-4bef-9481-e9c53fa94537';

  -- P1: the row reached the intended state (idempotent -- asserts state, not rowcount).
  if v_country is distinct from 'HK' then
    raise exception 'P1 hong kong event country is %, expected HK', v_country;
  end if;

  -- P2: the city link was preserved. A "fix" that detached it would satisfy P1 and P3.
  if v_city_slug is distinct from 'hong-kong-hk-2hvf2' then
    raise exception 'P2 city link changed to %, expected hong-kong-hk-2hvf2', v_city_slug;
  end if;

  -- P3: the zero-invariant, corpus-wide rather than for this row only.
  with base as (
    select id, name, country_id, seo_indexable
      from public.cities where duplicate_of_id is null
  )
  select count(*) into v_namesake
    from base c
    join public.events e
      on e.city_id = c.id and e.duplicate_of_id is null and e.status = 'active'
     and coalesce(e.end_date, e.start_date) >= now()
     and e.country_id is distinct from c.country_id
    join base alt
      on alt.id <> c.id and alt.country_id = e.country_id
     and immutable_unaccent(lower(btrim(alt.name))) = immutable_unaccent(lower(btrim(e.city)))
   where c.seo_indexable;

  if v_namesake <> 0 then
    raise exception 'P3 CITY_LINK_NAMESAKE is %, expected 0', v_namesake;
  end if;
end
$verify$;
