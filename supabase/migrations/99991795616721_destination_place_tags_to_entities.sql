-- Destination tags that name one real place we hold, converted to entity redirects.
--
-- #5743 stopped listing entity_kind='place' tags on /tags and 301'd the 153 of them to their
-- city/country/village. The Destinations category still listed tags that name a place but carry
-- entity_kind 'descriptor' or 'concept', so they slipped past that exclusion. Each row below was
-- decided by hand from its description, its assignments and the candidate entity rows — never by
-- name alone:
--
--   hamburg               DE city, 210 venues; assignments are Hamburg venues + Hamburg news.
--                         Hamburg NY holds 1 venue.
--   new-york-city         all 23 assigned venues are on /city/new-york.
--   houston-tx            "Texas" in the slug; Houston BC is the only other row.
--   columbus-ohio         "Ohio" in the slug; assigned venue is in Columbus OH.
--   richmond-va           "Virginia" in the slug; assigned venue (Babe's of Carytown) is there.
--   freiburg-im-breisgau  assigned venue is on that row.
--   linz-an-der-donau     the only Linz row.
--   fatih                 the only Fatih row (Istanbul district); assigned venue is in Istanbul.
--   cuauhtemoc            the description is the Mexico City borough (33 venues) and the
--                         assigned venue is on it; Cuauhtémoc, Chihuahua holds 1. The earlier
--                         "Aztec ruler" reading no longer matches the row's own prose.
--   crystal-river         the only Crystal River row (Florida).
--   arnsberg              same Wikidata id (Q3912) as the city row.
--   rotorua               NZ; a real row now exists (the audit only found a tmp- shell).
--   schwerin              description is the Mecklenburg-Vorpommern capital; /city/schwerin
--                         sits at 53.63/11.41. "Schwerin, Brandenburg" is a different, broken row.
--   pberg                 nickname for Prenzlauer Berg; same target as the `prenzlauer` tag.
--   leutkirch             description is the Allgäu town; the only Leutkirch row.
--   alonissos             the island is the single-island municipality of Alonnisos.
--
-- Left alone, with reasons: regions/states/continents (california, pennsylvania, queensland,
-- ontario, wales, europe, …) have no entity page; toledo, durango, georgetown, san-jose,
-- santa-cruz, alpine, lakeside are shared names; copacabana and crete only match a same-name city
-- in another country (Colombia, Nebraska); brixlegg's only row is an empty ghost shell; epsom's
-- description (Surrey) and assignment (Auckland) disagree; st-martin spans two countries; the
-- neighbourhoods (spandau, steglitz, tempelhof, karangahape-road, santurce, …) have no village row.
--
-- Soft on preconditions (a row someone already changed is skipped), hard on the end state.

select set_config('app.actor', 'editorial:destination-place-tags', true);

create temporary table _dest_place (tag_slug text, target_type text, target_slug text) on commit drop;
insert into _dest_place values
  ('hamburg', 'city', 'hamburg'),
  ('new-york-city', 'city', 'new-york'),
  ('houston-tx', 'city', 'houston'),
  ('columbus-ohio', 'city', 'columbus'),
  ('richmond-va', 'city', 'richmond-us-pk2tn'),
  ('freiburg-im-breisgau', 'city', 'freiburg-de-rmir8'),
  ('linz-an-der-donau', 'city', 'linz'),
  ('fatih', 'city', 'fatih'),
  ('cuauhtemoc', 'city', 'cuauhtemoc'),
  ('crystal-river', 'city', 'crystal-river'),
  ('arnsberg', 'city', 'arnsberg'),
  ('rotorua', 'city', 'rotorua'),
  ('schwerin', 'city', 'schwerin'),
  ('pberg', 'village', 'prenzlauer-berg'),
  ('leutkirch', 'city', 'leutkirch-im-allgaeu'),
  ('alonissos', 'city', 'alonnisos-municipality');

update public.unified_tags t
set publication_role = 'entity_redirect',
    entity_kind = 'place'::public.tag_entity_kind,
    canonical_entity_type = d.target_type,
    canonical_entity_id = coalesce(c.id, v.id),
    canonical_entity_path = case d.target_type when 'city' then '/city/' else '/villages/' end || d.target_slug,
    canonical_entity_reviewed_at = now(),
    publication_role_reviewed_at = now(),
    publication_role_review_note = 'reviewed canonical entity conversion (destination tags)',
    seo_indexable = false,
    seo_deindex_reason = 'publication_role:entity_redirect'
from _dest_place d
left join public.cities c on d.target_type = 'city' and c.slug = d.target_slug and c.duplicate_of_id is null
left join public.queer_villages v on d.target_type = 'village' and v.slug = d.target_slug and v.duplicate_of_id is null
where t.slug = d.tag_slug
  and t.status = 'active'
  and t.entity_kind is distinct from 'place'
  and coalesce(c.id, v.id) is not null;

do $verify$
declare v_ok int; v_missing text;
begin
  select count(*) into v_ok
  from _dest_place d
  join public.unified_tags t on t.slug = d.tag_slug and t.status = 'active'
  where t.entity_kind = 'place'
    and t.publication_role = 'entity_redirect'
    and t.canonical_entity_path = case d.target_type when 'city' then '/city/' else '/villages/' end || d.target_slug
    and t.seo_indexable = false;
  if v_ok <> 16 then
    select string_agg(d.tag_slug, ', ') into v_missing
    from _dest_place d
    where not exists (
      select 1 from public.unified_tags t
      where t.slug = d.tag_slug and t.status = 'active' and t.entity_kind = 'place'
        and t.canonical_entity_path = case d.target_type when 'city' then '/city/' else '/villages/' end || d.target_slug);
    raise exception 'destination place tags: % of 16 converted; not converted: %', v_ok, v_missing;
  end if;
end
$verify$;
