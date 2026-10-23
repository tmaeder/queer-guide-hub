-- tag_category_assignments: writes are staff-only.
--
-- Until this migration the table carried three write policies whose only test
-- was `(select auth.uid()) is not null`, granted to `public`. Any signed-in
-- member could therefore INSERT, UPDATE or DELETE a glossary filing over plain
-- PostgREST. That is not a cosmetic hole:
--
--   * the AFTER trigger `unified_tags_recompute_is_adult` re-derives
--     `unified_tags.is_adult` from these memberships, so deleting a tag's
--     adult-category row DROPS ITS 18+ AGE GATE;
--   * `/tags/:slug` renders the primary junction row and `/tags` filtering
--     (src/pages/TagsIndex.tsx) matches every membership, so inserting or
--     flipping rows re-files any glossary page.
--
-- No legitimate non-staff path writes this table (checked 2026-10-23):
--   * src/ only READS it (useCentralizedTags, usePageFetchers);
--   * the edge writers (categorize-tags, bulk-create-ai-tags,
--     _shared/ai-suggestions via search-intelligence / translate-i18n-batch)
--     all use getServiceClient(), i.e. service_role, which bypasses RLS;
--   * every SQL writer is SECURITY DEFINER (sync_tag_category_assignment_after,
--     merge_tag_concept, unmerge_tag_concept, add_/remove_tag_from_category,
--     merge_tag, fix_missing_junction_entries) and runs as the owner;
--   * admin re-filing goes through `unified_tags.category_id`, whose AFTER
--     trigger writes this table as the definer, so it is unaffected.
--
-- Role set is admin + moderator, the same floor as the taxonomy table it
-- joins to (`tag_categories.taxonomy_write_floor`). Editors keep re-filing
-- through `unified_tags.category_id` (unified_tags_staff_update admits them);
-- they lose only the direct junction write, which no client code performs.
--
-- Anon's INSERT/UPDATE/DELETE table grants are revoked as well: RLS already
-- refused them, but an anon key has no reason to hold a write privilege here.

drop policy if exists "Authenticated users can delete tag category assignments" on public.tag_category_assignments;
drop policy if exists "Authenticated users can insert tag category assignments" on public.tag_category_assignments;
drop policy if exists "Authenticated users can update tag category assignments" on public.tag_category_assignments;
drop policy if exists tag_category_assignments_staff_insert on public.tag_category_assignments;
drop policy if exists tag_category_assignments_staff_update on public.tag_category_assignments;
drop policy if exists tag_category_assignments_staff_delete on public.tag_category_assignments;

create policy tag_category_assignments_staff_insert
  on public.tag_category_assignments
  for insert to authenticated
  with check (api_private.has_any_role_jwt(array['admin', 'moderator']::app_role[]));

create policy tag_category_assignments_staff_update
  on public.tag_category_assignments
  for update to authenticated
  using (api_private.has_any_role_jwt(array['admin', 'moderator']::app_role[]))
  with check (api_private.has_any_role_jwt(array['admin', 'moderator']::app_role[]));

create policy tag_category_assignments_staff_delete
  on public.tag_category_assignments
  for delete to authenticated
  using (api_private.has_any_role_jwt(array['admin', 'moderator']::app_role[]));

revoke insert, update, delete on public.tag_category_assignments from anon;

-- Postconditions. Behavioural, not textual: a policy predicate can read as
-- staff-gated and still be satisfiable, so the check impersonates a plain
-- member and an admin and performs the writes. Every probe runs inside a
-- block that ends in a RAISE, so whatever it wrote is rolled back.
do $verify$
declare
  v_row   record;
  v_cat   uuid;
  v_n     int;
  v_state text;
  v_seen  int;
begin
  -- P1: catalog. Every write policy must call a role helper, and none may be
  -- the old bare uid test.
  select count(*) into v_n
    from pg_policies
   where schemaname = 'public' and tablename = 'tag_category_assignments'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     and coalesce(qual, '') || coalesce(with_check, '') !~ 'has_(any_)?role';
  if v_n <> 0 then
    raise exception 'P1 failed: % write policy(ies) on tag_category_assignments are not role-gated', v_n;
  end if;

  select count(*) into v_n
    from pg_policies
   where schemaname = 'public' and tablename = 'tag_category_assignments'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  if v_n <> 3 then
    raise exception 'P1b failed: expected exactly 3 write policies, found %', v_n;
  end if;

  -- Fixture: an existing row (UPDATE/DELETE target) and a category the tag
  -- is NOT yet in (INSERT target).
  select tca.tag_id, tca.category_id into v_row
    from public.tag_category_assignments tca limit 1;
  if v_row.tag_id is null then
    raise exception 'P2 precondition: table is empty, the probe would prove nothing';
  end if;
  select c.id into v_cat from public.tag_categories c
   where not exists (select 1 from public.tag_category_assignments x
                      where x.tag_id = v_row.tag_id and x.category_id = c.id)
   limit 1;

  -- P2: a plain member (random sub, no user_roles row, no user_role claim).
  v_seen := 0;
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    if v_cat is not null then
      begin
        insert into public.tag_category_assignments (tag_id, category_id, is_primary)
        values (v_row.tag_id, v_cat, false);
        raise exception 'P2 failed: plain member INSERT was accepted';
      exception when insufficient_privilege then
        v_seen := v_seen + 1;
      end;
    end if;

    update public.tag_category_assignments set is_primary = is_primary
     where tag_id = v_row.tag_id and category_id = v_row.category_id;
    get diagnostics v_n = row_count;
    if v_n <> 0 then
      raise exception 'P2 failed: plain member UPDATE touched % row(s)', v_n;
    end if;

    delete from public.tag_category_assignments
     where tag_id = v_row.tag_id and category_id = v_row.category_id;
    get diagnostics v_n = row_count;
    if v_n <> 0 then
      raise exception 'P2 failed: plain member DELETE removed % row(s)', v_n;
    end if;

    raise exception using errcode = 'P0001', message = 'p2_probe_done:' || v_seen;
  exception when raise_exception then
    get stacked diagnostics v_state = message_text;
    if v_state not like 'p2_probe_done:%' then
      raise;
    end if;
  end;

  -- P3: positive control. An admin claim must still be able to write, or the
  -- P2 refusals could be a broken table rather than a working gate.
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', gen_random_uuid(), 'role', 'authenticated',
                        'user_role', 'admin')::text, true);
    execute 'set local role authenticated';

    update public.tag_category_assignments set is_primary = is_primary
     where tag_id = v_row.tag_id and category_id = v_row.category_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'P3 failed: admin UPDATE touched % row(s), expected 1', v_n;
    end if;

    raise exception using errcode = 'P0001', message = 'p3_probe_done';
  exception when raise_exception then
    get stacked diagnostics v_state = message_text;
    if v_state <> 'p3_probe_done' then
      raise;
    end if;
  end;

  -- P4: anon holds no write privilege.
  if has_table_privilege('anon', 'public.tag_category_assignments', 'INSERT')
     or has_table_privilege('anon', 'public.tag_category_assignments', 'UPDATE')
     or has_table_privilege('anon', 'public.tag_category_assignments', 'DELETE') then
    raise exception 'P4 failed: anon still holds a write grant on tag_category_assignments';
  end if;

  -- Reads stay public.
  if not has_table_privilege('anon', 'public.tag_category_assignments', 'SELECT') then
    raise exception 'P5 failed: anon lost SELECT on tag_category_assignments';
  end if;
end
$verify$;
