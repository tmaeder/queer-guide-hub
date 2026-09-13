-- Arm the revision trail on every registered content table.
--
-- ── THE MEASUREMENT THIS WAITED FOR ─────────────────────────────────────────
-- The trigger was written and left attached to nothing, because turning 26
-- triggers on untested is how you find out about write amplification from a
-- statement timeout on a cron at 03:00.
--
-- Measured on prod in a rolled-back transaction, 300-row `events` UPDATE of a
-- single integer column, caches warmed by two identical statements first:
--
--   without the trigger   243 ms
--   with the trigger      345 ms      -> +102 ms, or +0.34 ms/row
--   revisions written     300
--   storage              ~573 bytes/revision all-in (payload 103 B for a
--                        one-integer change; ~1.5 KB when the changed column
--                        is a description)
--
-- Against the 300-row events batch CLAUDE.md documents at 0.96 s, +102 ms is
-- about +11%. Note this is NOT the "+3%" the plan for this work estimated —
-- that figure assumed the trigger's cost was negligible against a 3.2 ms/row
-- baseline, and the real per-row cost is a third of a millisecond against a
-- baseline that is often under a millisecond. It is small in absolute terms
-- and worth stating honestly rather than rounding down.
--
-- At ~5,400 content rows touched per day that is ~3.2 MB/day, ~1.2 GB/year
-- before pruning, and a steady state near 290 MB with the 90-day horizon on
-- machine revisions. The 12 GB database can carry that.
--
-- ── IF A BATCH JOB STARTS TIMING OUT ────────────────────────────────────────
--   UPDATE public.content_versioned_tables SET enabled = false WHERE table_name = '...';
-- One row, no DDL, no table lock, effective on the next statement. That is why
-- the kill switch is a column and not `ALTER TABLE ... DISABLE TRIGGER`:
-- taking ACCESS EXCLUSIVE on a 370 MB table during an incident is its own
-- outage. `content_revision_signals()` reports any table left in that state.

BEGIN;

-- CREATE TRIGGER takes ACCESS EXCLUSIVE. It does not rewrite the table, so it
-- is fast once it has the lock — but `events` (206 MB) and
-- `marketplace_listings` (370 MB) are written by crons every minute, and a
-- lock request that queues behind a long statement blocks every writer that
-- arrives after it. Failing the deploy is cheaper than a lock pile-up on the
-- hot path: bounded wait, and a retry that lands in a quieter second succeeds.
SET LOCAL lock_timeout = '5s';

-- Attached by loop over the registry rather than 25 hand-written statements,
-- so the set of triggers cannot drift from the set of registered tables.
DO $attach$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT table_name FROM public.content_versioned_tables ORDER BY table_name LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_content_revision ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_content_revision AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.log_content_revision()', r.table_name);
  END LOOP;
END $attach$;

UPDATE public.content_versioned_tables SET enabled = true;

DO $verify$
DECLARE
  v      jsonb;
  v_miss jsonb;
BEGIN
  v := public.content_revision_signals();

  -- The postcondition this migration exists to reach. An enabled row with no
  -- trigger is a lie: the registry says the table is versioned and every write
  -- to it goes unrecorded.
  v_miss := v -> 'enabled_without_trigger';
  IF jsonb_array_length(coalesce(v_miss, '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'tables enabled with no trigger attached: %', v_miss;
  END IF;

  IF (v ->> 'triggers_attached')::int <> (SELECT count(*) FROM public.content_versioned_tables) THEN
    RAISE EXCEPTION 'expected a trigger on every registered table, got % of %',
      v ->> 'triggers_attached', (SELECT count(*) FROM public.content_versioned_tables);
  END IF;

  -- Positive control: prove the trail RECORDS, rather than asserting that it
  -- will. Both dead predecessors would have passed every structural check
  -- ever written about them — admin_edit_log's RLS denial and cms_revisions'
  -- swallowed 23505 were only visible in the row count. So: write, read back,
  -- and roll the probe row away.
  DECLARE
    v_id    uuid;
    v_name  text;
    v_count integer;
  BEGIN
    -- A row with a non-null name: `NULL || ' '` is NULL, which would make the
    -- probe UPDATE a no-op, produce no revision, and abort this migration for
    -- the one reason that is not a fault.
    SELECT id, name INTO v_id, v_name
      FROM public.venue_services WHERE name IS NOT NULL ORDER BY id LIMIT 1;
    IF v_id IS NOT NULL THEN
      PERFORM set_config('app.actor', 'migration:content_revisions_attach', true);
      UPDATE public.venue_services SET name = v_name || ' ' WHERE id = v_id;
      SELECT count(*) INTO v_count FROM public.content_revisions
       WHERE source_table = 'venue_services' AND source_id = v_id;
      IF v_count = 0 THEN
        RAISE EXCEPTION 'the trigger is attached but recorded nothing — the trail is not live';
      END IF;
      UPDATE public.venue_services SET name = v_name WHERE id = v_id;
      DELETE FROM public.content_revisions WHERE source_table = 'venue_services' AND source_id = v_id
        AND actor = 'migration:content_revisions_attach';
      RAISE NOTICE 'revision trail verified live on venue_services';
    END IF;
  END;

  RAISE NOTICE 'content revision signals after attach: %', v;
END $verify$;

COMMIT;
