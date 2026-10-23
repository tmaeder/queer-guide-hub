-- The snapshot copies only rows anon can read, and caps large tables, so a tag
-- entity redirect can point at a row this local DB does not have. On prod the
-- target exists and zy_validate_tag_entity_target passes; locally the same
-- trigger raises on ANY update of that tag, failing a correct tag migration
-- (#4615: "Canonical entity target does not exist"). Turn such redirects into
-- plain utility tags so the local copy is self-consistent. Loopback DB only.
set session_replication_role = replica;
update public.unified_tags t
   set publication_role = 'utility', canonical_entity_type = null, canonical_entity_id = null,
       canonical_entity_path = null, canonical_entity_reviewed_at = null
 where t.publication_role = 'entity_redirect'
   and not exists (
     select 1 from (
       select 'personality' ty, id from public.personalities where duplicate_of_id is null
       union all select 'city', id from public.cities where duplicate_of_id is null
       union all select 'country', id from public.countries where duplicate_of_id is null
       union all select 'village', id from public.queer_villages where duplicate_of_id is null
       union all select 'venue', id from public.venues where duplicate_of_id is null
       union all select 'organization', id from public.organizations where duplicate_of_id is null
       union all select 'event', id from public.events where duplicate_of_id is null
       union all select 'hotel', id from public.hotels where duplicate_of_id is null
       union all select 'community_group', id from public.community_groups where duplicate_of_id is null
     ) e where e.ty = t.canonical_entity_type and e.id = t.canonical_entity_id);
