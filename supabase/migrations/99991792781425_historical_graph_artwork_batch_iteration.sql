-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991792781425 with no repo file — the signature of
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
-- Iterate the cheap ordered source cohort and stop after eligible events.
-- Filtering a PL/pgSQL contract before ORDER BY/LIMIT evaluates the full
-- historical cohort on every small repair tick. Explicit-ID scanner calls
-- retain their identity bounds and all ownership/source guards are unchanged.
do $iteration$
declare target regprocedure:='public.reconcile_historical_graph_artwork(integer,boolean,uuid[])'::regprocedure;
 src text;old_select text:=$old$  -- Protected low-ID records must not starve later repairs on each tick.
  and api_private.historical_graph_artwork_scope(evt.id)is not null
  order by evt.id limit greatest(0,least(coalesce(p_batch,500),1000))
 loop$old$;
begin
 src:=pg_get_functiondef(target);
 if (length(src)-length(replace(src,old_select,'')))/length(old_select)<>1 then
  raise exception 'Historical artwork batch anchor changed';end if;
 src:=replace(src,old_select,$new$  order by evt.id
 loop
  exit when examined>=greatest(0,least(coalesce(p_batch,500),1000));$new$);
 execute src;
end $iteration$;
