-- Per-field revert, and retention for a trail that records every write.
--
-- ── WHY PER-FIELD AND NOT WHOLE-ROW ─────────────────────────────────────────
-- `useCMSRevisions.restoreRevision` (zero callers, so this never ran) wrote the
-- whole snapshot back over the row. On this corpus that is destructive: content
-- rows are continuously enriched by crons, so reverting a venue's description
-- would also undo whatever the geocoder, the logo mirror and the trust
-- recompute had done since. A revision here is a delta, and the revert is the
-- same shape: put THIS field back, leave everything else alone.
--
-- ── REFUSE, DO NOT GUESS ────────────────────────────────────────────────────
-- Three refusals, each from an existing precedent in this schema:
--   * the table must be in content_versioned_tables — never a free-text table
--     name interpolated into DDL;
--   * the column must exist on it and be writable — a generated or identity
--     column is refused rather than attempted;
--   * the live value must still equal what the revision recorded as `after`.
--     If something changed it since, the revert is refused for that field and
--     says so. This is rollback_external_correction_batch's skip discipline:
--     a revert that silently clobbers a newer value is how you lose the edit
--     you were not looking at.
--
-- `revert_content_change` (baseline:11066) swallows failures into
-- `RETURN FALSE`. That is the mistake not to copy — this RAISEs.

BEGIN;

