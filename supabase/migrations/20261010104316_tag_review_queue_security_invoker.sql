-- `tag_review_queue` was the only compat view over `entity_review_queue` left
-- SECURITY DEFINER, so it served review-queue rows to EVERY signed-in member
-- while the base table's `erq_read` policy admits admin/moderator only.
--
-- NOT A DESIGN DECISION — AN OVERSIGHT, and the view's own siblings are the
-- evidence. `20260801130000` created all five of the others with an explicit
-- `WITH (security_invoker = true)`; `99991791617122` added this one with a bare
-- `create or replace view` and granted `select` to `authenticated`, which in
-- that shape bypasses RLS instead of applying it. Its own comment calls it a
-- "Compat view over entity_review_queue", i.e. the same thing as the five that
-- do apply RLS.
--
-- Measured before touching it: the view holds 0 rows, `entity_review_queue`
-- holds 0 `entity_type='tag'` rows, and NO code in src/, supabase/functions/ or
-- functions/ reads it — so the grant serves nobody today and the flip has no
-- blast radius. It is also reversible in one statement.
--
-- OPTION 2 OF THE GATE'S OWN LADDER, not option 1. Revoking the grant would
-- also clear the finding, but the five siblings keep their `authenticated`
-- grant precisely because `security_invoker` makes RLS decide — and this view
-- exists to be read through PostgREST by a reviewer. Matching the siblings
-- keeps one pattern rather than inventing a sixth.
--
-- `alter view ... set` and not `create or replace view`: it cannot alter the
-- definition, so the column list and the `entity_type` default both survive
-- untouched. The verify block proves that rather than assuming it.
--
-- Writes are unaffected: `tag-imagery` inserts as `service_role`, which carries
-- `rolbypassrls`, and the SQL writers are SECURITY DEFINER owned by postgres.
--
-- APPLIED LIVE, THEN COMMITTED AT THE VERSION PROD STAMPED. The gate reads the
-- LIVE database, so a PR carrying only this file can never turn its own check
-- green: the finding stands until the migration applies, which happens on
-- merge, which the gate blocks. That is the deadlock `51500101145000` records,
-- and this is its recorded resolution.

alter view public.tag_review_queue set (security_invoker = true);

do $verify$
declare v_mode text; v_cols int; v_leaks int; v_write int; v_default text;
begin
  -- P1. The flip took.
  select coalesce((select split_part(o, '=', 2) from unnest(c.reloptions) o
                    where o like 'security_invoker=%'), 'unset')
    into v_mode
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'tag_review_queue';
  if v_mode <> 'true' then
    raise exception 'P1: security_invoker is %, expected true', v_mode;
  end if;

  -- P2. The definition survived: columns intact, the view still resolves, and
  -- the `entity_type` default 99991791617122 set is still there — without it
  -- every insert through the view would fail the base table's NOT NULL.
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
  -- reports 1, which is exactly how a "fix" ends up chasing the wrong views.
  select count(*) into v_leaks from public.definer_view_api_read_grants();
  select count(*) into v_write from public.definer_view_api_write_grants();
  if v_leaks <> 0 then
    raise exception 'P3: the gate still reports % readable definer view(s)', v_leaks;
  end if;
  if v_write <> 0 then
    raise exception 'P3: the gate reports % writable definer view(s)', v_write;
  end if;

  -- P4. A one-view fix: the five siblings must still be invoker. "The gate is
  -- clean" is equally satisfied by a sweep that flipped something it should not.
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
