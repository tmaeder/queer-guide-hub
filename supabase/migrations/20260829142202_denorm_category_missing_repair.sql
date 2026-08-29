-- `denorm_category_missing` went 0 -> 1 and hard-failed the tag-hygiene gate on
-- every PR, which deadlocked the deploy queue: the gate reads LIVE prod, so the
-- migration that repairs it could not itself be merged.
--
-- THE ROW. `lace` (77743f48-eab9-49d9-a49e-d8e99161cc9b) carries a PRIMARY
-- tag_category_assignments row naming "Expression & Style", created
-- 2026-08-29 14:00:04Z, while unified_tags.category_id stayed NULL. That is the
-- exact shape the baseline note names for doxy-pep and naloxone: a writer
-- inserted a junction row without letting the denorm follow. The junction is the
-- source of truth and category_id is derived from it, so this is a repair from
-- data the row already contains -- not a filing decision.
--
-- BOTH COLUMNS ARE NAMED ON PURPOSE. category_id is the single lever (the BEFORE
-- trigger sync_tag_category_assignment derives the text from it), but
-- trg_search_documents_tag is scoped to the TEXT column, and a column-scoped
-- trigger fires on the columns named in the STATEMENT, not on what a BEFORE
-- trigger mutated. Naming category_id alone would fix the page and leave the
-- search facet serving nothing.
--
-- SET-BASED, NOT PINNED TO ONE ID, AND THE ASSERTION IS NARROWER THAN THE
-- COUNTER. Sibling sessions are writing this table continuously, so a migration
-- asserting "exactly 1 row" would fail if the population moved between authoring
-- and apply. The postcondition therefore covers only what the UPDATE repairs --
-- rows with a PRIMARY junction and no category_id. A tag holding ONLY
-- non-primary junction rows would still count toward denorm_category_missing but
-- is deliberately out of scope: there is no primary to derive from, and guessing
-- one is a filing decision a migration must not make. An assertion ranging wider
-- than what the migration repairs is what took the queue down earlier today.
--
-- No begin;/commit; -- db push supplies the transaction, and an explicit COMMIT
-- closes it before the schema_migrations row is written (see 20261008110000).

do $mig$
declare
  v_fixed int;
  v_left  int;
begin
  perform set_config('app.actor', 'migration:denorm-category-missing-repair', true);

  update public.unified_tags u
     set category_id = a.category_id,
         category    = c.name,
         updated_at  = now()
    from public.tag_category_assignments a
    join public.tag_categories c on c.id = a.category_id
   where a.tag_id = u.id
     and a.is_primary
     and u.category_id is null;
  get diagnostics v_fixed = row_count;

  select count(*) into v_left
    from public.unified_tags u
   where u.category_id is null
     and exists (select 1
                   from public.tag_category_assignments a
                  where a.tag_id = u.id and a.is_primary);

  if v_left <> 0 then
    raise exception 'denorm_category_missing: % row(s) still have a primary junction and no category_id', v_left;
  end if;

  raise notice 'denorm_category_missing repair: % row(s) filled from their primary junction', v_fixed;
end
$mig$;