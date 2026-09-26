-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260925040915 with no repo file — the signature of
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
begin;

create temporary table invalid_generated_country_drafts on commit drop as
select d.id, d.entity_id
from public.editorial_drafts d
where d.entity_type = 'country'
  and d.status = 'pending'
  and (
    nullif(btrim(d.draft_hook), '') is null
    or char_length(d.draft_hook) > 120
    or d.draft_hook ~ '[.]$'
    or nullif(btrim(d.draft_long), '') is null
    or cardinality(regexp_split_to_array(btrim(d.draft_long), '[.!?]+[[:space:]]*')) - 1 not between 3 and 5
    or lower(coalesce(d.draft_hook, '') || ' ' || coalesce(d.draft_long, ''))
      ~ '\m(discover|explore|unlock|curated|journey|amazing|tailored|personalized|vibrant|charming|hidden gem|must-see)\M'
    or lower(coalesce(d.draft_hook, '') || ' ' || coalesce(d.draft_long, ''))
      ~ '\m(you|your|yours)\M'
  );

update public.countries c
set enrichment_status = jsonb_set(
      coalesce(c.enrichment_status, '{}'::jsonb),
      '{editorial}',
      jsonb_build_object(
        'state', 'needs_regeneration',
        'reason', 'generated_output_validation_failed',
        'at', now()
      ),
      true
    ),
    updated_at = now()
where exists (
  select 1 from invalid_generated_country_drafts invalid where invalid.entity_id = c.id
);

update public.editorial_drafts prior
set reviewer_note = concat_ws(
      E'\n',
      prior.reviewer_note,
      'Automatically retired before review: generated output failed the country editorial style contract.',
      'Superseded pending revision preserved: ' || jsonb_build_object(
        'id', pending.id,
        'draft_hook', pending.draft_hook,
        'draft_long', pending.draft_long,
        'citations', pending.citations,
        'source_hash', pending.source_hash
      )::text
    ),
    reviewed_at = now()
from invalid_generated_country_drafts invalid
join public.editorial_drafts pending on pending.id = invalid.id
where prior.entity_type = 'country'
  and prior.entity_id = invalid.entity_id
  and prior.status = 'rejected';

delete from public.editorial_drafts pending
using invalid_generated_country_drafts invalid
where pending.id = invalid.id
  and exists (
    select 1
    from public.editorial_drafts prior
    where prior.entity_type = 'country'
      and prior.entity_id = invalid.entity_id
      and prior.status = 'rejected'
  );

update public.editorial_drafts d
set status = 'rejected',
    reviewer_note = concat_ws(
      E'\n',
      d.reviewer_note,
      'Automatically retired before review: generated output failed the country editorial style contract.'
    ),
    reviewed_at = now()
where exists (
  select 1 from invalid_generated_country_drafts invalid where invalid.id = d.id
);

commit;
