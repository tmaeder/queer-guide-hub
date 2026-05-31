-- P1 — Learning spine v1: capture editor feedback + nightly source-reliability tuner.
--
-- Editors approve/reject/edit/revert news articles directly via the admin UI
-- (NewsQualityReviewTab, EntityLinkReviewTab) — today nothing learns from it.
-- This migration:
--   1. news_feedback_events — a trigger-captured, continuously-growing labeled
--      dataset of every human editorial decision (mined later by P3's example
--      bank + eval harness).
--   2. Capture triggers on news_articles + entity_link_review. Human-only:
--      gated on auth.uid() IS NOT NULL, so pipeline (service_role, no uid) and
--      the commit RPC are never mistaken for editors.
--   3. news_source_editor_feedback — per-source accept_rate over a trailing window.
--   4. tune_news_source_reliability() + nightly cron — EMA-nudges
--      news_sources.reliability_score toward the editor accept_rate. That column
--      drives news_sources_eligible() fetch ordering, so sources editors keep
--      rejecting get fetched less. The loop closes.
--
-- Roadmap: "News Data Quality — Closed-Loop Intelligence" (the spine).

-- ───────────────────────────── 1. Table ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.news_feedback_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id     UUID REFERENCES public.news_articles(id) ON DELETE CASCADE,
  source_id      UUID,                       -- denormalized; no FK (source may be pruned)
  event_type     TEXT NOT NULL,              -- approved|rejected|edited|reverted|status_changed|entity_link_approved|entity_link_rejected
  actor_id       UUID,                       -- auth.uid() of the editor
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  before         JSONB,
  after          JSONB,
  detail         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.news_feedback_events IS
  'Append-only log of human editorial decisions on news (approve/reject/edit/revert + entity-link resolutions). Trigger-captured, human-only. Feeds source-reliability tuning + future RAG example bank / eval harness.';

CREATE INDEX IF NOT EXISTS idx_news_feedback_source_time ON public.news_feedback_events (source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_feedback_article     ON public.news_feedback_events (article_id);
CREATE INDEX IF NOT EXISTS idx_news_feedback_type_time   ON public.news_feedback_events (event_type, created_at DESC);

ALTER TABLE public.news_feedback_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='news_feedback_events' AND policyname='news_feedback_admin_read') THEN
    CREATE POLICY "news_feedback_admin_read" ON public.news_feedback_events FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(),'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='news_feedback_events' AND policyname='news_feedback_service_read') THEN
    CREATE POLICY "news_feedback_service_read" ON public.news_feedback_events FOR SELECT TO service_role USING (true);
  END IF;
END $$;
GRANT SELECT ON public.news_feedback_events TO authenticated, service_role;

-- ──────────────────── 2a. Capture trigger: news_articles ────────────────────
-- SECURITY DEFINER so the insert bypasses RLS regardless of caller role.
CREATE OR REPLACE FUNCTION public.capture_news_article_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_type   TEXT;
  v_fields TEXT[] := '{}';
  v_before JSONB := '{}'::jsonb;
  v_after  JSONB := '{}'::jsonb;
BEGIN
  -- Human-only: pipeline/commit/backfill all run as service_role (uid NULL).
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Track which content fields the editor touched.
  IF NEW.title   IS DISTINCT FROM OLD.title   THEN v_fields := array_append(v_fields, 'title');
    v_before := v_before || jsonb_build_object('title', OLD.title);
    v_after  := v_after  || jsonb_build_object('title', NEW.title); END IF;
  IF NEW.content IS DISTINCT FROM OLD.content THEN v_fields := array_append(v_fields, 'content');
    v_before := v_before || jsonb_build_object('content', left(coalesce(OLD.content,''), 2000));
    v_after  := v_after  || jsonb_build_object('content', left(coalesce(NEW.content,''), 2000)); END IF;
  IF NEW.excerpt IS DISTINCT FROM OLD.excerpt THEN v_fields := array_append(v_fields, 'excerpt');
    v_before := v_before || jsonb_build_object('excerpt', OLD.excerpt);
    v_after  := v_after  || jsonb_build_object('excerpt', NEW.excerpt); END IF;
  IF NEW.image_url IS DISTINCT FROM OLD.image_url THEN v_fields := array_append(v_fields, 'image_url');
    v_before := v_before || jsonb_build_object('image_url', OLD.image_url);
    v_after  := v_after  || jsonb_build_object('image_url', NEW.image_url); END IF;
  IF NEW.quality_status IS DISTINCT FROM OLD.quality_status THEN v_fields := array_append(v_fields, 'quality_status');
    v_before := v_before || jsonb_build_object('quality_status', OLD.quality_status);
    v_after  := v_after  || jsonb_build_object('quality_status', NEW.quality_status); END IF;

  -- Classify the editorial action.
  IF NEW.quality_status IS DISTINCT FROM OLD.quality_status THEN
    v_type := CASE NEW.quality_status
      WHEN 'passed'   THEN 'approved'
      WHEN 'rejected' THEN 'rejected'
      WHEN 'pending'  THEN 'reverted'
      ELSE 'status_changed'
    END;
  ELSIF array_length(v_fields, 1) > 0 THEN
    v_type := 'edited';
  ELSE
    RETURN NEW;  -- nothing editorially meaningful changed
  END IF;

  INSERT INTO public.news_feedback_events
    (article_id, source_id, event_type, actor_id, changed_fields, before, after)
  VALUES
    (NEW.id, NEW.source_id, v_type, v_uid, v_fields,
     NULLIF(v_before,'{}'::jsonb), NULLIF(v_after,'{}'::jsonb));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_news_article_feedback ON public.news_articles;
