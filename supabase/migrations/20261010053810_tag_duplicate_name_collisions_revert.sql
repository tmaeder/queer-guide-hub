-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261010053810 with no repo file — the signature of
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
select set_config('app.actor', 'admin:tag-duplicate-collision-revert', true);

with active as (
  select * from public.unified_tags
   where status = 'active' and merged_into_id is null and deprecated_at is null
), dup as (
  select lower(btrim(name)) as k, entity_kind from active
   group by lower(btrim(name)), entity_kind having count(*) > 1
), involved as (
  select a.id from active a
    join dup d on d.k = lower(btrim(a.name)) and d.entity_kind = a.entity_kind
), revert as (
  select distinct on (l.tag_id) l.tag_id, l.before_data->>'name' as old_name
    from public.tag_change_log l join involved i on i.id = l.tag_id
   where l.created_at > '2026-10-10T04:50:00Z'
     and l.actor in ('admin:tags-english-label-repair', 'admin:tags-full-language-audit')
     and l.before_data->>'name' is distinct from l.after_data->>'name'
     and coalesce(btrim(l.before_data->>'name'), '') <> ''
   order by l.tag_id, l.created_at desc
)
update public.unified_tags u set name = r.old_name
  from revert r where u.id = r.tag_id and u.name is distinct from r.old_name;

do $verify$
declare v_dup int; v_total int;
begin
  v_dup := (public.tag_hygiene_stats() ->> 'duplicate_active_name')::int;
  if v_dup <> 0 then raise exception 'P1 failed: duplicate_active_name is %, expected 0', v_dup; end if;
  select count(*) into v_total from public.unified_tags
   where status='active' and merged_into_id is null and deprecated_at is null;
  if v_total < 1000 then raise exception 'P2 failed: only % active tags', v_total; end if;
  raise notice 'duplicate_active_name = 0 over % active tags', v_total;
end
$verify$;;
