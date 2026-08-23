-- Make the v3 taxonomy backfill actually work, and at a survivable rate.
--
-- Two defects in 20260927110000, both found by running it against prod rather
-- than by reading it. That migration is already applied, so this corrects it
-- forward instead of editing an applied file.
--
-- ── 1. The derive gate never fired for the backfill ─────────────────────────
-- The backfill trips the trigger by re-assigning `subcategory` its own value,
-- but the gate was `NEW.subcategory IS DISTINCT FROM OLD.subcategory OR
-- NEW.title IS DISTINCT FROM OLD.title` — and IS DISTINCT FROM is false for an
-- unchanged value. So nothing derived, taxonomy_v3_at stayed NULL, the same
-- 500 rows were re-selected every minute forever, and each pass still bumped
-- updated_at and queued a search reindex. Measured on prod: self-assignment
-- left the row unstamped; a real title change stamped it. Adding "never
-- derived" to the gate fixes it and makes `taxonomy_v3_at := NULL` a way to
-- re-queue any row.
--
-- ── 2. 500 rows per minute is not survivable, and the real cost was hidden ──
-- The batch size was sized against a measured "1.05s per 500 rows" — which was
-- measuring defect 1: the no-op. With derivation actually happening the true
-- cost, measured on prod, is:
--
--     the three classifier functions alone: 9.43s for 25 rows = ~377 ms/row
--     everything else (other triggers):     negligible
--
-- ~377 ms/row is ~6.5 hours of pure CPU for the 62k active listings, and a
-- 500-row batch cannot finish inside the cluster's 2-minute statement_timeout
-- — every tick would burn two minutes and roll back with ZERO progress, which
-- is worse than the no-op it replaced. The cron was unscheduled and the
-- registry row disabled on prod the moment this was measured, before its first
-- tick.
--
-- Batch is therefore 100 (~38 s, comfortably inside the timeout) at one tick a
-- minute: the corpus converges in roughly ten hours, and 100 reindex enqueues
-- per minute sit far under the drain's 1000/min. Slow is fine — this is a
-- one-time convergence and the trigger already keeps every new and updated row
-- correct.
--
-- WHY THE CLASSIFIER IS THIS EXPENSIVE, and the real follow-up: the ladder is
-- re-run about six times per row. marketplace_department() calls
-- marketplace_subcategory_group() again, and marketplace_subcategory_fine()
-- calls it a third time before its own ~90-pattern ladder, each call
-- re-normalizing the text and re-walking ~50 alternation regexes. Computing
-- the normalized string once and returning (group, department, fine) from a
-- single function would cut this several-fold. That is a real optimisation,
-- not a micro one — but it changes classification code that three surfaces
-- depend on, so it belongs in its own change with its own diff of the results,
-- not bolted onto an incident fix.

CREATE OR REPLACE FUNCTION public.marketplace_listings_derive_taxonomy()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.taxonomy_v3_at IS NULL
     OR NEW.subcategory IS DISTINCT FROM OLD.subcategory
     OR NEW.title IS DISTINCT FROM OLD.title THEN
    NEW.subcategory_group := public.marketplace_subcategory_group(NEW.subcategory, NEW.title);
    NEW.department        := public.marketplace_department(NEW.subcategory, NEW.title);
    NEW.subcategory_fine  := public.marketplace_subcategory_fine(NEW.subcategory, NEW.title);
    NEW.taxonomy_v3_at    := now();
  END IF;

  IF TG_OP = 'INSERT' OR NEW.attributes IS DISTINCT FROM OLD.attributes THEN
    NEW.sizes  := public.jsonb_text_array(NEW.attributes -> 'size');
    NEW.colors := public.jsonb_text_array(NEW.attributes -> 'color');
  END IF;

  RETURN NEW;
END $fn$;

-- Default drops 500 -> 100 and the hard ceiling 1000 -> 200, so a future
-- caller cannot re-introduce a batch that outruns the statement timeout.
CREATE OR REPLACE FUNCTION public.run_marketplace_taxonomy_backfill(p_batch integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_updated integer := 0;
  v_remaining bigint;
BEGIN
  WITH pending AS (
    SELECT l.id
    FROM public.marketplace_listings l
    WHERE l.taxonomy_v3_at IS NULL
    ORDER BY l.id
    LIMIT GREATEST(1, LEAST(p_batch, 200))
  )
  UPDATE public.marketplace_listings m
  SET subcategory = m.subcategory
  FROM pending p
  WHERE m.id = p.id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM public.marketplace_listings l WHERE l.taxonomy_v3_at IS NULL;

  RETURN jsonb_build_object('updated', v_updated, 'remaining', v_remaining, 'at', now());
END $$;
REVOKE ALL ON FUNCTION public.run_marketplace_taxonomy_backfill(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_marketplace_taxonomy_backfill(integer) TO service_role, authenticated;

UPDATE public.admin_automations
   SET enabled = true,
       description = 'Every minute: derives subcategory_group/department/subcategory_fine for listings that predate the v3 trigger, 100 rows at a time (measured ~377 ms/row — a 500-row batch cannot finish inside the 2-minute statement_timeout). Selected via the taxonomy_v3_at IS NULL partial index, so once the corpus converges (~10h) the index is empty and every run is a no-op. Kill switch = disable this row AND unschedule the cron, since the command calls the RPC directly.'
 WHERE slug = 'marketplace_taxonomy_backfill';

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('marketplace_taxonomy_backfill');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule('marketplace_taxonomy_backfill', '* * * * *',
  'SELECT public.run_marketplace_taxonomy_backfill(100);');
