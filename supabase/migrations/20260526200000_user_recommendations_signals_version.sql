-- recommendation-engine signal extensions (Phase 4 / Mechanic A)
-- Adds a `signals_version` tag to cached rows so a code deploy that
-- adds or rebalances signals auto-invalidates stale caches without
-- a manual flush. Additive only.

ALTER TABLE public.user_recommendations
  ADD COLUMN IF NOT EXISTS signals_version TEXT;

CREATE INDEX IF NOT EXISTS idx_user_recommendations_signals_version
  ON public.user_recommendations(signals_version)
  WHERE signals_version IS NOT NULL;

COMMENT ON COLUMN public.user_recommendations.signals_version IS
  'Tag emitted by recommendation-engine for the SIGNAL_WEIGHTS shape that produced this row. Reads filter on the current version; older versions are treated as expired so a deploy auto-invalidates without manual flush.';
