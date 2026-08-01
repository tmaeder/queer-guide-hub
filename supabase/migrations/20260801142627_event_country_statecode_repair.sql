-- Repair: events.country holds a mix of ISO2 country codes AND US state codes.
--
-- The gaycities scrape wrote a two-letter code into events.country without recording
-- whether it was a country or a US state. Most rows are genuine country codes, but ~126
-- are US states -- and 20 of those abbreviations collide with real ISO2 country codes:
--   AZ -> Azerbaijan (Sedona),  KY -> Cayman Islands (Murray),  CA -> Canada (California),
--   DE -> Germany,  IL -> Israel,  IN -> India,  CO -> Colombia,  VA -> Vatican City, ...
--
-- Rows whose city corroborated the foreign country (Toronto/CA, Tel Aviv/IL, Berlin/DE)
-- resolved correctly and are left alone. This migration only touches the residue:
--   (a) 124 rows that never resolved a country_id at all, and
--   (b) 2 rows that resolved to a foreign country their city does not belong to.
--
-- CA is the one genuinely mixed code and is split by city: Whistler / Victoria /
-- Quebec City stay Canada, the rest (Pomona, Costa Mesa, Riverside, ...) are California.
-- Note `Victoria` exists in `cities` ONLY as Victoria, Seychelles -- matching it on name
-- alone would relocate Victoria BC to the Indian Ocean, so it is pinned explicitly here.
--
-- Setting `country` fires trg_events_geo_derive, which re-resolves country_id, and
-- trg_events_set_currency, which corrects currency. No FK is written by hand.

do $$
declare
  v_us_fixed  integer;
  v_ca_fixed  integer;
begin
  -- (a) + (b): state codes -> US, excluding the genuine Canadian cities.
  with st(code) as (values
    ('AL'),('AK'),('AZ'),('AR'),('CA'),('CO'),('CT'),('DE'),('FL'),('GA'),('HI'),('ID'),
    ('IL'),('IN'),('IA'),('KS'),('KY'),('LA'),('ME'),('MD'),('MA'),('MI'),('MN'),('MS'),
    ('MO'),('MT'),('NE'),('NV'),('NH'),('NJ'),('NM'),('NY'),('NC'),('ND'),('OH'),('OK'),
    ('OR'),('PA'),('RI'),('SC'),('SD'),('TN'),('TX'),('UT'),('VT'),('VA'),('WA'),('WV'),
    ('WI'),('WY'),('DC'))
  update public.events e set country = 'US'
  where e.duplicate_of_id is null
    and upper(btrim(e.country)) in (select code from st)
    and lower(btrim(coalesce(e.city, ''))) not in ('whistler', 'victoria', 'quebec city')
    and (
      -- (a) never resolved
      e.country_id is null
      -- (b) resolved to a foreign country whose city set does not contain this city
      or exists (
        select 1 from public.countries co
        where co.id = e.country_id and co.code <> 'US'
          and not exists (
            select 1 from public.cities c
            where c.duplicate_of_id is null
              and c.country_id = e.country_id
              and lower(btrim(c.name)) = lower(btrim(e.city)))
          and e.city is not null)
    );
  get diagnostics v_us_fixed = row_count;

  -- The genuine Canadian residue: country text is already 'CA', it just never resolved
  -- (their cities are absent from `cities`). Set the FK explicitly.
  update public.events e
     set country_id = (select id from public.countries where code = 'CA')
  where e.duplicate_of_id is null
    and e.country_id is null
    and upper(btrim(e.country)) = 'CA'
    and lower(btrim(coalesce(e.city, ''))) in ('whistler', 'victoria', 'quebec city');
  get diagnostics v_ca_fixed = row_count;

  raise notice 'statecode repair: % -> US, % -> CA', v_us_fixed, v_ca_fixed;
end $$;
