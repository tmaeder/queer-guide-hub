-- Recovery shim: this migration was applied to the remote DB (via MCP apply_migration
-- by a concurrent session) but its file was never committed, causing db-push drift that
-- blocked all subsequent migrations. Content recovered verbatim from
-- supabase_migrations.schema_migrations(version='20260706175553'). Idempotent — already
-- present in remote history, so db push records the version match without re-running.

CREATE OR REPLACE FUNCTION public.search_conversation_messages(
  p_conversation_id uuid,
  p_query text,
  p_limit int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  content text,
  created_at timestamptz,
  sender_id uuid,
  sender_display_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.content,
    m.created_at,
    m.sender_id,
    p.display_name AS sender_display_name
  FROM public.messages m
  LEFT JOIN public.profiles p ON p.user_id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    AND public.is_conversation_participant(p_conversation_id, auth.uid())
    AND m.deleted_at IS NULL
    AND length(btrim(p_query)) >= 2
    AND m.content ILIKE '%' || btrim(p_query) || '%'
  ORDER BY m.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.search_conversation_messages(uuid, text, int) TO authenticated;
