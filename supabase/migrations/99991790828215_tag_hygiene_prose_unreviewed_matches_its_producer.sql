-- `prose_unreviewed` was scoped NARROWER than the producer it gauges, so it
-- reads 0 while 4,056 rows sit in that producer's queue.
--
-- The counter is the drain gauge for `tag-enrichment-sweep mode='prose'`
-- (cron `tag_prose_pass`, `33 3 * * *`). Its own baseline note states the
-- contract: "a flat high number means the cron stopped."
--
-- IT CAN NO LONGER SAY THAT. `99991789930597` narrowed it to
-- `publication_role = 'article'`. Measured on prod 2026-09-30:
--
--     publication_role   active   indexable   in_search   unstamped prose
--     article             1,632       1,197       1,195                 0
--     utility             6,667           0           0             3,990
--     entity_redirect       171           0           0                66
--
-- All 1,632 article rows are stamped, so the counter reads 0 — and will keep
-- reading 0 WHETHER OR NOT THE CRON RUNS. It is a dead gauge, not a lagging
-- one: there is no corpus state that can make it non-zero.
--
-- THE PRODUCER IS NOT ROLE-SCOPED. `tag-enrichment-sweep/index.ts:447`:
--
--     .eq('status', 'active')
--     .not('description', 'is', null)
--     .order('prose_reviewed_at', { ascending: true, nullsFirst: true })
--
-- No `publication_role` filter. It walks all 8,470 active prose-bearing rows
-- and stamps the cursor on every visit, so its real queue is 4,056 and the
-- gauge says 0. A gauge scoped narrower than its producer cannot report that
-- producer stopping.
--
-- DECIDED ON THE STAMP TIMESTAMPS, NOT THE COUNTS. A concurrent session reached
-- the OPPOSITE conclusion from the same counts -- it diagnosed the scoping
-- correctly and then ran `--update`, baselining this counter at 0 with the note
-- "within that cohort nothing is unreviewed". That is true, and it says nothing
-- about cron health. What separates the two readings is WHEN each cohort was
-- last stamped:
--
--     role              newest prose_reviewed_at   last 48h   last 7d
--     utility           2026-10-01 03:35                 13        63
--     article           2026-09-20 18:22                  0         0
--     entity_redirect   2026-09-20 18:24                  0         0
--
-- `33 3 * * *` ran last night and every stamp it has written in eleven days is
-- on a `utility` row. The sweep is alive and working EXCLUSIVELY on the cohort
-- an article-scoped counter cannot see; `article` was finished on 09-20 and
-- nothing returns to it. So at 0 the counter reads 0 permanently whether or not
-- the cron runs, which is precisely what its own note forbids. At ~9 stamps/day
-- the 3,990 need ~443 days, so expect a slow fall and read a FLAT 4,056 as the
-- sweep having stopped.
--
-- This migration therefore composes with that re-baseline rather than reverting
-- it: all nine of its other tightenings are kept, and only `prose_unreviewed`
-- moves 0 -> 4,056, with both notes folded together.
--
-- NOT MERELY COSMETIC: 975 of the 4,056 are reader-reachable. `fetchTagPreviews`
-- (`src/hooks/useTagPreviews.ts:36`) filters `status = 'active'` and NOTHING
-- else — no role, no `seo_indexable` — so utility prose surfaces in the
-- hover/definition card. 131 of them are at usage >= 100, max 20,353.
--
-- ONLY THIS ONE ARM CHANGES. The other two role-scoped counters were measured
-- and their scoping is CORRECT, so widening them would manufacture work:
--
--   uncategorized_active           458 uncategorized utility rows, but they
--                                  render no page and are not in search, so a
--                                  missing category has no reader consequence.
--   sensitive_without_description   71 sensitive/adult utility rows with no
--                                  description — again no page, no search, so
--                                  the harm it watches (a sensitive page
--                                  published with no explanation) cannot occur.
--
-- `indexable_without_description` was never role-scoped and needs nothing:
-- 0 non-article rows are `seo_indexable`, so scoped and unscoped agree.
-- Live `publication_role = 'article'` arm count is 3, not the 4 named in
-- CLAUDE.md; it goes to 2 here.
--
-- PATCHED VIA pg_get_functiondef(), NEVER RESTATED. This is the rule
-- `99991790719601` established and the single most important line here. The
-- live body is not what any repo file says: `99991789930597` narrowed these
-- counters and added `entity_kind` to `duplicate_active_name`'s grouping key by
-- string surgery, and `99991790719601` added the shared `ut` CTE plus
-- `SET work_mem`. A `create or replace` assembled from any repo file silently
-- reverts whichever of those it does not happen to contain. A one-arm patch
-- cannot.
--
-- SOFT ON PRECONDITIONS: a second apply, or a corpus where the arm has already
-- been widened, is a no-op NOTICE rather than an abort — `db push` stops the
-- whole repo on one failing file.

