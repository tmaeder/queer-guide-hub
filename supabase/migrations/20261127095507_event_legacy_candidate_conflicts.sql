-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127095507 with no repo file — the signature of
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
-- The old title/day arm must not refill the inbox with different cities/showtimes.
-- Apply the same explicit conflict veto already used by incoming identity matching.
do $$
declare def text; old text := 'legacy where not exists ('; replacement text :=
  'legacy where not api_private.event_identity_conflicts(api_private.event_identity_document(legacy.a_id),api_private.event_identity_document(legacy.b_id)) and not exists (';
begin
  def:=pg_get_functiondef('api_private.run_dedup_truth_sweep(text,text,integer)'::regprocedure);
  if strpos(def,replacement)>0 then return; end if;
  if strpos(def,old)=0 then raise exception 'Expected legacy event wrapper is missing'; end if;
  execute replace(def,old,replacement);
end $$;
;
