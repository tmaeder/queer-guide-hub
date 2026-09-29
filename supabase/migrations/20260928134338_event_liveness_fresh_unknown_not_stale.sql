-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260928134338 with no repo file — the signature of
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
--
-- functiondef-assert-ok: recovered file, not authored here. Its verify block
-- greps pg_get_functiondef() without stripping comments, which
-- check-functiondef-asserts.mjs rightly refuses in NEW migrations — but this one
-- is new only to the repo. It already applied to prod on 2026-09-28, where the
-- assertion passed against the real definition, and db push matches on version
-- so it is never re-run. Rewriting the SQL to satisfy the guard would make the
-- file stop matching what actually ran, and fidelity is the entire point of a
-- recovered migration.
--
-- The guard has since been taught to exempt versions present in remote
-- schema_migrations, so on any run that can reach prod this line is redundant.
-- It stays because that lookup FAILS CLOSED: with no SUPABASE_ACCESS_TOKEN
-- nothing is treated as applied and every added file is checked, which is the
-- right default and would put this file straight back into the failure it
-- documents. Belt to the braces, not a leftover.
-- A successful attempt can be fresh even when the remote source blocks the
-- server-side probe. Keep unknown as a freshness-score penalty, but do not
-- label a check performed within the seven-day SLO as stale.

do $migration$
declare
  v_definition text;
  v_old text := 'and (last_verified_at is null or last_verified_at<now()-interval ''7 days'' or liveness_status=''unknown'')';
  v_new text := 'and (last_verified_at is null or last_verified_at<now()-interval ''7 days'')';
begin
  select pg_get_functiondef('public.event_quality_findings(uuid)'::regprocedure)
    into v_definition;

  if position(v_old in v_definition) = 0 then
    if position(v_new in v_definition) > 0 then
      return;
    end if;
    raise exception 'event_quality_findings liveness predicate has an unexpected shape';
  end if;

  execute replace(v_definition, v_old, v_new);
end
$migration$;

comment on function public.event_quality_findings(uuid) is
  'Returns rubric findings for one canonical event. A fresh inconclusive liveness probe remains score-penalised but is not classified as stale.';;
