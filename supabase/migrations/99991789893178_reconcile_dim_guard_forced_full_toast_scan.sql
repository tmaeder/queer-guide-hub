-- search_embeddings_reconcile was costing the CORPUS, not the BACKLOG, and one dead predicate
-- was the whole reason.
--
-- MEASURED ON PROD 2026-09-19. The */10 job (jobid 2526) was failing at the pg_cron 120s
-- statement timeout 13 times in 78 runs (17%), avg 49.8s, against 0 rows of actual work to do.
-- Its plan:
--
--   Limit (cost=1000.84..27460.77 rows=9)
--     -> Nested Loop Anti Join
--          -> Nested Loop
--               -> Parallel Seq Scan on content_embeddings ce
--                    Filter: ((embedding IS NOT NULL) AND (vector_dims(embedding) = 1024))
--
-- `vector_dims(ce.embedding)` is an opaque function call, so it cannot be answered from the
-- index or the tuple header -- pgvector's PG_GETARG_VECTOR_P fully detoasts the datum. The
-- driving side is therefore a seq scan of all 248,229 content_embeddings rows that DETOASTS
-- EVERY VECTOR, out of a 1,750 MB TOAST relation, every ten minutes. `embedding IS NOT NULL`
-- next to it is free by comparison -- a null test reads the null bitmap and never detoasts --
-- which is why the two predicates look alike and are not.
--
-- The LIMIT cannot save it. It short-circuits only when rows flow, and this job is a backstop
-- that normally finds nothing, so the scan always runs to completion. THE JOB IS SLOWEST
-- EXACTLY WHEN IT IS CAUGHT UP. That inversion is why it degraded quietly: a real backlog made
-- it look fine. The planner compounds it -- with no statistics for an opaque function it guessed
-- rows=732 of 248,229 for a filter that in truth matches ~100%.
--
-- THE PREDICATE IS DEAD CODE. Both content_embeddings.embedding and search_embeddings.embedding
-- are declared `vector(1024)`, and pgvector enforces the dimension through typmod:
--   select '[1,2,3]'::extensions.vector::extensions.vector(1024)
--   ERROR: 22000: expected 1024 dimensions, not 3
-- No row of that column can have dims <> 1024, so the guard has never excluded anything. It has
-- only ever charged 1,750 MB of TOAST reads to prove a tautology.
--
-- MEASURED AFTER REMOVAL, same query, EXPLAIN (ANALYZE, BUFFERS) on prod:
--   Execution Time: 866.715 ms   (was: timing out at 120,000 ms)
--   Merge Anti Join (search_documents_pkey x search_embeddings_pkey) -> 10 rows
--     -> Index Scan on content_embeddings_content_type_content_id_key (loops=10)
-- The expensive column is now read only for rows that survive the anti-join, so the cost is
-- proportional to the backlog. Nothing else about the function changes: the row set is
-- identical, because the predicate it drops was never false.
--
-- NOT FIXED HERE, deliberately, and named rather than left implied:
--   * content_embeddings carries 28,953 dead tuples with last_autovacuum 2026-09-11 and
--     relallvisible 6,961 of 22,514 pages (31%). That bloat is what walked the seq scan across
--     the 120s line over the past week. A migration runs inside a transaction and VACUUM cannot,
--     and after this change the job no longer seq-scans that table at all, so the bloat stops
--     mattering to THIS job. It is still worth a manual VACUUM (ANALYZE) for every other reader.
--   * The :00/:20/:30/:40/:50 cron convoy (32 jobs share minute 0, 17 share minute 50, plus the
--     */5 and */10 families) is a separate scheduling problem. Spreading ~150 registry rows is
--     not this change's to make.

