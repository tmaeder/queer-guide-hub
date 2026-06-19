-- Roadmap / agile ideas module.
--
-- Strategic layer for idea/improvement/content-idea feedback, kept separate from
-- the bug-fix machinery (feedback_stories + routine runs). An admin promotes an
-- idea-category submission into a roadmap_item, shapes it (problem / solution /
-- acceptance criteria / effort / impact) through an agile stage flow, and on
-- "hand off" generates a ready-to-paste Claude Code prompt.
--
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS public.roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  problem text,
  proposed_solution text,
  acceptance_criteria text[] NOT NULL DEFAULT '{}',
  affected_areas text,
  effort text CHECK (effort IS NULL OR effort IN ('S','M','L')),
  impact text CHECK (impact IS NULL OR impact IN ('low','med','high')),
  stage text NOT NULL DEFAULT 'inbox'
    CHECK (stage IN ('inbox','shaping','backlog','now','next','later','handed_off','shipped','declined')),
  source_submission_ids uuid[] NOT NULL DEFAULT '{}',
  vote_rollup int NOT NULL DEFAULT 0,
  handoff_prompt text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roadmap_items_stage ON public.roadmap_items (stage, vote_rollup DESC);
CREATE INDEX IF NOT EXISTS idx_roadmap_items_sources ON public.roadmap_items USING gin (source_submission_ids);

CREATE OR REPLACE FUNCTION public.tg_roadmap_items_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_roadmap_items_touch ON public.roadmap_items;
CREATE TRIGGER trg_roadmap_items_touch
  BEFORE UPDATE ON public.roadmap_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_roadmap_items_touch();

ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roadmap_items_admins_read ON public.roadmap_items;
CREATE POLICY roadmap_items_admins_read ON public.roadmap_items
  FOR SELECT TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS roadmap_items_admins_write ON public.roadmap_items;
CREATE POLICY roadmap_items_admins_write ON public.roadmap_items
  FOR ALL TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]))
  WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS roadmap_items_service_write ON public.roadmap_items;
CREATE POLICY roadmap_items_service_write ON public.roadmap_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_items TO authenticated;
GRANT ALL ON public.roadmap_items TO service_role;

-- ── promote_submission_to_roadmap ───────────────────────────────
-- Creates a roadmap item seeded from the first submission, links all given
-- submissions as sources, rolls up their votes, and parks the source items at
-- feedback_status='planned' (they leave the active triage lanes).
CREATE OR REPLACE FUNCTION public.promote_submission_to_roadmap(p_submission_ids uuid[])
RETURNS public.roadmap_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seed public.community_submissions%ROWTYPE;
  v_item public.roadmap_items%ROWTYPE;
  v_votes int;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_submission_ids IS NULL OR array_length(p_submission_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'submission_ids_required';
  END IF;

  SELECT * INTO v_seed FROM public.community_submissions
   WHERE id = p_submission_ids[1] AND content_type = 'feedback';
  IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT count(*) INTO v_votes
    FROM public.feedback_votes WHERE submission_id = ANY(p_submission_ids);

  INSERT INTO public.roadmap_items
    (title, problem, source_submission_ids, vote_rollup, created_by)
  VALUES
    (COALESCE(NULLIF(trim(v_seed.data->>'title'), ''), 'Untitled idea'),
     v_seed.data->>'description',
     p_submission_ids,
     COALESCE(v_votes, 0),
     auth.uid())
  RETURNING * INTO v_item;

  UPDATE public.community_submissions
     SET feedback_status = 'planned'
   WHERE id = ANY(p_submission_ids)
     AND feedback_status <> 'done';

  RETURN v_item;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_submission_to_roadmap(uuid[]) TO authenticated;

-- ── update_roadmap_item ─────────────────────────────────────────
-- Patches shaping fields. Only whitelisted keys in p_patch are applied.
CREATE OR REPLACE FUNCTION public.update_roadmap_item(p_id uuid, p_patch jsonb)
RETURNS public.roadmap_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item public.roadmap_items%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.roadmap_items SET
     title             = COALESCE(p_patch->>'title', title),
     problem           = CASE WHEN p_patch ? 'problem' THEN p_patch->>'problem' ELSE problem END,
     proposed_solution = CASE WHEN p_patch ? 'proposed_solution' THEN p_patch->>'proposed_solution' ELSE proposed_solution END,
     affected_areas    = CASE WHEN p_patch ? 'affected_areas' THEN p_patch->>'affected_areas' ELSE affected_areas END,
     effort            = CASE WHEN p_patch ? 'effort' THEN NULLIF(p_patch->>'effort','') ELSE effort END,
     impact            = CASE WHEN p_patch ? 'impact' THEN NULLIF(p_patch->>'impact','') ELSE impact END,
     handoff_prompt    = CASE WHEN p_patch ? 'handoff_prompt' THEN p_patch->>'handoff_prompt' ELSE handoff_prompt END,
     acceptance_criteria = CASE
       WHEN p_patch ? 'acceptance_criteria'
       THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'acceptance_criteria'))
       ELSE acceptance_criteria END,
     stage             = CASE WHEN p_patch ? 'stage' THEN p_patch->>'stage' ELSE stage END
   WHERE id = p_id
   RETURNING * INTO v_item;

  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN v_item;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_roadmap_item(uuid, jsonb) TO authenticated;

-- ── set_roadmap_stage ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_roadmap_stage(p_id uuid, p_stage text)
RETURNS public.roadmap_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item public.roadmap_items%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_stage NOT IN ('inbox','shaping','backlog','now','next','later','handed_off','shipped','declined') THEN
    RAISE EXCEPTION 'invalid_stage: %', p_stage;
  END IF;

  UPDATE public.roadmap_items SET stage = p_stage WHERE id = p_id RETURNING * INTO v_item;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN v_item;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_roadmap_stage(uuid, text) TO authenticated;
