-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260920180346 with no repo file — the signature of
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
create or replace function public.tag_category_demote_incoming_primary()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tag_id is distinct from old.tag_id
     and new.is_primary
     and exists (
       select 1
       from public.tag_category_assignments a
       where a.tag_id = new.tag_id
         and a.is_primary
         and a.id <> old.id
     ) then
    new.is_primary := false;
  end if;
  return new;
end;
$$;

drop trigger if exists tag_category_demote_incoming_primary
  on public.tag_category_assignments;
create trigger tag_category_demote_incoming_primary
before update of tag_id on public.tag_category_assignments
for each row
execute function public.tag_category_demote_incoming_primary();

comment on function public.tag_category_demote_incoming_primary() is
  'Keeps tag merges from violating the one-primary-category-per-tag invariant: an incoming primary becomes secondary when the target tag already has a primary.';;
