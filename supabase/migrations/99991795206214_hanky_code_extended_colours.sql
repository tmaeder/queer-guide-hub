-- Ten more handkerchief colours, extended tier. Meanings are the ones that
-- recur across later scene lists; they vary by city and decade, which the
-- /tags/handkerchief-code band already says.
--
-- Three layers, like the original 16: the CMS reference vocabulary
-- (taxonomy_terms, what the picker labels from), the cultural graph node +
-- canonical variant (what user_hanky_signals.variant_id points at), and a
-- published 'meaning' claim (geography + validity are required by
-- cultural_claims_publication_guard_trg).
begin;

insert into public.taxonomy_terms(id, taxonomy, value, name, metadata, parent_id, sort_order) values
  ('abd9b828-b8b2-5de9-8582-22c453d22df8'::uuid,'hanky_code','teal','Teal','{"id": "teal", "colorKey": "flags.hanky.colors.teal", "colorEn": "Teal", "hex": "#1A8C8C", "meaningKey": "flags.hanky.meanings.teal", "meaningEn": "Cock and ball torture", "tier": "extended"}'::jsonb,null,16),
  ('2c1bb059-1bc5-50a3-8440-5e0c710940fe'::uuid,'hanky_code','mustard','Mustard','{"id": "mustard", "colorKey": "flags.hanky.colors.mustard", "colorEn": "Mustard", "hex": "#D4A017", "meaningKey": "flags.hanky.meanings.mustard", "meaningEn": "Well hung — 8\"+", "tier": "extended"}'::jsonb,null,17),
  ('8e657f6a-08d5-5a81-95e1-d1903063a600'::uuid,'hanky_code','gold','Gold','{"id": "gold", "colorKey": "flags.hanky.colors.gold", "colorEn": "Gold", "hex": "#C9A227", "meaningKey": "flags.hanky.meanings.gold", "meaningEn": "Threesomes — two looking for one", "tier": "extended"}'::jsonb,null,18),
  ('cc901cec-9323-598a-a432-b9075daf2211'::uuid,'hanky_code','olive-drab','Olive drab','{"id": "olive-drab", "colorKey": "flags.hanky.colors.oliveDrab", "colorEn": "Olive drab", "hex": "#6B6B3A", "meaningKey": "flags.hanky.meanings.oliveDrab", "meaningEn": "Military and uniforms", "tier": "extended"}'::jsonb,null,19),
  ('24b34c1f-b8b9-5742-827b-e54cdd8702a8'::uuid,'hanky_code','medium-blue','Medium blue','{"id": "medium-blue", "colorKey": "flags.hanky.colors.mediumBlue", "colorEn": "Medium blue", "hex": "#2F5FBF", "meaningKey": "flags.hanky.meanings.mediumBlue", "meaningEn": "Cops", "tier": "extended"}'::jsonb,null,20),
  ('a70d5fd9-fa42-559b-85a2-01196e93201b'::uuid,'hanky_code','robins-egg-blue','Robin''s egg blue','{"id": "robins-egg-blue", "colorKey": "flags.hanky.colors.robinsEggBlue", "colorEn": "Robin''s egg blue", "hex": "#8FD3D0", "meaningKey": "flags.hanky.meanings.robinsEggBlue", "meaningEn": "69", "tier": "extended"}'::jsonb,null,21),
  ('6af95c91-a314-5163-9144-47f158402d6f'::uuid,'hanky_code','beige','Beige','{"id": "beige", "colorKey": "flags.hanky.colors.beige", "colorEn": "Beige", "hex": "#D8C3A0", "meaningKey": "flags.hanky.meanings.beige", "meaningEn": "Rimming", "tier": "extended"}'::jsonb,null,22),
  ('3e9c34a6-537e-5aea-981c-a97a285e2ad9'::uuid,'hanky_code','coral','Coral','{"id": "coral", "colorKey": "flags.hanky.colors.coral", "colorEn": "Coral", "hex": "#F27B6B", "meaningKey": "flags.hanky.meanings.coral", "meaningEn": "Feet and toe sucking", "tier": "extended"}'::jsonb,null,23),
  ('076cd855-066f-5ee5-97fe-eb6d5f3aaadc'::uuid,'hanky_code','apricot','Apricot','{"id": "apricot", "colorKey": "flags.hanky.colors.apricot", "colorEn": "Apricot", "hex": "#F6B184", "meaningKey": "flags.hanky.meanings.apricot", "meaningEn": "Chubs and chasers", "tier": "extended"}'::jsonb,null,24),
  ('4f2f57e8-e22f-5b4b-b979-94609a7c2cf8'::uuid,'hanky_code','leopard','Leopard','{"id": "leopard", "colorKey": "flags.hanky.colors.leopard", "colorEn": "Leopard", "hex": "#B5803A", "meaningKey": "flags.hanky.meanings.leopard", "meaningEn": "Tattoos", "tier": "extended"}'::jsonb,null,25)
