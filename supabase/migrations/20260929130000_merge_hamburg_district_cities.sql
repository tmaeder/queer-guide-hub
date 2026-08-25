-- Merge the Hamburg borough/quarter shells in public.cities into Hamburg.
--
-- These eight rows are BOROUGHS AND QUARTERS OF HAMBURG, not cities. Every one
-- is an import shell: shell_status='placeholder', seo_indexable=false, a tmp-…
-- slug (so nothing was ever published and no redirect is owed), and zero
-- venues / events / hotels / queer_villages / news links / favourites. Hamburg
-- itself (a22dc107…, slug 'hamburg', Q1055, shell_status='real') holds the real
-- content: 185 venues, 33 events, 1 hotel, 1 queer village.
--
-- Altona appears THREE times — "Altona, Hamburg", "Hamburg-Altona" (byte-identical
-- on population 261,213 and coords 53.55/9.933) and the quarter "Altona-Ottensen" —
-- which is why they collapse into Hamburg rather than into each other.
--
-- The only content attached is 15 personalities rows, all visibility='draft',
-- all §175 / Sachsenhausen memorial records, linked by city_id as birthplace.
-- Their birth_place TEXT already spells the district ("Altona, Hamburg (DE)",
-- "Harburg (DE)"), so reparenting city_id to Hamburg loses no historical
-- granularity — Altona and Harburg were independent Prussian cities until
-- 1937/38 and the text column, not the FK, is what preserves that.
--
-- Deliberately NOT merged:
--   * Altona, AU (40342f96-cd78-4eea-96e5-e4d4b5a68609) — Melbourne suburb.
--     merge_cities' cross-country guard would refuse it anyway.
--   * Pinneberg / Norderstedt / Wedel / Ahrensburg (15–21 km out) — independent
--     Schleswig-Holstein municipalities. They surface in a radius scan; leave them.
--
-- Mechanism is the existing soft, reversible merge core: merge_cities sets
-- duplicate_of_id, reparents the child FKs, registers the dropped name as a
-- city_alias of the survivor (so future ingestion resolves "Altona, Hamburg"
-- straight to Hamburg instead of minting a ninth shell), and audits into
-- city_merge_audit (undo: unmerge_cities(audit_id)). All eight are DE, same
-- country as Hamburg, so p_confirm_cross_country stays false.
--
-- Search and the geo spine need no help here: the UPDATE fires trg_sync_geo_spine
-- → geo_places → search_documents_sync('city'), and search_documents_index_cities
-- filters `duplicate_of_id is null`, so the drain deletes the eight docs rather
-- than leaving them stale.

do $$
declare
  v_keep uuid := 'a22dc107-45cc-491e-af45-d91ebc1eda3c'; -- Hamburg
  drops uuid[] := array[
    '23ceb5c9-b2bb-45d4-a71b-ca08b4391a50', -- Altenwerder, Hamburg
    'e5594f5b-b5c2-4e8e-877a-571ce92d2324', -- Altona-Ottensen, Hamburg
    '2cc4e621-2541-4177-9ce0-dd06eaff8de7', -- Groß Flottbek, Hamburg
    'a3d27064-04d1-4343-b14c-7e48f1d6058d', -- Bergedorf, Hamburg
    'b3862d2d-414e-482f-8183-87c533a6bbf3', -- Niendorf, Hamburg
    'ab3ab732-55fc-46f8-98be-7cfa1becff08', -- Altona, Hamburg
    '2e644ac8-72a5-4093-bd93-5a2c9d4b229f', -- Hamburg-Altona
    'd8294722-3106-420f-8a7d-20da96b0571f'  -- Harburg
  ];
  i int;
begin
  for i in 1 .. array_length(drops, 1) loop
    -- replay-safe: skip anything already merged
    if exists (select 1 from public.cities where id = drops[i] and duplicate_of_id is null) then
      perform public.merge_cities(v_keep, drops[i]);
    end if;
  end loop;
end $$;
