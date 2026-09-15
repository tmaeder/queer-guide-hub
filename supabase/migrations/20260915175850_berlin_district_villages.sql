-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260915175850 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
do $$
declare
  v_berlin  uuid := '5761c6c4-3ed6-4429-832b-025e508db544';  -- cities: Berlin, Germany
  v_germany uuid := 'fd9997de-bf8f-49a5-a641-9240a39541ff';  -- countries: Germany (DE)
  v_made int;
begin
  if not exists (select 1 from public.cities c
                  where c.id = v_berlin and lower(c.name) = 'berlin' and c.country_id = v_germany) then
    raise exception 'parent city is not Berlin, Germany - refusing to create districts under it';
  end if;

  insert into public.queer_villages (name, slug, city_id, country_id, description, history,
                                     latitude, longitude, seo_indexable)
  select v.name, v.slug, v_berlin, v_germany, v.description,
         (select t.description from public.unified_tags t
           where t.slug = v.tag_slug and nullif(trim(t.description), '') is not null),
         v.lat, v.lon, true
    from (values
      ('Kreuzberg', 'kreuzberg', 'kreuzberg',
       'Berlin''s busiest queer nightlife district, running from the saunas and bars around Mehringdamm to the Oranienstraße strip.',
       52.4977, 13.4031),
      ('Neukölln', 'neukoelln', 'neukolln',
       'A younger, less commercial queer scene immediately south-east of Kreuzberg.',
       52.4750, 13.4410),
      ('Friedrichshain', 'friedrichshain', 'friedrichshain',
       'Club territory on the north bank of the Spree, including Berghain and the venues on the RAW site at Revaler Straße.',
       52.5150, 13.4540),
      ('Prenzlauer Berg', 'prenzlauer-berg', 'prenzlauer',
       'A quieter residential district north of Mitte with a long-standing lesbian and feminist scene.',
       52.5400, 13.4240),
      ('Mitte', 'mitte', 'mitte',
       'Berlin''s central borough; its queer venues sit among the city''s main cultural institutions.',
       52.5296, 13.4014)
    ) as v(name, slug, tag_slug, description, lat, lon)
   where not exists (select 1 from public.queer_villages q where q.slug = v.slug);
  get diagnostics v_made = row_count;
  raise notice 'districts created: % (of 5; any shortfall already existed)', v_made;
end $$;;