create or replace function public.search_embeddings_reconcile(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_inserted integer;
begin
  if p_limit is null or p_limit <= 0 or p_limit > 5000 then
    raise exception 'p_limit must be between 1 and 5000, got %', p_limit;
  end if;

  with missing as (
    select d.doc_id, ce.embedding
    from public.search_documents d
    join public.content_embeddings ce
      on ce.content_type = d.entity_type
     and ce.content_id  = d.entity_id
    -- NO vector_dims() here. The column type is vector(1024) and pgvector enforces it via
    -- typmod, so the check is a tautology -- and being an opaque function call it forces a
    -- full detoast of every vector in the table, which is what made this job time out.
    -- If this predicate looks missing, read the header before adding it back.
    where ce.embedding is not null
      and not exists (
        select 1 from public.search_embeddings se where se.doc_id = d.doc_id
      )
    limit p_limit
  )
  insert into public.search_embeddings (doc_id, embedding)
  select doc_id, embedding from missing
  on conflict (doc_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $function$;

revoke all on function public.search_embeddings_reconcile(integer) from public, anon, authenticated;
grant execute on function public.search_embeddings_reconcile(integer) to service_role;

comment on function public.search_embeddings_reconcile(integer) is
  'Backstop reconciler for search_embeddings. The happy path is covered by TWO triggers: '
  'trg_sd_pull_embedding (document after vector) and trg_search_documents_embedding (vector '
  'after document). Both swallow write failures via `exception when others then null`, so a '
  'transient error strands a (doc_id, embedding) pair permanently with nothing to re-fire it. '
  'This job re-inserts those strays only; it is NOT the primary delivery path, contrary to the '
  'header of migration 20260910144533, which is corrected by 20380301100000. '
  'Deliberately contains no vector_dims() dimension check: the column type enforces it, and the '
  'call forced a full-corpus TOAST detoast that timed the job out (99991789893178).';

do $verify$
declare
  v_src  text;
  v_dims integer;
begin
  -- 1. THE PREMISE. Removing the guard is only safe while the dimension is enforced by the
  --    column type on BOTH sides. If a later migration widens either column to bare `vector`,
  --    this assertion is what stops the removal becoming silently unsafe.
  --    Read from pg_type.typname + atttypmod, NOT format_type(): format_type() schema-qualifies
  --    according to the CALLER's search_path, so it returns 'vector(1024)' or
  --    'extensions.vector(1024)' depending on who is applying the migration. A first draft of
  --    this block compared that string and aborted its own dry run at 0 of 2 -- the check that
  --    encodes one phrasing of a condition, which is how a correct migration blocks db push on
  --    main and takes every migration queued behind it. atttypmod is the dimension itself.
  select count(*) into v_dims
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid in ('public.content_embeddings'::regclass, 'public.search_embeddings'::regclass)
    and a.attname = 'embedding'
    and t.typname = 'vector'
    and a.atttypmod = 1024;
  if v_dims <> 2 then
    raise exception
      'search_embeddings_reconcile drops its dimension guard because both embedding columns are '
      'typed vector(1024); only % of 2 still are, so the guard must be restored or the type fixed',
      v_dims;
  end if;

  -- 2. THE DEFECT. Keyed on the wrong thing (the call), not on this file's exact body, so a
  --    better rewrite by someone else also satisfies it.
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_embeddings_reconcile';

  if v_src is null then
    raise exception 'search_embeddings_reconcile is missing';
  end if;
  --    Strip -- comments before scanning. The body deliberately MENTIONS vector_dims to warn
  --    the next reader off re-adding it, and the first draft of this check matched that comment
  --    and failed on its own correct code. Scanning unstripped source also cuts the other way:
  --    it would pass for a body that keeps the call and drops the comment.
  v_src := regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g');
  if position('vector_dims' in v_src) > 0 then
    raise exception 'search_embeddings_reconcile still calls vector_dims -- the full-corpus detoast is back';
  end if;

  -- 3. IT STILL RUNS. A function that no longer times out but no longer works is not a fix.
  --    p_limit 1 does at most one row of the job's own idempotent work.
  perform public.search_embeddings_reconcile(1);
end $verify$;
