-- NEUTRALISED 2026-09-03, together with 20261211100000. See that file's header
-- for the full reasoning; this one is emptied for the same reason and in the
-- same commit.
--
-- WHAT IT USED TO DO. Create the 135 INFERRED Kinktionary terms — the tranche
-- whose definitions are reasoned from the term name rather than documented —
-- filed `editorial:inferred-from-name` and hedged in their own prose so a reader
-- can tell a guess from a citation.
--
-- WHY IT GOES WITH ITS SIBLING RATHER THAN SEPARATELY. It carries the identical
-- `revive them instead of creating duplicates` guard, so it would abort the
-- queue the same way as soon as the sourced one stopped doing it first. It also
-- references the sourced migration four times: the two are one import split by
-- provenance, not two independent changes. Neutralising one and leaving the
-- other would half-apply a vocabulary import, which is worse than either state.
--
-- The 296 definitions remain in
-- `scripts/data-quality/kinktionary-new-term-definitions.mjs`; the original SQL
-- is in git at commit 218056281. Re-land both together, at new versions, after
-- reconciling the guard against the 62 slugs that already exist.

do $$
begin
  raise notice 'kinktionary_new_terms_inferred: neutralised — see 20261211100000 header';
end
$$;
