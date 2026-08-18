-- tag_sources: anon reads curated legal citations ONLY, and cannot write.
--
-- Run inside a transaction that is rolled back:
--   psql "$DATABASE_URL" -f supabase/migrations/__tests__/tag_sources_public_read.sql
--
-- Two things are being proven, and the second is the one that bites.
--
-- 1. READ SCOPE. `tag_sources` holds ~8,710 rows of a 2026-04-27
--    wikipedia/wikidata backfill alongside ~10 curated citations. Only the
--    curated ones may reach anon. A regression here is invisible on the page —
--    the extra rows are filtered client-side by `.eq('is_public', true)` — so
--    nothing would look broken while the table was fully readable.
--
-- 2. WRITE GRANTS. Before 20260906100000 the grants were exactly inverted:
--    anon held DELETE/INSERT/UPDATE/TRUNCATE/REFERENCES/TRIGGER and NOT SELECT.
--    That was inert only because no write policy existed, and the same migration
--    adds write policies for the admin editor. If someone re-runs an old grant
--    or a future migration re-broadens it, this is what catches it.
--
-- NOTE: `set local role anon` alone is not enough. unified_tags' read policy
-- calls auth.role(), which reads request.jwt.claims — with no claims set it
-- returns NULL, the EXISTS in the policy fails, and the test reports 0 visible
-- rows for the wrong reason. The claims line below is load-bearing.

begin;

-- A citation on a live, non-sensitive tag: the row anon SHOULD see.
insert into public.tag_sources
  (tag_id, source_type, source_url, official_title, jurisdiction, is_public)
select id, 'statute', 'https://example.test/tag-sources-rls-probe',
       'Test Act 1999', 'UG', true
  from public.unified_tags
 where slug = 'uganda-anti-homosexuality-act';

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare v_visible int; v_backfill int;
begin
  select count(*), count(*) filter (where source_type in ('wikipedia', 'wikidata'))
    into v_visible, v_backfill
    from public.tag_sources;

  if v_backfill > 0 then
    raise exception 'anon can see % wikipedia/wikidata backfill row(s)', v_backfill;
  end if;
  if v_visible < 1 then
    raise exception 'anon cannot see the curated citation (is_public read policy broken)';
  end if;
  if exists (select 1 from public.tag_sources where not is_public) then
    raise exception 'anon can see a non-public tag_sources row';
  end if;
  raise notice 'anon SELECT scoped correctly: % public row(s), 0 backfill', v_visible;
end $$;

do $$
declare ok_i bool := false; ok_u bool := false; ok_d bool := false;
begin
  begin
    insert into public.tag_sources (tag_id, source_type) values (gen_random_uuid(), 'manual');
  exception when others then ok_i := true; end;
  begin
    update public.tag_sources set claim_summary = 'pwned';
  exception when others then ok_u := true; end;
  begin
    delete from public.tag_sources;
  exception when others then ok_d := true; end;

  if not (ok_i and ok_u and ok_d) then
    raise exception 'anon write NOT blocked — insert_blocked=% update_blocked=% delete_blocked=%',
      ok_i, ok_u, ok_d;
  end if;
  raise notice 'anon INSERT/UPDATE/DELETE all rejected';
end $$;

rollback;
