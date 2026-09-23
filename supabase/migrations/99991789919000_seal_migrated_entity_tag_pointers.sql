-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991789919000 with no repo file — the signature of
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
