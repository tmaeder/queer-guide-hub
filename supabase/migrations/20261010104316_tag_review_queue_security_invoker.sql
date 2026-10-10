-- `tag_review_queue` was the only compat view over `entity_review_queue` left
-- SECURITY DEFINER, so it served review-queue rows to EVERY signed-in member
-- while the base table's `erq_read` policy admits admin/moderator only.
--
-- NOT A DESIGN DECISION — AN OVERSIGHT, and the file that added it says so
-- itself. `99991791617122`'s own comment calls this view "shaped exactly like
-- the five existing compat views", and all five of those were created by
-- `20260801130000` with an explicit `WITH (security_invoker = true)`. This one
-- used a bare `create or replace view` and then granted `select` to
-- `authenticated`, which in that shape BYPASSES RLS instead of applying it.
--
-- Measured before touching it: the view held 0 rows, `entity_review_queue` held
-- 0 `entity_type='tag'` rows, and NO code in src/, supabase/functions/ or
-- functions/ reads it — so the grant served nobody and the flip has no blast
-- radius. Reversible in one statement.
--
-- OPTION 2 OF THE GATE'S OWN LADDER, not option 1. Revoking the grant would
-- also clear the finding, but the five siblings keep their `authenticated`
-- grant precisely because `security_invoker` makes RLS decide — and this view
-- exists to be read through PostgREST by a reviewer. Matching the siblings
-- keeps one pattern rather than inventing a sixth.
--
-- Writes are unaffected: `tag-imagery` inserts as `service_role`, which carries
-- `rolbypassrls`.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHY THIS FILE'S VERSION SORTS SO LOW, AND WHY IT IS GUARDED
--
-- `check-definer-view-grants.mjs` reads the LIVE database, so a PR carrying
-- only a fix can never turn its own check green: the finding stands until the
-- migration applies, which happens on merge, which the gate blocks. That is the
-- deadlock `51500101145000` records. Its recorded resolution is to apply live
-- and commit the file at the version prod stamped — `20261010104316`, read back
-- BY NAME from `schema_migrations` rather than from the head of a descending
-- list. Do NOT renumber it: `check-migration-versions.mjs` exempts a version
-- already in history (`db push` SKIPS an applied migration rather than aborting
-- on it), and renaming it would break the file↔history match permanently.
--
-- THE CONSEQUENCE IS THAT ON A REBUILD-FROM-ZERO THIS FILE RUNS BEFORE THE VIEW
-- EXISTS — `99991791617122` sorts far above it — so a bare `alter view` here
-- would abort the whole replay with 42P01. Hence the existence guard. On prod it
-- does the work; on a rebuild it no-ops and says so, and the `security_invoker`
-- now written into `99991791617122` itself is what makes the rebuilt view
-- correct. Idempotent in both directions.

do $fix$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'tag_review_queue' and c.relkind = 'v'
  ) then
    alter view public.tag_review_queue set (security_invoker = true);
    raise notice 'tag_review_queue flipped to security_invoker';
  else
    raise notice
      'tag_review_queue does not exist yet — rebuild-from-zero, where 99991791617122 sorts later and now creates it invoker itself; nothing to do';
  end if;
end $fix$;

do $verify$
declare v_mode text; v_cols int; v_leaks int; v_write int; v_default text;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'tag_review_queue' and c.relkind = 'v'
  ) then
    -- Nothing to assert on a replay that has not reached the view yet. Stated
    -- rather than silently skipped, so a reader can tell this branch apart from
    -- a check that found nothing wrong.
    raise notice 'verify skipped: tag_review_queue not created yet in this replay';
    return;
  end if;

  -- P1. The flip took.
  select coalesce((select split_part(o, '=', 2) from unnest(c.reloptions) o
                    where o like 'security_invoker=%'), 'unset')
    into v_mode
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'tag_review_queue';
  if v_mode <> 'true' then
    raise exception 'P1: security_invoker is %, expected true', v_mode;
  end if;

  -- P2. The definition survived. `alter view ... set` cannot alter it, and this
  -- proves that rather than assuming it — including the `entity_type` default
  -- 99991791617122 set, without which every insert through the view would fail
  -- the base table's NOT NULL.
  select count(*) into v_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'tag_review_queue';
  if v_cols < 5 then raise exception 'P2: only % columns survive', v_cols; end if;
  perform * from public.tag_review_queue limit 1;

  select pg_get_expr(ad.adbin, ad.adrelid) into v_default
    from pg_attrdef ad
    join pg_class c on c.oid = ad.adrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = ad.adnum
   where n.nspname = 'public' and c.relname = 'tag_review_queue'
     and a.attname = 'entity_type';
  if v_default is null or position('tag' in v_default) = 0 then
    raise exception 'P2: the entity_type default is now %', coalesce(v_default, 'NULL');
  end if;

  -- P3. THE GATE'S OWN FUNCTIONS, never a restatement of their predicate. A
  -- hand-rolled version of this same question reported 15 leaks where the gate
  -- reports 1 — which is exactly how a "fix" ends up chasing the wrong views.
  -- Guarded on their existence so this file does not depend on deploy order.
  if to_regprocedure('public.definer_view_api_read_grants()') is not null then
    select count(*) into v_leaks from public.definer_view_api_read_grants();
    if v_leaks <> 0 then
      raise exception 'P3: the gate still reports % readable definer view(s)', v_leaks;
    end if;
  end if;
  if to_regprocedure('public.definer_view_api_write_grants()') is not null then
    select count(*) into v_write from public.definer_view_api_write_grants();
    if v_write <> 0 then
      raise exception 'P3: the gate reports % writable definer view(s)', v_write;
    end if;
  end if;

  -- P4. A ONE-VIEW FIX. "The gate is clean" is equally satisfied by a sweep that
  -- flipped something it should not have, so the five siblings are asserted to
  -- still be invoker — by COUNT, because asserting one of them is satisfied by
  -- the four that were never touched.
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'
         and c.relname in ('city_review_queue', 'venue_review_queue', 'village_review_queue',
                           'personality_review_queue', 'marketplace_review_queue')
         and coalesce((select split_part(o, '=', 2) = 'true' from unnest(c.reloptions) o
                        where o like 'security_invoker=%'), false)) <> 5 then
    raise exception 'P4: a sibling compat view lost security_invoker';
  end if;

  raise notice 'tag_review_queue is security_invoker; gate reports 0 read and 0 write leaks';
end $verify$;
