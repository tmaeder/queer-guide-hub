-- Preserve an auditable pointer from retired tag-shaped entity imports to the
-- typed draft record that now owns their content. These rows stay deprecated,
-- non-indexable, and unavailable as glossary articles.

select set_config('app.actor','editorial:seal-migrated-entity-pointers',true);

update public.unified_tags t
set publication_role='entity_redirect',entity_kind='person',
    canonical_entity_type='personality',canonical_entity_id=p.id,
    canonical_entity_path='/personalities/'||p.slug,
    canonical_entity_reviewed_at=now(),publication_role_reviewed_at=now(),
    publication_role_review_note='retired biography tag points to typed personality',
    seo_indexable=false,seo_deindex_reason='retired_entity_import'
from public.personalities p
where t.status='deprecated'
  and t.deprecation_reason='biography migrated to personalities; legacy tag retired'
  and p.slug=t.slug and p.duplicate_of_id is null;

update public.unified_tags t
set publication_role='entity_redirect',entity_kind='descriptor',
    canonical_entity_type='organization',canonical_entity_id=o.id,
    canonical_entity_path='/organizations/'||o.slug,
    canonical_entity_reviewed_at=now(),publication_role_reviewed_at=now(),
    publication_role_review_note='retired organization tag points to typed organization',
    seo_indexable=false,seo_deindex_reason='retired_entity_import'
from public.organizations o
where t.status='deprecated'
  and t.deprecation_reason='organization migrated from false person classification; legacy tag retired'
  and o.slug=t.slug and o.duplicate_of_id is null;

do $verify$
begin
  if exists(select 1 from public.unified_tags
    where deprecation_reason in (
      'biography migrated to personalities; legacy tag retired',
      'organization migrated from false person classification; legacy tag retired'
    ) and (publication_role<>'entity_redirect' or canonical_entity_id is null
      or canonical_entity_path is null or canonical_entity_reviewed_at is null
      or seo_indexable)) then
    raise exception 'migrated entity tag remains unsealed';
  end if;
end $verify$;
