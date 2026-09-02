-- 41 Swiss cities are stamped with a migration version that does not exist.
--
-- WHAT HAPPENED. `20261116110000_swiss_canton_repair.sql` was authored as
-- `20261110110000` and re-stamped upward when two sibling migrations landed on
-- production mid-review and left it sorting below remote max. The rename was
-- done with `git mv` (which STAGES) and the three internal `migration:<version>`
-- strings were then rewritten with `sed` (which does not). `git commit` without
-- `-a` committed the staged rename and dropped the unstaged body edit, so the
-- file went to production named 20261116110000 while writing 20261110110000
-- into every row it touched.
--
-- WHY IT MATTERS ENOUGH TO FIX. The repair itself is correct and is not touched
-- here: Zug is in canton Zug, its coordinate is right, 0 Swiss cities carry a
-- wrong canton and 0 carry a resolvable-but-missing one. What is wrong is the
-- audit trail. `field_provenance.<field>.by` is how anyone later asks "which
-- migration decided this, and on what evidence" -- the same question the wrong-
-- country safety notes and the wrong-QID city rows both turned on. A stamp
-- pointing at a version that appears in neither `schema_migrations` nor the
-- repo answers that question with a dead end, and a dead end reads as "nobody
-- knows" rather than "look here".
--
-- SCOPE IS THE STAMP, NOT THE VALUE. Only the `by` key moves. region_name,
-- latitude, and every other column keep the values the repair computed, so this
-- cannot alter what the canton audit measures. It is deliberately keyed on the
-- exact bad string rather than on "Swiss cities", so re-running is a no-op and a
-- row some other writer has since re-stamped is left alone.
--
-- 41 rows, so no batching: the `cities` write reaches search through
-- trg_sync_geo_spine -> geo_places -> search_reindex_queue at roughly 2.6 ms a
-- row, and the 300-row cap that discipline exists for is two orders away.

do $$
declare
  v_bad  text := 'migration:20261110110000';
  v_good text := 'migration:20261116110000';
  v_n    integer;
begin
  -- The file that carried the bad string is `20261116110000`, and it is applied.
  -- If it is missing, this migration is running somewhere that never had the
  -- repair and there is nothing to correct -- say so rather than write blind.
  if not exists (select 1 from supabase_migrations.schema_migrations
                  where version = '20261116110000') then
    raise notice 'canton repair 20261116110000 not applied here; nothing to re-stamp';
    return;
  end if;

  update public.cities c
     set field_provenance = c.field_provenance
           || case when c.field_provenance->'region_name'->>'by' = v_bad
                   then jsonb_build_object('region_name',
                          (c.field_provenance->'region_name') || jsonb_build_object('by', v_good))
                   else '{}'::jsonb end
           || case when c.field_provenance->'latitude'->>'by' = v_bad
                   then jsonb_build_object('latitude',
                          (c.field_provenance->'latitude') || jsonb_build_object('by', v_good))
                   else '{}'::jsonb end,
         updated_at = now()
   where c.field_provenance->'region_name'->>'by' = v_bad
      or c.field_provenance->'latitude'->>'by' = v_bad;
  get diagnostics v_n = row_count;
  raise notice 're-stamped % rows', v_n;

  -- Zero rows anywhere may still carry the dead version.
  if exists (select 1 from public.cities c
              where c.field_provenance->'region_name'->>'by' = v_bad
                 or c.field_provenance->'latitude'->>'by' = v_bad) then
    raise exception 'rows still carry %', v_bad;
  end if;

  -- And the repair's own findings must be untouched: Zug still in canton Zug.
  if (select region_name from public.cities where wikidata_qid = 'Q68144') is distinct from 'Zug' then
    raise exception 'Zug canton changed while re-stamping provenance';
  end if;
end $$;