CREATE OR REPLACE FUNCTION public.content_revision_revert_fields(
  p_revision_id uuid,
  p_fields      text[] DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_rev       public.content_revisions%ROWTYPE;
  v_allowed   boolean;
  v_field     text;
  v_fields    text[];
  v_reverted  text[] := '{}';
  v_skipped   jsonb  := '[]'::jsonb;
  v_attgen    text;
  v_attident  text;
  v_live      jsonb;
  v_recorded  jsonb;
  v_payload   jsonb  := '{}'::jsonb;
  v_set       text;
BEGIN
  IF NOT public.has_any_role_jwt(ARRAY['admin'::public.app_role, 'moderator'::public.app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rev FROM public.content_revisions WHERE id = p_revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision % not found', p_revision_id;
  END IF;

  -- An INSERT has no previous state to go back to, and a DELETE would need the
  -- row re-created rather than a field put back. Both are real operations, and
  -- neither is this one — say so instead of doing something approximate.
  IF v_rev.op <> 'U' THEN
    RAISE EXCEPTION 'revision % is a % and only an update can be reverted field by field',
      p_revision_id, CASE v_rev.op WHEN 'I' THEN 'create' ELSE 'delete' END;
  END IF;

  SELECT true INTO v_allowed
    FROM public.content_versioned_tables WHERE table_name = v_rev.source_table;
  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'table % is not a versioned content table', v_rev.source_table;
  END IF;

  v_fields := coalesce(p_fields, v_rev.changed_fields);
  IF cardinality(v_fields) = 0 THEN
    RAISE EXCEPTION 'no fields given to revert';
  END IF;

  -- Pass one validates and collects. The write is a SINGLE statement further
  -- down, not one UPDATE per field: a per-field loop makes reverting a
  -- twenty-field revision write twenty revisions, and the history of an undo
  -- should be one entry saying what was undone.
  FOREACH v_field IN ARRAY v_fields LOOP
    IF NOT (v_field = ANY (v_rev.changed_fields)) THEN
      v_skipped := v_skipped || jsonb_build_object('field', v_field, 'reason', 'not_in_revision');
      CONTINUE;
    END IF;

    SELECT a.attgenerated, a.attidentity INTO v_attgen, v_attident
      FROM pg_attribute a
     WHERE a.attrelid = ('public.' || quote_ident(v_rev.source_table))::regclass
       AND a.attname  = v_field
       AND a.attnum > 0 AND NOT a.attisdropped;

    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_object('field', v_field, 'reason', 'no_such_column');
      CONTINUE;
    END IF;
    -- A generated or identity column is computed by the database; writing one
    -- back would either error or fight whatever derives it.
    IF v_attgen <> '' OR v_attident <> '' THEN
      v_skipped := v_skipped || jsonb_build_object('field', v_field, 'reason', 'not_writable');
      CONTINUE;
    END IF;

    EXECUTE format('SELECT to_jsonb(t) -> %L FROM public.%I t WHERE t.id = $1',
                   v_field, v_rev.source_table)
       INTO v_live USING v_rev.source_id;

    IF v_live IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('field', v_field, 'reason', 'row_not_found');
      CONTINUE;
    END IF;

    v_recorded := coalesce(v_rev.after -> v_field, 'null'::jsonb);
    IF v_live IS DISTINCT FROM v_recorded THEN
      v_skipped := v_skipped || jsonb_build_object(
        'field', v_field,
        'reason', 'value_moved_on',
        'expected', v_recorded,
        'live', v_live);
      CONTINUE;
    END IF;

    v_reverted := v_reverted || v_field;
    v_payload  := v_payload || jsonb_build_object(v_field, coalesce(v_rev.before -> v_field, 'null'::jsonb));
  END LOOP;

  IF cardinality(v_reverted) > 0 THEN
    -- The revert is a write worth recording, and attributing it to a person is
    -- the point of having a trail. auth.uid() is set (we are past the role
    -- gate) so the trigger files it as `human`; the actor names the reason.
    PERFORM set_config('app.actor', 'admin:revert', true);

    -- jsonb_populate_record does the cast, so this is correct for text, arrays,
    -- jsonb, enums and timestamps alike without a per-type branch to get wrong.
    SELECT string_agg(
             format('%1$I = (jsonb_populate_record(NULL::public.%2$I, $1)).%1$I', f, v_rev.source_table),
             ', ')
      INTO v_set
      FROM unnest(v_reverted) AS f;

    EXECUTE format('UPDATE public.%I SET %s WHERE id = $2', v_rev.source_table, v_set)
      USING v_payload, v_rev.source_id;
  END IF;

  RETURN jsonb_build_object(
    'revision_id', p_revision_id,
    'source_table', v_rev.source_table,
    'source_id', v_rev.source_id,
    'reverted', to_jsonb(v_reverted),
    'skipped', v_skipped
  );
END $$;

COMMENT ON FUNCTION public.content_revision_revert_fields(uuid, text[]) IS
  'Put named fields back to their pre-revision values. Refuses a field whose live value has moved since, rather than clobbering it. Admin/moderator only.';

REVOKE ALL ON FUNCTION public.content_revision_revert_fields(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_revision_revert_fields(uuid, text[]) TO authenticated;

-- ── Retention ───────────────────────────────────────────────────────────────
-- Human and declared revisions are kept: there are a handful a day and they are
-- the reason the trail exists. Machine revisions get a horizon — that is the
-- one place recording every write is traded away, and it is stated rather than
-- discovered later. At ~5k/day the steady state is roughly 270 MB, and the
-- space deleted is recycled by subsequent inserts.
CREATE OR REPLACE FUNCTION public.run_content_revision_prune(
  p_batch      integer DEFAULT 20000,
  p_keep_days  integer DEFAULT 90
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_deleted   bigint;
  v_remaining bigint;
BEGIN
  WITH doomed AS (
    SELECT id FROM public.content_revisions
     WHERE actor_kind = 'system'
       AND created_at < now() - make_interval(days => greatest(p_keep_days, 1))
     ORDER BY created_at
     LIMIT greatest(p_batch, 1)
  )
  DELETE FROM public.content_revisions r USING doomed d WHERE r.id = d.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*) INTO v_remaining
    FROM public.content_revisions
   WHERE actor_kind = 'system'
     AND created_at < now() - make_interval(days => greatest(p_keep_days, 1));

  RETURN jsonb_build_object('deleted', v_deleted, 'remaining', v_remaining, 'keep_days', p_keep_days);
END $$;

REVOKE ALL ON FUNCTION public.run_content_revision_prune(integer, integer) FROM PUBLIC, anon, authenticated;

INSERT INTO public.admin_automations
  (slug, name, description, schedule, trigger, managed_by, action, enabled, auto_pause_threshold)
VALUES (
  'content_revision_prune',
  'Prune machine content revisions',
  'Deletes system-actor content revisions older than 90 days. Human and declared revisions are never pruned — they are the record a revert reads.',
  '20 2 * * *',
  jsonb_build_object('type', 'schedule'),
  'system',
  jsonb_build_object(
    'type', 'rpc',
    'fn', 'run_content_revision_prune',
    'command', 'SELECT public.run_content_revision_prune(20000, 90);',
    'jobname', 'content_revision_prune'
  ),
  true,
  3
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = excluded.schedule, action = excluded.action, enabled = true;

SELECT cron.schedule(
  'content_revision_prune',
  '20 2 * * *',
  'SELECT public.run_content_revision_prune(20000, 90);'
);

DO $verify$
DECLARE v jsonb;
BEGIN
  -- Runs against today's data rather than asserting it will. Nothing is
  -- enabled yet, so this legitimately deletes nothing — what it proves is that
  -- the function exists, is callable, and returns the shape the cron expects.
  v := public.run_content_revision_prune(1, 90);
  IF NOT (v ? 'deleted' AND v ? 'remaining') THEN
    RAISE EXCEPTION 'run_content_revision_prune returned an unexpected shape: %', v;
  END IF;
  RAISE NOTICE 'content revision prune: %', v;

  -- A revert that anon could call would be a write path into every content
  -- table in the registry.
  IF has_function_privilege('anon', 'public.content_revision_revert_fields(uuid, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not be able to execute content_revision_revert_fields';
  END IF;
END $verify$;

COMMIT;