CREATE TRIGGER trg_capture_news_article_feedback
  AFTER UPDATE ON public.news_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_news_article_feedback();

-- ──────────────────── 2b. Capture trigger: entity_link_review ────────────────────
CREATE OR REPLACE FUNCTION public.capture_entity_link_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','rejected') THEN RETURN NEW; END IF;

  INSERT INTO public.news_feedback_events
    (article_id, source_id, event_type, actor_id, detail)
  SELECT
    NEW.article_id,
    a.source_id,
    'entity_link_' || NEW.status,
    v_uid,
    jsonb_build_object(
      'entity_type',    NEW.entity_type,
      'candidate_id',   NEW.candidate_id,
      'candidate_name', NEW.candidate_name,
      'score',          NEW.score
    )
  FROM public.news_articles a
  WHERE a.id = NEW.article_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_entity_link_feedback ON public.entity_link_review;
CREATE TRIGGER trg_capture_entity_link_feedback
  AFTER UPDATE ON public.entity_link_review
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_entity_link_feedback();

-- ───────────────────── 3. Per-source aggregate view ─────────────────────
CREATE OR REPLACE VIEW public.news_source_editor_feedback AS
SELECT
  fe.source_id,
  ns.name AS source_name,
  count(*) FILTER (WHERE fe.event_type = 'approved')                       AS approvals,
  count(*) FILTER (WHERE fe.event_type = 'rejected')                       AS rejections,
  count(*) FILTER (WHERE fe.event_type = 'edited')                         AS edits,
  count(*) FILTER (WHERE fe.event_type = 'reverted')                       AS reverts,
  count(*) FILTER (WHERE fe.event_type IN ('approved','rejected'))         AS decisions,
  (count(*) FILTER (WHERE fe.event_type = 'approved'))::numeric
    / NULLIF(count(*) FILTER (WHERE fe.event_type IN ('approved','rejected')), 0) AS accept_rate,
  max(fe.created_at) AS last_feedback_at
FROM public.news_feedback_events fe
JOIN public.news_sources ns ON ns.id = fe.source_id
WHERE fe.created_at > now() - interval '90 days'
  AND fe.source_id IS NOT NULL
GROUP BY fe.source_id, ns.name;

ALTER VIEW public.news_source_editor_feedback SET (security_invoker = true);
GRANT SELECT ON public.news_source_editor_feedback TO authenticated, service_role;

-- ───────────────── 4. Nightly tuner: EMA toward editor accept_rate ─────────────────
-- reliability_score drives news_sources_eligible() fetch ordering. Pull each
-- source's score a fraction (alpha) toward the rate at which editors accept its
-- articles, once there's enough signal (>= p_min_decisions). Bounded [0,1].
CREATE OR REPLACE FUNCTION public.tune_news_source_reliability(
  p_min_decisions INT     DEFAULT 8,
  p_alpha         NUMERIC DEFAULT 0.30,
  p_dry_run       BOOLEAN DEFAULT FALSE
) RETURNS TABLE(source_id UUID, source_name TEXT, old_score NUMERIC, new_score NUMERIC, accept_rate NUMERIC, decisions BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT ef.source_id, ef.source_name, ef.accept_rate, ef.decisions,
           ns.reliability_score AS old_score,
           GREATEST(0.0, LEAST(1.0,
             (1 - p_alpha) * coalesce(ns.reliability_score, 1.0) + p_alpha * ef.accept_rate
           ))::numeric(4,3) AS new_score
    FROM public.news_source_editor_feedback ef
    JOIN public.news_sources ns ON ns.id = ef.source_id
    WHERE ef.decisions >= p_min_decisions
      AND ef.accept_rate IS NOT NULL
  ),
  applied AS (
    UPDATE public.news_sources ns
       SET reliability_score = c.new_score, updated_at = now()
      FROM candidates c
     WHERE ns.id = c.source_id
       AND p_dry_run = FALSE
       AND ns.reliability_score IS DISTINCT FROM c.new_score
    RETURNING ns.id
  )
  SELECT c.source_id, c.source_name, c.old_score, c.new_score, c.accept_rate, c.decisions
  FROM candidates c
  ORDER BY c.new_score ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.tune_news_source_reliability(INT, NUMERIC, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tune_news_source_reliability(INT, NUMERIC, BOOLEAN) TO service_role;

-- ───────────────────────── 5. Cron: nightly 04:22 UTC ─────────────────────────
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'tune-news-source-reliability';
  PERFORM cron.schedule('tune-news-source-reliability', '22 4 * * *', $f$
    SELECT public.tune_news_source_reliability();
  $f$);
END $$;
