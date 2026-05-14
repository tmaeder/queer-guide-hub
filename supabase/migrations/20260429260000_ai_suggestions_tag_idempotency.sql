-- ai_suggestions: tag-type idempotency
--
-- The auto-tag-content producer (and any future tag producer) routes its
-- output through ai_suggestions. Re-running the producer for the same item
-- must not create duplicate non-terminal rows for the same (entity, tag)
-- pair. This partial unique index enforces that — terminal-state rows
-- (applied, rejected, superseded, expired) are excluded so legitimate
-- re-suggestions remain possible later.

create unique index if not exists ai_suggestions_tag_idempotency_idx
  on public.ai_suggestions (entity_type, entity_id, ((proposed_value->>'tag_id')))
  where suggestion_type = 'tag' and status in ('pending','approved');

comment on index public.ai_suggestions_tag_idempotency_idx is
  'Prevents duplicate non-terminal tag suggestions for the same (entity, tag) pair. '
  'Producers should select-first or upsert on this constraint.';
