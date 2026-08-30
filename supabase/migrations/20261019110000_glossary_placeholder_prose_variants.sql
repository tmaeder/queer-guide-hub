-- The glossary hygiene wave (20261012090000) retracted placeholder prose by
-- matching ONE spelling per class. Both anchors were narrower than the corpus,
-- and the leftovers were invisible because `tag_hygiene_stats()`'s
-- `refusal_prose_active` key reuses the SAME two literals — the detector and
-- the repair share a blind spot, so nothing could ever report the residue.
--
-- Measured on prod 2026-08-29, exhaustively (grouped over every short value
-- matching /(no|not) .{0,25}(information|description|details|data)/ and every
-- long_description opening /^there (is|are) (no|not)/, not sampled):
--
-- C') short_description = 'No description available' — 3 rows, ALL ACTIVE.
--     The wave matched only 'no information available'. This one is
--     READER-FACING and was live: `search_documents_index_tags` indexes
--     `coalesce(short_description, description)`, so the three tags publish
--     "No description available" as their search-result description while
--     their own /tags/:slug page renders real prose from `description`.
--     Verified against the production search proxy — a query for "intellectual
--     sadist" returns that tag reading "No description available" between
--     siblings that read "Individuals who derive pleasure from intellectual
--     challenges". Nulling the column makes the indexer coalesce to the real
--     description; `trg_search_documents_tag` is scoped to short_description,
--     so the fix reaches search through `search_reindex_queue` on its own.
--     Exactly 3 rows, one spelling — there is no third variant to chase.
--
-- D') long_description opening "There is no available information …" — 47 rows,
--     NONE active. The wave anchored on "There is no information available",
--     which is a different word order, so this whole family survived. Same LLM
--     refusal essay ("…we cannot provide a detailed description. If you have
--     any information or context…"), published as the definition of the term.
--     Cleared at any status for the reason the wave gave for its own class C:
--     a deprecated row revived later must not resurrect the stamp with it.
--     long_description is NOT in the search trigger's column list and these
--     rows are deprecated, so this half causes no search churn.
--
--     All 47 were read before being cleared, not sampled: 37 carry an explicit
--     refusal marker ("cannot provide", "not a recognized term", "if you have
--     any…") and the remaining 10 were read by hand. Every one is a refusal.
--     The only row containing a true statement is `demerol` ("Demerol is a
--     brand name for the opioid pain medication meperidine") — but it is a
--     parenthesis inside an essay that then declines to describe the tag, so
--     it is not a definition and it goes with the rest. Losing it costs
--     nothing: the fill paths re-enter the row as empty and can write a real
--     definition, which a refusal essay in the column actively prevents.
--
-- Retraction only ever REMOVES. Nothing is rewritten and no prose is invented;
-- the fill paths re-enter these rows as genuinely empty, which is what
-- `indexable_without_description` and `run_tag_thin_page_reindex()` can see and
-- a stamp is precisely what hides from them.
--
-- `app.actor` is required: all 3 class-C' rows are human_reviewed, and
-- log_unified_tag_change() RAISEs on an undeclared system actor
-- (precedent 20261012090000, which needed the same declaration).

select set_config('app.actor', 'admin:glossary-placeholder-variants-20260829', true);

-- C') the short_description stamp the wave's exact match missed. Any status:
--     the wave cleared its own spelling at any status for this same reason.
update public.unified_tags
set short_description = null
where short_description is not null
  and lower(btrim(short_description)) = 'no description available';

-- D') the refusal-essay word order the wave's anchor missed.
update public.unified_tags
set long_description = null
where long_description is not null
  and btrim(long_description) ~* '^there is no available information';