on conflict (taxonomy, value) do nothing;

with hanky_rows(slug, name) as (values
  ('hanky-teal', 'Teal'),
  ('hanky-mustard', 'Mustard'),
  ('hanky-gold', 'Gold'),
  ('hanky-olive-drab', 'Olive drab'),
  ('hanky-medium-blue', 'Medium blue'),
  ('hanky-robins-egg-blue', 'Robin''s egg blue'),
  ('hanky-beige', 'Beige'),
  ('hanky-coral', 'Coral'),
  ('hanky-apricot', 'Apricot'),
  ('hanky-leopard', 'Leopard')

)
insert into public.cultural_nodes (
    slug, node_kind, artifact_kind, name, sensitivity, status, last_verified_at, metadata
  )
  select slug, 'artifact', 'hanky_code', name || ' hanky', 'adult', 'published', now(),
         jsonb_build_object('registryId', replace(slug, 'hanky-', ''))
  from hanky_rows
  on conflict (slug) do update set metadata = public.cultural_nodes.metadata || excluded.metadata;

insert into public.cultural_variants (node_id, source_id, slug, label, render_spec, status)
select n.id, s.id, 'canonical', n.name,
       jsonb_build_object('renderer', 'hanky-registry', 'registryId', n.metadata ->> 'registryId'),
       'published'
from public.cultural_nodes n
cross join public.cultural_sources s
where n.artifact_kind = 'hanky_code'
  and s.slug = 'townsend-1983-hanky-core'
on conflict (node_id, slug) do nothing;

with meaning_rows(registry_id, meaning) as (values
  ('teal', 'Cock and ball torture'),
  ('mustard', 'Well hung — 8"+'),
  ('gold', 'Threesomes — two looking for one'),
  ('olive-drab', 'Military and uniforms'),
  ('medium-blue', 'Cops'),
  ('robins-egg-blue', '69'),
  ('beige', 'Rimming'),
  ('coral', 'Feet and toe sucking'),
  ('apricot', 'Chubs and chasers'),
  ('leopard', 'Tattoos')
)
insert into public.cultural_claims (
  subject_node_id, source_id, predicate, value_text, geography_code, valid_from, status, reviewed_at
)
select n.id, s.id, 'meaning', m.meaning, 'US', '1970-01-01', 'published', now()
from meaning_rows m
join public.cultural_nodes n
  on n.artifact_kind = 'hanky_code' and n.metadata ->> 'registryId' = m.registry_id
cross join public.cultural_sources s
where s.slug = 'townsend-1983-hanky-core'
  and not exists (
    select 1 from public.cultural_claims c
    where c.subject_node_id = n.id and c.predicate = 'meaning'
  );

do $verify$
declare v_bad int;
begin
  -- End state: every reference colour has a published node with a canonical variant.
  select count(*) into v_bad
  from public.taxonomy_terms t
  where t.taxonomy = 'hanky_code' and t.value in ('teal', 'mustard', 'gold', 'olive-drab', 'medium-blue', 'robins-egg-blue', 'beige', 'coral', 'apricot', 'leopard')
    and not exists (
      select 1 from public.cultural_nodes n
      join public.cultural_variants v on v.node_id = n.id and v.slug = 'canonical'
      where n.slug = 'hanky-' || t.value and n.status = 'published'
    );
  if v_bad <> 0 then
    raise exception 'hanky extended colours: % reference colours have no published variant', v_bad;
  end if;
end
$verify$;

commit;