do $patch$
declare
  src text;
  newsrc text;
  n int;
  old_arm constant text :=
    'where publication_role = ''article'' and description is not null and prose_reviewed_at is null)';
  new_arm constant text :=
    'where description is not null and prose_reviewed_at is null)';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'tag_hygiene_stats';

  if src is null then
    raise exception 'public.tag_hygiene_stats() does not exist';
  end if;

  if position(old_arm in src) = 0 then
    if position(new_arm in src) > 0 then
      raise notice 'prose_unreviewed is already unscoped; nothing to do';
      return;
    end if;
    raise exception
      'the prose_unreviewed arm does not match the expected text; it was reshaped, so re-derive this patch from the live definition rather than forcing it';
  end if;

  -- Exactly one occurrence, counted on the literal rather than a regex so no
  -- escaping can widen it. Two would mean the arm text is shared with another
  -- counter and this replace would silently rewrite both.
  n := (length(src) - length(replace(src, old_arm, ''))) / length(old_arm);
  if n <> 1 then
    raise exception 'the prose_unreviewed arm text occurs % times, expected 1', n;
  end if;

  newsrc := replace(src, old_arm, new_arm);
  if newsrc = src then
    raise exception 'patch produced an identical body';
  end if;

  execute newsrc;
end $patch$;

do $verify$
declare src text; n int; counter_val bigint; expected bigint;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'tag_hygiene_stats';

  -- P1. The arm is unscoped, and ONLY it.
  if position('where description is not null and prose_reviewed_at is null)' in src) = 0 then
    raise exception 'P1: prose_unreviewed is still role-scoped';
  end if;
  select count(*) into n from regexp_matches(src, 'publication_role = ''article''', 'g');
  if n <> 2 then
    raise exception 'P1: % role-scoped arms remain, expected 2', n;
  end if;

  -- P2. The two whose scoping is correct still carry it. Asserted by NAME, so
  -- a patch that unscoped the wrong arm and left the count at 2 still fails.
  if position('where publication_role = ''article'' and category_id is null' in src) = 0 then
    raise exception 'P2: uncategorized_active lost its role scoping';
  end if;
  if position('where publication_role = ''article'' and (is_sensitive or is_adult)' in src) = 0 then
    raise exception 'P2: sensitive_without_description lost its role scoping';
  end if;

  -- P3. 99991790719601 survives: the shared CTE and its read counts.
  if position('ut as materialized' in src) = 0 then
    raise exception 'P3: the shared ut CTE is gone -- the body was restated, not patched';
  end if;
  select count(*) into n from regexp_matches(src, 'from unified_tags\M', 'g');
  if n <> 3 then raise exception 'P3: unified_tags read % times, expected 3', n; end if;
  select count(*) into n from regexp_matches(src, 'from unified_tag_assignments', 'g');
  if n <> 2 then raise exception 'P3: unified_tag_assignments read % times, expected 2', n; end if;
  select count(*) into n from regexp_matches(src, 'from events', 'g');
  if n <> 1 then raise exception 'P3: events read % times, expected 1', n; end if;

  -- P4. 99991789930597's other change survives.
  if position('group by lower(btrim(name)), entity_kind' in src) = 0 then
    raise exception 'P4: duplicate_active_name lost its entity_kind grouping key';
  end if;

  -- P5. All three planner/memory settings survive. create or replace RESETS
  -- proconfig wholesale, so this is checked against the catalog.
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'tag_hygiene_stats'
       and p.proconfig @> array['search_path=public','enable_indexonlyscan=off','work_mem=48MB']
       and p.prosecdef
  ) then
    raise exception 'P5: tag_hygiene_stats lost a SET clause or SECURITY DEFINER';
  end if;

  -- P6. The function still EXECUTES and still returns every counter.
  select count(*) into n from jsonb_object_keys(public.tag_hygiene_stats());
  if n <> 27 then
    raise exception 'P6: tag_hygiene_stats returns % top-level keys, expected 27', n;
  end if;

  -- P7. The counter now AGREES with its producer's work list. Computed here
  -- rather than frozen as a literal, because the corpus moves and a literal
  -- would make this migration's postcondition rot.
  select (public.tag_hygiene_stats()->>'prose_unreviewed')::bigint into counter_val;
  select count(*) into expected from unified_tags
   where status = 'active' and merged_into_id is null
     and description is not null and prose_reviewed_at is null;
  if counter_val <> expected then
    raise exception 'P7: counter reads % but the producer queue is %', counter_val, expected;
  end if;

  -- Deliberately NOT an abort on zero. On a rebuild-from-zero the corpus is
  -- empty, 0 = 0 is the correct answer, and a non-zero assertion here would
  -- fail a legitimate replay. P1 is the real control that the widening took
  -- effect: it reads the arm text, which no corpus state can satisfy by luck.
  if expected = 0 then
    raise notice 'prose_unreviewed reads 0 on an empty/drained corpus -- P7 is vacuous here, P1 carries the proof';
  else
    raise notice 'prose_unreviewed now reads % (was 0), matching the sweep work list', counter_val;
  end if;
end $verify$;
