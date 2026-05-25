-- Phase 1 follow-up — revoke direct EXECUTE on SECURITY DEFINER helpers from
-- client roles. Trigger fires happen under definer context regardless of grants
-- (triggers don't check EXECUTE), so revoking these is safe.
--
-- Pattern mirrors 20260524500003_security_lint_security_definer_revoke.sql.

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.emit_user_activity(uuid, text, text, uuid, jsonb, integer, timestamptz)',
    'public.on_user_activity_event_inserted()',
    'public.recompute_all_community_scores()',
    'public.tg_venue_checkin_emit_activity()',
    'public.tg_marketplace_favorite_emit_activity()',
    'public.tg_marketplace_review_emit_activity()',
    'public.tg_marketplace_guide_read_emit_activity()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || fn || ' FROM PUBLIC';
      EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || fn || ' FROM anon';
      EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || fn || ' FROM authenticated';
    EXCEPTION WHEN undefined_function THEN
      -- migration tolerates already-renamed/dropped signatures
      NULL;
    END;
  END LOOP;
END
$$;

-- recompute_user_community_score: keep accessible to authenticated, but only
-- for the caller's own user_id. Wrap in a thin RPC that enforces auth.uid().
CREATE OR REPLACE FUNCTION public.refresh_my_community_score()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  PERFORM public.recompute_user_community_score(auth.uid());
END
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_user_community_score(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_user_community_score(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recompute_user_community_score(uuid) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.refresh_my_community_score() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_my_community_score() FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_my_community_score() TO authenticated;
