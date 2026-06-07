-- ============================================================================
-- Data-driven admin automation dispatch (ends the CREATE-OR-REPLACE clobber war)
-- ----------------------------------------------------------------------------
-- admin_automation_run/_dry_run were a single function with a hardcoded ELSIF
-- ladder of slugs. Many feature migrations (events, cities, countries, venues,
-- news, tags) each CREATE OR REPLACE it with their own slug subset, so whichever
-- ran last silently dropped every other team's slugs — the live function was
-- found missing city_*, country_*, and tag_* at once. Crons are unaffected (they
-- call run_*() directly), but the admin "run now" button breaks for the dropped
-- slugs.
--
-- Fix: dispatch from data. admin_automations.action already holds
-- {"type":"rpc","fn":"run_..."}; look it up and EXECUTE it. New automations need
-- no dispatcher edit ever again. fn is allowlisted to ^run_[a-z0-9_]+$ and must
-- belong to a registered slug, so this is not arbitrary code execution.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_automation_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fn text; v_result jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  -- Prefer an explicit rpc fn; otherwise fall back to the run_<slug> convention
  -- (covers non-rpc automations like *_purge / *_auto_archive whose impl is
  -- run_<slug>()). Slug must be registered either way.
  SELECT action->>'fn' INTO v_fn
  FROM public.admin_automations
  WHERE slug = p_slug AND action->>'type' = 'rpc';
  IF v_fn IS NULL AND EXISTS (SELECT 1 FROM public.admin_automations WHERE slug = p_slug)
     AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'run_' || p_slug) THEN
    v_fn := 'run_' || p_slug;
  END IF;
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;
  IF v_fn !~ '^run_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'invalid automation fn: %', v_fn USING ERRCODE='22023'; END IF;
  EXECUTE format('SELECT public.%I()', v_fn) INTO v_result;
  RETURN v_result;
END; $$;

-- Dry-run: validate the slug exists and record a dry_run row. Exact per-slug
-- "would change" counts are no longer hardcoded; callers get the slug's fn back.
CREATE OR REPLACE FUNCTION public.admin_automation_dry_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_automation_id uuid; v_fn text; v_started_at timestamptz := now();
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT id, action->>'fn' INTO v_automation_id, v_fn
  FROM public.admin_automations WHERE slug = p_slug;
  IF v_automation_id IS NULL THEN
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  VALUES (v_automation_id, p_slug, v_started_at, now(), 'dry_run', 0, 0,
          jsonb_build_object('mode','dry_run','fn',v_fn));
  RETURN jsonb_build_object('would_change', null, 'fn', v_fn);
END; $$;
