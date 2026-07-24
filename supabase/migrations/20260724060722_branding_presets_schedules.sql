-- Design & Branding Control Center — theme presets + scheduled publish.
--   * site_branding_presets — named, reusable branding docs (e.g. "Pride Month")
--   * site_branding_schedules — timed activation windows (auto-publish/auto-revert)
--   * branding_publish_internal — the shared, ungated publish core (the cron
--     runner cannot pass a JWT, so publish logic is factored out and gated only
--     by role-level grants)
--   * run_branding_schedule — pure-SQL pg_cron runner (admin_automations pattern)

-- ---------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.site_branding_presets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  doc        JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_branding_schedules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id         UUID NOT NULL REFERENCES public.site_branding_presets(id) ON DELETE RESTRICT,
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ CHECK (ends_at IS NULL OR ends_at > starts_at),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','active','completed','cancelled','error')),
  revert_to_version INT,     -- published_version captured at activation
  activated_version INT,     -- version the activation publish created
  error             TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_branding_schedules_status_idx
  ON public.site_branding_schedules (status, starts_at);

ALTER TABLE public.site_branding_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_branding_schedules ENABLE ROW LEVEL SECURITY;

-- Admin-only read; all writes go through the RPCs below.
DO $$ BEGIN
  CREATE POLICY "admin read branding presets" ON public.site_branding_presets
    FOR SELECT TO authenticated
    USING (public.has_role_jwt('admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "admin read branding schedules" ON public.site_branding_schedules
    FOR SELECT TO authenticated
    USING (public.has_role_jwt('admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT ON public.site_branding_presets TO authenticated;
GRANT SELECT ON public.site_branding_schedules TO authenticated;

COMMENT ON TABLE public.site_branding_presets IS
  'Named reusable branding override docs applied to the draft or scheduled for timed publish.';
COMMENT ON TABLE public.site_branding_schedules IS
  'Timed activation windows: publish a preset at starts_at, revert to the pre-activation version at ends_at.';

-- ---------------------------------------------------------------
-- 2. Shared publish core (ungated; role-grant locked)
-- ---------------------------------------------------------------
-- Extracted from branding_publish so the cron runner (which has no JWT) can
-- publish through the exact same validate → version → prune logic. NOT callable
-- by anon/authenticated — only service_role (and definer callers below).

CREATE OR REPLACE FUNCTION public.branding_publish_internal(
  p_doc jsonb, p_note text, p_actor uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_version int;
  v_new_version int;
BEGIN
  PERFORM public.branding_validate(p_doc);
  SELECT published_version INTO v_current_version
    FROM public.site_branding WHERE id = 1 FOR UPDATE;
  v_new_version := v_current_version + 1;
  UPDATE public.site_branding
     SET published = p_doc,
         published_version = v_new_version,
         updated_by = p_actor,
         updated_at = now()
   WHERE id = 1;
  INSERT INTO public.site_branding_versions (version, doc, note, published_by)
  VALUES (v_new_version, p_doc, left(p_note, 300), p_actor);
  -- keep newest 50, never the v0 stock anchor
  DELETE FROM public.site_branding_versions
   WHERE version <= v_new_version - 50 AND version > 0;
  RETURN v_new_version;
END;
$$;

ALTER FUNCTION public.branding_publish_internal(jsonb, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.branding_publish_internal(jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_publish_internal(jsonb, text, uuid) TO service_role;

-- Re-point the gated wrapper at the shared core (re-state grants — the linter
-- has revoked EXECUTE on CREATE OR REPLACE before).
CREATE OR REPLACE FUNCTION public.branding_publish(p_note text DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft jsonb;
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT draft INTO v_draft FROM public.site_branding WHERE id = 1 FOR UPDATE;
  RETURN public.branding_publish_internal(v_draft, p_note, auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.branding_publish(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.branding_publish(text) TO authenticated;

-- ---------------------------------------------------------------
-- 3. Preset RPCs (admin-gated)
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.branding_preset_save(p_name text, p_doc jsonb DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc jsonb;
  v_id uuid;
  v_count int;
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'preset name required';
  END IF;
  -- p_doc NULL → snapshot the current draft
  v_doc := COALESCE(p_doc, (SELECT draft FROM public.site_branding WHERE id = 1));
  PERFORM public.branding_validate(v_doc);

  SELECT id INTO v_id FROM public.site_branding_presets WHERE name = trim(p_name);
  IF v_id IS NULL THEN
    SELECT count(*) INTO v_count FROM public.site_branding_presets;
    IF v_count >= 20 THEN
      RAISE EXCEPTION 'preset limit reached (max 20) — delete one first';
    END IF;
    INSERT INTO public.site_branding_presets (name, doc, created_by)
    VALUES (trim(p_name), v_doc, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.site_branding_presets
       SET doc = v_doc, updated_at = now()
     WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_preset_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.site_branding_schedules
              WHERE preset_id = p_id AND status IN ('pending','active')) THEN
    RAISE EXCEPTION 'preset has a pending or active schedule — cancel it first';
  END IF;
  DELETE FROM public.site_branding_presets WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_preset_apply(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc jsonb;
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT doc INTO v_doc FROM public.site_branding_presets WHERE id = p_id;
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'preset not found';
  END IF;
  PERFORM public.branding_validate(v_doc);
  -- Apply to draft only — the admin keeps the publish diff + contrast gate.
  UPDATE public.site_branding
     SET draft = v_doc, updated_by = auth.uid(), updated_at = now()
   WHERE id = 1;
END;
$$;

-- ---------------------------------------------------------------
-- 4. Schedule RPCs (admin-gated)
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.branding_schedule_create(
  p_preset_id uuid, p_starts_at timestamptz, p_ends_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_pending int;
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_branding_presets WHERE id = p_preset_id) THEN
    RAISE EXCEPTION 'preset not found';
  END IF;
  IF p_starts_at < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'start time must be in the future';
  END IF;
  IF p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'end time must be after start time';
  END IF;
  -- reject overlap with an existing windowed pending/active schedule
  IF p_ends_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.site_branding_schedules
    WHERE status IN ('pending','active') AND ends_at IS NOT NULL
      AND tstzrange(starts_at, ends_at) && tstzrange(p_starts_at, p_ends_at)
  ) THEN
    RAISE EXCEPTION 'overlaps an existing scheduled window';
  END IF;
  SELECT count(*) INTO v_pending FROM public.site_branding_schedules WHERE status = 'pending';
  IF v_pending >= 10 THEN
    RAISE EXCEPTION 'too many pending schedules (max 10)';
  END IF;
  INSERT INTO public.site_branding_schedules (preset_id, starts_at, ends_at, created_by)
  VALUES (p_preset_id, p_starts_at, p_ends_at, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_schedule_cancel(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.site_branding_schedules%ROWTYPE;
  v_revert_doc jsonb;
BEGIN
  IF NOT public.has_role_jwt('admin'::public.app_role) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.site_branding_schedules WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'schedule not found';
  END IF;
  IF v_row.status = 'active' THEN
    -- revert immediately to the pre-activation version
    SELECT doc INTO v_revert_doc FROM public.site_branding_versions
      WHERE version = v_row.revert_to_version;
    PERFORM public.branding_publish_internal(
      COALESCE(v_revert_doc, '{}'::jsonb),
      'schedule cancelled: revert to v' || COALESCE(v_row.revert_to_version::text, '0'),
      auth.uid());
  ELSIF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'schedule already %', v_row.status;
  END IF;
  UPDATE public.site_branding_schedules SET status = 'cancelled' WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.branding_preset_save(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.branding_preset_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.branding_preset_apply(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.branding_schedule_create(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.branding_schedule_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.branding_preset_save(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branding_preset_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branding_preset_apply(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branding_schedule_create(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branding_schedule_cancel(uuid) TO authenticated;

-- ---------------------------------------------------------------
-- 5. Cron runner (pure SQL, no JWT — admin_automations pattern)
-- ---------------------------------------------------------------
-- Timing: cron every 5 min + 60s edge memo + up to 5 min detail-page edge cache
-- ⇒ a scheduled switch is visible ~1–11 min after starts_at. Fine for a
-- week-long themed campaign; not minute-precise.

CREATE OR REPLACE FUNCTION public.run_branding_schedule()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_activated     int := 0;
  v_ended         int := 0;
  r               record;
  v_preset_doc    jsonb;
  v_revert_doc    jsonb;
  v_ver           int;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'branding_schedule';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'branding_schedule', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  -- Phase 1: activate due pending schedules
  FOR r IN
    SELECT s.*, p.doc AS preset_doc, p.name AS preset_name
    FROM public.site_branding_schedules s
    JOIN public.site_branding_presets p ON p.id = s.preset_id
    WHERE s.status = 'pending' AND s.starts_at <= now()
    ORDER BY s.starts_at
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    BEGIN
      SELECT published_version INTO v_ver FROM public.site_branding WHERE id = 1;
      v_preset_doc := r.preset_doc;
      PERFORM public.branding_publish_internal(
        v_preset_doc, 'scheduled: ' || r.preset_name, r.created_by);
      IF r.ends_at IS NULL THEN
        UPDATE public.site_branding_schedules
          SET status='completed', revert_to_version=v_ver,
              activated_version=(SELECT published_version FROM public.site_branding WHERE id=1)
          WHERE id=r.id;
      ELSE
        UPDATE public.site_branding_schedules
          SET status='active', revert_to_version=v_ver,
              activated_version=(SELECT published_version FROM public.site_branding WHERE id=1)
          WHERE id=r.id;
      END IF;
      v_activated := v_activated + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.site_branding_schedules SET status='error', error=SQLERRM WHERE id=r.id;
    END;
  END LOOP;

  -- Phase 2: end expired active windows (revert to pre-activation version)
  FOR r IN
    SELECT * FROM public.site_branding_schedules
    WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= now()
    ORDER BY ends_at
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT doc INTO v_revert_doc FROM public.site_branding_versions
        WHERE version = r.revert_to_version;
      PERFORM public.branding_publish_internal(
        COALESCE(v_revert_doc, '{}'::jsonb),
        'schedule ended: revert to v' || COALESCE(r.revert_to_version::text, '0'),
        r.created_by);
      UPDATE public.site_branding_schedules SET status='completed' WHERE id=r.id;
      v_ended := v_ended + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.site_branding_schedules SET status='error', error=SQLERRM WHERE id=r.id;
    END;
  END LOOP;

  -- Phase 3: prune terminal rows beyond the newest 50
  DELETE FROM public.site_branding_schedules
   WHERE status IN ('completed','cancelled','error')
     AND id NOT IN (
       SELECT id FROM public.site_branding_schedules
       WHERE status IN ('completed','cancelled','error')
       ORDER BY created_at DESC LIMIT 50);

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_activated+v_ended, items_changed=v_activated+v_ended,
        summary=jsonb_build_object('activated',v_activated,'ended',v_ended) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('activated',v_activated,'ended',v_ended);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END;
$$;

ALTER FUNCTION public.run_branding_schedule() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_branding_schedule() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_branding_schedule() TO service_role;

-- ---------------------------------------------------------------
-- 6. Register + schedule
-- ---------------------------------------------------------------

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES ('branding_schedule', 'Apply scheduled branding presets',
        'Every 5 min: activates due site_branding_schedules (publishes the preset as a new version) and ends expired windows (re-publishes the pre-schedule version). Pure SQL, no secrets.',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"run_branding_schedule"}'::jsonb, '*/5 * * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'branding_schedule') THEN
    PERFORM cron.unschedule('branding_schedule');
  END IF;
  PERFORM cron.schedule('branding_schedule', '*/5 * * * *', 'SELECT public.run_branding_schedule();');
END $$;
