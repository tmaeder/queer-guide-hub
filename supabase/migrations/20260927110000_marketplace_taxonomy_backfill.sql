-- Batched v3 taxonomy backfill for the existing corpus.
--
-- 20260926100100 stopped deriving subcategory_group/department/subcategory_fine
-- with STORED generated columns (a rewrite that held AccessExclusive for 14+
-- minutes and failed three times in CI) and moved derivation to a BEFORE
-- trigger. New and updated rows are therefore already v3. This recomputes the
-- ~62k rows that predate the change, a few hundred at a time, so the work is
-- spread across ordinary autocommit statements instead of one global lock.
--
-- Batch 500: each UPDATE fires trg_search_documents_marketplace, which enqueues
-- into search_reindex_queue, and the drain applies 1000/min — staying at half
-- the drain's rate keeps the queue from growing while this runs. At 500/min the
-- corpus converges in about two hours, and the job then no-ops forever because
-- it only selects rows whose stored values actually disagree with the freshly
-- computed ones.

-- ── Trigger gate must also fire for rows that were NEVER derived ────────────
-- 20260926100100 gated derivation on "subcategory or title changed". The
-- backfill below re-assigns `subcategory` its own value to trip that gate —
-- except IS DISTINCT FROM is false for an unchanged value, so the gate never
-- fires, nothing is derived, taxonomy_v3_at stays NULL, and the job re-selects
-- the same 500 rows every minute forever while bumping updated_at (and a
-- search reindex) each time. Measured on prod before shipping: self-assignment
-- left the row unstamped, a genuine title change stamped it.
--
-- Adding "never derived" to the gate fixes it at the source and gives a useful
-- property for free: setting taxonomy_v3_at back to NULL on any row queues it
-- for re-derivation.
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

CREATE OR REPLACE FUNCTION public.run_marketplace_taxonomy_backfill(p_batch integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_updated integer := 0;
  v_remaining bigint;
BEGIN
  -- Work is found by the taxonomy_v3_at marker, NOT by comparing stored values
  -- against freshly computed ones. That comparison reads correct but is a trap:
  -- it evaluates the ~390-regex ladder over all 62k rows just to locate 500 of
  -- them, every minute — the first draft of this function did exactly that and
  -- hit the statement timeout in a dry run. The marker turns finding the work
  -- into a partial-index lookup.
  WITH pending AS (
    SELECT l.id
    FROM public.marketplace_listings l
    WHERE l.taxonomy_v3_at IS NULL
    ORDER BY l.id
    LIMIT GREATEST(1, LEAST(p_batch, 1000))
  )
  UPDATE public.marketplace_listings m
  -- The BEFORE trigger recomputes all three columns and stamps the marker;
  -- re-assigning `subcategory` its own value is what trips the trigger's
  -- input-changed gate. Writing the derived columns here would create a
  -- second source of truth for the taxonomy.
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

-- Registry row is canonical; sync_automations_to_cron() derives the run-tracking
-- wrapper from action.command, so this file must NOT pre-wrap it (20260910163700).
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'marketplace_taxonomy_backfill',
  'Marketplace taxonomy v3 backfill',
  'Every minute: recomputes subcategory_group/department/subcategory_fine for listings that predate the v3 trigger, 500 rows at a time, selected by the taxonomy_v3_at IS NULL partial index. Self-terminating — once the corpus converges (~2h) the index is empty and every run is a no-op. Exists because deriving these as STORED generated columns required a 14-minute exclusive-lock table rewrite that failed three times in CI. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','rpc','fn','run_marketplace_taxonomy_backfill'),
  '* * * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schedule    = EXCLUDED.schedule,
      action      = EXCLUDED.action,
      enabled     = EXCLUDED.enabled;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('marketplace_taxonomy_backfill');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule('marketplace_taxonomy_backfill', '* * * * *',
  'SELECT public.run_marketplace_taxonomy_backfill(500);');
