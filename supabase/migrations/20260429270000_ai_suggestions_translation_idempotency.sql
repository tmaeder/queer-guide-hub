-- ai_suggestions: translation-type idempotency
--
-- The translate-i18n-batch producer routes its output through ai_suggestions
-- (PR 7 of the search-intelligence cutover series). Re-running the producer
-- for the same (entity, locale, field) tuple must not create duplicate
-- non-terminal rows. This partial unique index enforces that — terminal-state
-- rows (applied, rejected, superseded, expired) are excluded so legitimate
-- re-translations remain possible later (e.g. when the source text changes).
--
-- Mirrors the pattern from 20260429260000_ai_suggestions_tag_idempotency.sql.
-- locale is part of the key because translations are per-locale; (field) is
-- read out of proposed_value→>'field' (one of 'name', 'title', 'description').

create unique index if not exists ai_suggestions_translation_idempotency_idx
  on public.ai_suggestions
     (entity_type, entity_id, locale, ((proposed_value->>'field')))
  where suggestion_type = 'translation' and status in ('pending','approved');

comment on index public.ai_suggestions_translation_idempotency_idx is
  'Prevents duplicate non-terminal translation suggestions for the same '
  '(entity, locale, field) tuple. Producers should select-first or upsert '
  'on this constraint.';
